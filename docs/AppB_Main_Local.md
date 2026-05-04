# APP B: MAIN LOCAL APP (Shop Server)

## 1. Overview
This is the core engine of the shop. It is a monolithic desktop application deployed on the shop's designated "Main System". It runs the database, serves the internal API, and provides the Manager's Desktop UI.

## 2. Technical Stack
*   **Shell**: Electron.
*   **Frontend**: React + Vite (Manager UI: Inventory, Complex Reports, Settings).
*   **Backend API**: Node.js + Express (Packaged alongside Electron).
*   **Database**: PostgreSQL (Installed natively on the OS).
*   **Remote Access**: Cloudflared (Daemon running as a child process of the Express API).

## 3. Core Responsibilities
1.  **First-Launch Activation**: Collects the License Key from the user, fetches the `hardware_id` of the local machine, and negotiates with App A (Cloud).
2.  **Database Bootstrapping**: Uses an ORM (like Prisma or TypeORM) to automatically run migrations and build the local database schema on first launch.
3.  **Local API Host**: Listens on `http://0.0.0.0:5000` to serve the local frontend (Manager UI), the Client Terminals (App C), and the Cloudflare Tunnel.
4.  **Client Licensing (App C)**: Acts as a local "Sub-License Server". It tracks how many App C terminals are connected and blocks connections that exceed the `max_systems_per_branch` limit defined in the Signed JWT it received from App A.

## 4. First-Launch Setup Sequence
1.  **Ping DB**: Electron starts backend. Backend attempts `pg_connect`.
2.  **Prompt Credentials**: If failed/empty, UI asks for Postgres User/Pass. Backend saves this to a local `.env` or encrypted config file.
3.  **Prompt License**: UI asks for License Key. Backend calls App A.
4.  **Save License JWT**: Backend receives JWT, verifies signature using a bundled public key, and saves it.
5.  **Migrate**: Backend runs `npx prisma db push` or similar to build all tables.
6.  **Seed**: UI prompts for "Shop Details" and "Super Admin Password". Backend hashes password and saves it.
7.  **Tunnel**: Backend spawns the Cloudflare Tunnel process pointing back to `localhost:5000`.

## 5. Draft Database Schema (Local Auth/License specific)
```sql
CREATE TABLE shop_config (
    id UUID PRIMARY KEY,
    shop_name VARCHAR(255) NOT NULL,
    branch_name VARCHAR(255) NOT NULL,
    license_jwt TEXT NOT NULL, -- Stored locally for offline verification
    setup_completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE authorized_clients (
    id UUID PRIMARY KEY,
    friendly_name VARCHAR(255) NOT NULL, -- e.g., "Counter 1"
    mac_address VARCHAR(255) UNIQUE NOT NULL,
    authorized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plus all standard business tables (Users, Products, Invoices, etc.)
```
