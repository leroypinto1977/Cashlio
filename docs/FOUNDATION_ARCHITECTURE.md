# FOUNDATION ARCHITECTURE (Phase 1)
**Project: Shop Management System (SaaS Edition)**

This document defines the bedrock architecture of the system. It focuses exclusively on the "Local-First" physical deployment, secure remote access, and the multi-system licensing strategy.

---

## 1. Physical Deployment Strategy

The system is designed to operate with absolute data sovereignty within the shop branch, ensuring 100% uptime regardless of internet connectivity.

### 1.1 The "Main System" (Branch Server)
Every shop branch designate **one** reliable PC as the "Main System". 
*   **PostgreSQL**: Installed and managed by the deployment team. Acts as the single source of truth for the branch.
*   **Express API Server**: A standalone Node.js process. It handles all business logic, talks to Postgres, and serves data.
*   **Electron UI**: The desktop application shell that renders the frontend (React) and communicates locally with the Express API (`http://localhost:<PORT>`).

### 1.2 "Client Systems" (Additional Billing Counters)
If a shop has multiple billing counters, these computers are "Client Systems".
*   **No Database/No API**: They do *not* run PostgreSQL or the Express server.
*   **Electron UI Only**: They run the Electron app, which is configured to connect to the Express API hosted on the "Main System" over the shop's local Ethernet LAN (e.g., `http://192.168.1.100:<PORT>`).

---

## 2. Secure Remote Access (Owner's Mobile App)

The owner requires remote access to sales data via a mobile app. 

### 2.1 The Cloudflare Tunnel Approach
To avoid exposing the "Main System" directly to the internet (which requires complex and insecure router port-forwarding):
1.  **Outbound Connection**: The Express API on the "Main System" runs a lightweight Cloudflare Tunnel daemon (`cloudflared`).
2.  **Secure Gateway**: This creates an outbound, encrypted tunnel to Cloudflare's edge network (e.g., `https://branch-api.shopms.com`).
3.  **Mobile Access**: The owner's Mobile App authenticates and connects to this Cloudflare URL, which securely funnels the request directly to the Express API running on the "Main System".
4.  **Result**: Military-grade security, zero open router ports, and real-time access to the local database.

---

## 3. SaaS Licensing & Activation

The software is sold as a SaaS product. License keys dictate the maximum number of branches and the maximum number of systems (terminals) per branch. 

*Note: The Central SaaS License Server is a cloud service managed by us, entirely separate from the shop's local data.*

### 3.1 The "First Launch" Setup Flow (Main System)

When the installation team boots the "Main System" for the first time:

1.  **Detection**: The Electron app starts, attempts to ping the local Express API, and realizes the database is empty/unconfigured.
2.  **Activation Screen**: Prompts for the **License Key** (purchased by the shop owner).
3.  **Online Verification**: The local Express API contacts the Central OS License Server over the internet to validate the key.
4.  **Hardware Binding**: The License Server records the unique Hardware ID (MAC address/Motherboard Serial) of this "Main System" to prevent the license from being copied to another PC.
5.  **Provisioning**: The Central Server responds with an encrypted **License Payload** (e.g., `max_branches: 1`, `max_clients: 3`).
6.  **Local Schema Setup**: The Express API automatically runs database migrations to create the required Postgres tables.
7.  **Account Setup**: The UI prompts the user to create the Global Admin account, define the Shop Name, and the Branch Name. This data is saved to the local Postgres DB.
8.  **Completion**: The system is now active. The License Payload is stored locally, allowing the system to boot completely offline in the future.

### 3.2 The "First Launch" Flow (Client Systems)

When a secondary billing computer is booted for the first time:

1.  **Mode Selection**: The Electron app asks: "Is this the Main Server or a Client Terminal?". User selects "Client Terminal".
2.  **Network Configuration**: The UI asks for the IP address of the "Main System" (e.g., `192.168.1.100`).
3.  **Client Authentication**: The Client app connects to the Main System. The Main System checks its local License Payload to see if a slot is available (e.g., 2 installed, max allowed is 3 -> Granted).
4.  **Hardware Binding**: The Main System records the Client's Hardware ID in its local database. The Client is now permanently authorized to connect to this Main System.

---

## 4. Development Repository Structure

To support this architecture, the codebase must strictly separate concerns:

```text
/ShopManagement
  ├── /backend            # Express API, Prisma/TypeORM, Business Logic
  ├── /frontend           # React, Vite, UI Components
  ├── /electron           # Main process, Window management, OS integrations
  └── /shared             # TypeScript interfaces shared between frontend & backend
```

*   **Rule**: The frontend UI NEVER talks directly to the database. It ALWAYS talks to the Express API via REST/GraphQL.
*   **Rule**: The Express API is completely agnostic to Electron. It doesn't know or care if it's being accessed by the local Electron shell, a Client System on the LAN, or the Owner's Mobile App via the Cloudflare Tunnel.
