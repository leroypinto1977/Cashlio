# App B (Main Local) & App C (Billing Client) Flow & Architecture

This document breaks down the end-to-end usage flow for the physical shop applications. It covers initialization, authentication, and the robust offline-fallback architecture.

---

## 1. App B: First-Launch Initialization (The "Branch Head")

When the deployment team or shop owner installs **App B (Main Local)** on the central server PC and runs it for the first time:

### 1.0. Splash Screen
*   **Action**: A sleek "Cashlio" logo splash screen fades in for exactly 3 seconds to establish branding.
*   **Transition**: Fades out seamlessly into the License Activation Screen.

### 1.1. License Activation Screen
*   **Action**: The UI displays a form asking for ONLY the:
    *   `License Key` (provided by the SaaS Admin)
*   **Network Required**: Yes. It must ping App A (`POST /api/v1/licenses/activate`).
*   **Result**: App A verifies the key, updates status to `ACTIVE`, and returns the JWT config payload. App B saves this payload securely to its local PostgreSQL database.

### 1.2. Shop Profile & Super Admin Setup Screen
*   **Action**: Now that it's licensed, the UI prompts for:
    *   `Branch Name` (e.g., "Downtown Electronics" - THIS IS SENT TO APP A)
    *   `Shop Name`
    *   `Location/Address`
    *   `GST/Tax ID`
    *   **Admin Account**: `Username`, `Password`, & `Confirm Password`.
*   **Result**: 
    *   App B calls App A (`POST /api/v1/licenses/update-profile`) to sync the `Branch Name` back to the central SaaS database.
    *   App B hashes the password and creates the local `User` with role `SUPER_ADMIN`. 
    *   The setup is now 100% complete and App B operates as the Local API Hub.

---

## 2. App B: Central Dashboard & Device Management

Once initialized, logging into App B with the Super Admin account opens the Manager Dashboard.

### 2.1. Managing Staff / Cashiers
*   The Super Admin can create additional local accounts with roles like `CASHIER` or `MANAGER`. 
*   These are stored purely in App B's local database. App A (SaaS) does not know or care about these users.

### 2.2. Managing Billing Clients (App C)
*   The dashboard has a "Devices" tab.
*   Here, the Admin can see a list of connected App C terminals. If the SaaS license says `maxSystemsPerBranch: 5`, they can see how many slots are used.
*   They can **Revoke** a device here (e.g., if a terminal is stolen), freeing up a slot for a new PC.

---

## 3. App C: First-Launch Initialization (The Cashier Terminal)

When App C is installed on a new checkout counter PC:

### 3.1. Network Discovery Screen
*   **Action**: The UI asks: "Enter the IP Address of the Main Server" (e.g., `192.168.1.100:5000`).
*   **Pairing**: App C makes a `POST /pair-client` request to App B, sending its own MAC Address.
*   **Result**: 
    *   If App B has an open license slot, it says "Success" and registers the MAC address. 
    *   App C saves the `Main_Server_IP` to its local `.env` or `localStorage`. **It will never ask for this IP again.**

---

## 4. App C: Daily Usage & Authentication

When the cashier opens App C every morning:

### 4.1. The Login Flow
*   App C immediately pings App B. 
*   It displays a standard Cashier Login screen (`Username` & `Password`).
*   The cashier logs in. App B validates the local credentials and returns a Session JWT.

### 4.2. Inactivity Lock (1-Hour Challenge)
*   If App C detects absolutely no mouse/keyboard interaction for **1 Hour**, it automatically locks the screen.
*   It displays a "Session Paused: Enter Password to Resume" overlay. The cashier types their password, App C validates via App B, and unlocks the screen.

---

## 5. Offline Fallback Architecture (The "Safe Mode")

What happens if the internal Wi-Fi breaks, or App B crashes completely, but customers are still in line waiting to pay?

### 5.1. The "Emergency Offline Account"
Because App C cannot talk to App B's database when the network is down, standard authentication fails.
*   **Solution**: During the initial pairing (Step 3.1), App B securely transmits an **encrypted Emergency Hash** representing a specific "Offline Cashier" account to App C, which App C stores locally.
*   When App C detects it cannot reach App B, it shows an **Offline Warning Banner** in the UI. 
*   If the cashier attempts to log in, App C compares the password against the local Emergency Hash. If valid, they enter "Safe Mode".

### 5.2. Offline Cashing & Syncing
*   In Safe Mode, App C uses a lightweight, in-memory or embedded generic database (like SQLite or IndexedDB) to temporarily store invoices.
*   **Product Catalog Cache**: Every time App C successfully logs into App B during normal operation, it silently downloads a lightweight cache of the Product Catalog/Prices to local IndexedDB. In Safe Mode, it uses this cache to scan barcodes.
*   **Reconnection Sync**: App C constantly polls App B in the background. The moment App B comes back online, App C automatically executes a `POST /sync-offline-invoices` push, dumping all the temporary local receipts into App B's main PostgreSQL database.
