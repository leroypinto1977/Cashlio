# Final End-To-End Master Plan & Edge Cases

This plan solidifies the entire Cashlio ecosystem flow, explicitly handling edge cases and strictly defining the UI requirements across App A, App B, and App C.

---

## 1. Global UI/UX Requirements
*   **Design System**: All three applications MUST use **Tailwind CSS + Shadcn UI**. 
*   **Component Generation**: Agents should utilize standard Shadcn UI components (`button`, `dialog`, `table`, `form`, `toast`, etc.) or use the **Shadcn MCP** if available to scaffold complex layouts.
*   **Authentication**: Forms must use `react-hook-form` + `zod` for strict client-side validation to prevent bad DB states.

---

## 2. Unhandled Edge Cases & Solutions

### Edge Case 1: App C Cache Invalidations
*   *Problem*: App C downloads the Product Catalog cache for Safe Mode. If App B updates a product price, App C's cache is stale.
*   *Solution*: Every successful 1-Hour Login or manual unlock on App C triggers a silent background `GET /catalog/sync`. App B returns a hashing checksum of the catalog. If it differs from App C's local IndexedDB hash, it downloads the fresh catalog.

### Edge Case 2: Offline Receipt ID Collisions
*   *Problem*: If 3 App C terminals are in Safe Mode, they might all generate `Invoice #101` locally. When Wi-Fi returns, they all push `101` to App B, causing database collisions.
*   *Solution*: App C must use **UUIDv4** for all offline-generated invoices instead of sequential auto-incremented integers. When syncing to App B, Postgres accepts the UUIDs seamlessly.

### Edge Case 3: Failed Syncs on Reconnection
*   *Problem*: Wi-Fi returns, App C pushes 50 offline receipts to App B, but 2 of them fail validation due to deleted products.
*   *Solution*: The `POST /sync-offline-invoices` endpoint on App B must be completely atomic (using Prisma Transactions). It either accepts all 50, or rejects the batch, allowing App C to keep them in the UI "Sync Queue" so the Manager can manually intervene.

---

## 3. The Agent Prompts

To execute this architecture flawlessly, you will copy/paste the following prompts to your three individual agents.

### Prompt for `admin-saas` Agent (App A)
```text
I am providing you the final architecture for our License Management System. 
1. Read `../docs/admin_saas_plan.md` and `../docs/shared_contracts.md`.
2. App A must be built using Next.js 16 App Router, Tailwind, and strict Shadcn UI components. Use the Shadcn MCP if helpful.
3. First, set up Prisma with the Better-Auth schema and the `Tenant`/`License` tables.
4. Build the `/login` page using Better-Auth.
5. Build the `/dashboard` layout with a Sidebar.
6. Create the "Tenants" page with a Data Table. Add a "Create Tenant" Dialog form.
7. Create the Tenant Details page. Add a "Generate License Key" Dialog form. Generating a key creates a blank UUID string in the DB with status PENDING and the required max limits.
8. Implement the `POST /api/v1/licenses/activate` route handler exactly as defined in the shared contracts.
Stop and ask for review once you have the DB, Auth, and basic UI wireframes running.
```

### Prompt for `main-local` Agent (App B)
```text
I am providing you the final architecture for our Local Branch Server.
1. Read `../docs/app_b_c_flow.md` and `../docs/shared_contracts.md`.
2. App B is an Electron + Vite + React app. You MUST use Tailwind and Shadcn UI components for everything. `electron` is currently ^39.2.6 which is perfect.
3. First, set up the local Express API within the Electron main process and configure local PostgreSQL with Prisma.
4. Build the First-Launch Activation UI (Screen 1):
   - Show a minimalist "Cashlio" Splash Screen for exactly 3 seconds.
   - Fade into a form asking ONLY for the Blank License Key.
   - `POST` this key to `http://localhost:3000/api/v1/licenses/activate` (App A) to authenticate it and get the config JWT.
5. Build the Shop Profile UI (Screen 2):
   - Ask for Branch Name, Shop details, and Admin credentials.
   - Create the Super Admin account locally.
   - `POST` the Branch Name to `http://localhost:3000/api/v1/licenses/update-profile` (App A) to sync back up.
6. Build the Manager Dashboard with a Sidebar. Ensure there is a "Devices" tab that lists connected App C clients.
7. Implement `POST /api/v1/system/pair-client`. Verify the max system limit inside the saved JWT before allowing a new App C MAC address.
Stop and ask for review once the Splash Screen -> Activation -> Profile Sync flow is working.
```

### Prompt for `billing-client` Agent (App C)
```text
I am providing you the final architecture for our Cashier Terminal.
1. Read `../docs/app_b_c_flow.md` and `../docs/shared_contracts.md`.
2. App C is an Electron + Vite app. You MUST use Tailwind and Shadcn UI components. Use the Shadcn MCP if helpful. `electron` is currently ^39.2.6 which is perfect.
3. First-Launch UI: Show a minimalist "Cashlio" Splash Screen for exactly 3 seconds, then naturally fade into the Network Discovery Screen asking for the Main Server IP (e.g., 192.168.1.100:5000). Save this IP locally.
4. Use Axios to call `POST /pair-client` on that IP.
5. If paired, build a sleek Cashier Login screen. Call `POST /auth/login` on the Main Server.
6. The UI must have a 1-Hour idle timeout that sets an `isLocked` state, overlaying a password prompt.
7. Build the Offline "Safe Mode" architecture: Store product catalogs in local IndexedDB. If Axios fails to reach the Main Server, switch the UI to "Safe Mode", use local IndexedDB for operations, and prepare UUID-based invoices to flush when reconnected.
Stop and ask for review once the Splash Screen and IP Discovery are built. 
```
