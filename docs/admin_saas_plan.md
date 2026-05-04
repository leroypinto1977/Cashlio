# App A (Admin SaaS): UI & Authentication Plan

This document details the architecture, authentication, and user interface requirements for the **Admin SaaS Dashboard (`/admin-saas`)**. 
This application manages customers (Tenants), generates blank License Keys for physical shops, and provides an activation endpoint for App B.

## 1. Authentication Strategy (Better Auth & RBAC)

Because our staff requires different access levels, we are using [Better Auth](https://better-auth.com/) instead of NextAuth.

*   **Library**: `better-auth`.
*   **Database Updates**: Better Auth requires specific schema tables (`User`, `Session`, `Account`). We will use Prisma as the adapter.
*   **Roles & Permissions (RBAC)**:
    *   `SUPER_ADMIN`: Can do anything, including managing other staff accounts.
    *   `SALES_AGENT`: Can create Tenants and generate new License Keys, but cannot revoke keys or delete tenants.
    *   `SUPPORT_AGENT`: Can view keys and click "Reset Hardware Binding" to allow a shop to move to a new Windows PC, but cannot create new keys.

---

## 2. Core UI Layout & Theming

*   **Theme**: Dark mode by default (SaaS aesthetic), using Tailwind CSS + Shadcn UI.
*   **Navigation**: A persistent left-hand Sidebar (`Sidebar` component) with the following links:
    *   📊 Dashboard
    *   🏢 Tenants (Customers)
    *   🔑 Licenses
    *   🛡️ Staff Management (Super Admin only)
    *   ⚙️ Settings
*   **Components Needed (Shadcn)**: `button`, `input`, `table`, `dialog`, `dropdown-menu`, `card`, `toast`, `form`, `badge`, `select`.

---

## 3. End-to-End User Flow (Generating & Managing Keys)

### 3.1. Tenant Registration
The SaaS is designed so that eventually, customers will sign up on a public landing page and pay via Stripe. 
*   **For Now**: Internal staff clicks "Add Tenant" on the `/dashboard/tenants` page.
*   **Data Captured**: `Owner Name`, `Company Name`, `Contact Email` (No billing info needed yet).

### 3.2. Blank Key Generation
1.  Staff navigates to a Tenant's page and clicks **"Generate License Key"**.
2.  **Form Inputs**: 
    *   `Max Branches`: (Usually 1. If 1 key = 1 branch, always 1).
    *   `Max Terminals Allowed`: (e.g., 5-device license or 10-device license).
    *   `Validity Duration`: (e.g., 1 Year from activation).
3.  **Result**: The system generates a cryptographically random, blank string (e.g., `SHP-A1B2-C3D4-E5F6`). It has no hardware attached and its status is `PENDING`.

### 3.3. Activation (By App B)
1.  The owner installs App B at their shop.
2.  App B asks for the License Key. The owner enters it along with a `Branch Name` (e.g., "Downtown Electronics").
3.  App B hits the `POST /api/v1/licenses/activate` endpoint on App A.
4.  App A binds the shop's `Hardware MAC` to the key, updates the License's `branchName`, marks it `ACTIVE`, and starts the 1-year countdown.

### 3.4. Hardware Resets (Support Flow)
If a shop's main computer dies and they buy a new one:
1.  A Support Agent searches for the shop's active License in `admin-saas`.
2.  They click **"Reset & Issue New Key"**.
3.  **System Logic**: 
    *   The old key is marked `REVOKED` (preventing the old crashed PC from ever syncing if it turns back on).
    *   A completely **NEW** blank License Key is generated, carrying over the original expiration date and terminal limits.
    *   The owner types the NEW key into their new computer, activating it.

### 3.5. License Upgrades (Sales Flow)
If an owner with a 5-device license pays to upgrade to a 10-device license mid-year:
1.  A Sales Agent finds the active License.
2.  They click **"Upgrade License Capacity"**.
3.  They change the `Max Terminals Allowed` from 5 to 10.
4.  **System Logic**:
    *   App A updates the database record.
    *   *Crucial Sync Design*: App B is offline-first. Therefore, App B must periodically "Ping" App A (e.g., once every 24 hours when online, or via a manual "Refresh License" button in App B's settings) to pull down the newly updated JWT token with the `10` limit. This ensures the shop's local PostgreSQL database is never dropped or broken.
