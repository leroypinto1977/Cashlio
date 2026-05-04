# PHASE 1: IMPLEMENTATION PLAN & SETUP FLOW
**Core Goal:** Build the foundation of the ShopMS platform by establishing the licensing system, the central server setup, and the client billing terminal connections.

---

## 1. The Three Applications
To achieve the secure, licensed, local-first architecture, Phase 1 requires building **three distinct applications**:

### App A: The Admin SaaS Dashboard (Cloud)
*   **Purpose**: Used ONLY by our team (the software provider) to manage licenses and customers.
*   **Tech Stack**: Next.js (or Vite/React) + Node.js/Express + Central Postgres DB.
*   **Actions**: Create customers, generate License Keys, set validity periods (e.g., 1 Year), set constraints (Max Branches, Max Terminals).

### App B: The "Main App" (Local Branch Server)
*   **Purpose**: Installed on the single designated server computer inside the shop.
*   **Tech Stack**: Electron (for UI) + Packaged Express API + Local Postgres DB.
*   **Actions**: Activates the license, creates the local database schema, acts as the API host for the entire shop, and provides the "Manager/Owner" Desktop UI.

### App C: The "Billing App" (Local Client Terminal)
*   **Purpose**: Installed on the lightweight billing computers at the front checkout counter.
*   **Tech Stack**: Electron ONLY (No local database, no local API).
*   **Actions**: Connects to the "Main App" over the shop's Wi-Fi/LAN to process sales and receipts.

---

## 2. Setup Flow 1: License Generation (App A)
1.  **Our Admin** logs into the Admin SaaS Dashboard (App A).
2.  Creates a new `Customer` profile (e.g., "M/S Electricals").
3.  Generates a **License Key**.
    *   *Parameters*: `duration: 365_days`, `max_terminals: 3`, `max_branches: 1`.
4.  The system generates a unique Key (e.g., `SHP-XYZ1-ABC2-9988`) and saves it in the Central Cloud DB with status `PENDING_ACTIVATION`.

---

## 3. Setup Flow 2: The Main App Initialization (App B)
*Prerequisite: The deployment team has installed PostgreSQL on the shop's server PC.*

1.  **Launch**: the team opens the "Main App" (App B).
2.  **Detection**: The App detects that the local database is empty/uninitialized.
3.  **Activation Screen**: The UI displays a secure form: "Enter License Key & Database Credentials".
    *   Requires: License Key (`SHP-XYZ1-ABC2-9988`), Postgres User, Postgres Password.
4.  **Verification**: The internal Express API makes a secure HTTPS call to the Admin SaaS Cloud.
5.  **Hardware Lock**: The Cloud validates the key and permanently binds it to the Main App PC's motherboard/MAC address. The key status in the cloud becomes `ACTIVE`.
6.  **Local Provisioning**:
    *   The Central Cloud sends back a signed **JWT License Token**.
    *   The Main App's Express API connects to local Postgres and runs all database migrations (creates `users`, `invoices`, `products` tables).
    *   It securely saves the `JWT License Token` into the local DB.
7.  **Admin Creation**: The UI prompts the shop owner to create their local "Super Admin" account (Username & Password) and define the "Shop Name".
8.  **Completion**: The Main App is now fully functional and the Express API begins listening for local LAN connections.

---

## 4. Setup Flow 3: The Billing App Connection (App C)
*Prerequisite: The "Main App" (App B) is running and active on the same Wi-Fi/Ethernet network.*

1.  **Launch**: The cashier turns on the billing computer and opens the "Billing App" (App C).
2.  **Network Config**: The first screen displays: "Enter Main Server Address" (e.g., `192.168.1.100:5000`).
3.  **Handshake**: The Billing App attempts to connect.
4.  **License Check**: The Main App (App B) receives the request. It checks its local `JWT License Token`: "Is this shop allowed more than 1 terminal?" (Yes, max is 3).
5.  **Device Pairing**: The Main App records the MAC address of the Billing Computer in its local database as an "Authorized Terminal".
6.  **Login Screen**: The Billing App now displays the standard User Login screen. The cashier logs in (verifying against the Main App's local Postgres DB).
7.  **Completion**: The cashier can now start billing.

---

## 5. Development Milestones for Phase 1
1.  **M1: License Server**: Build the simple Admin SaaS cloud API to generate and validate keys.
2.  **M2: Main App Shell**: Build the Electron + Express wrapper that handles the License verification and local Postgres migrations.
3.  **M3: Billing App UI**: Build the lightweight Client Electron app that handles the LAN IP configuration and handshake.
4.  **M4: Authentication**: Establish secure JWT login for the cashiers on the Client App connecting to the Main App.
