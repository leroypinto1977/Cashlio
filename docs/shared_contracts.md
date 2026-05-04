# Shared API Contracts & Database Schema

This document serves as the single source of truth for the 3 AI agents working on `admin-saas`, `main-local`, and `billing-client`. 

---

## 1. Central SaaS Database (App A: `admin-saas`)

The central PostgreSQL database. Schema updated for `better-auth` integration and license revoking.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ----------------------------------------------------------------------
// BETTER AUTH CORE TABLES
// ----------------------------------------------------------------------
model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean
  image         String?
  createdAt     DateTime
  updatedAt     DateTime
  role          String?   // "SUPER_ADMIN", "SALES_AGENT", "SUPPORT_AGENT"
  sessions      Session[]
  accounts      Account[]

  @@map("user")
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime
  updatedAt DateTime
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime
  updatedAt             DateTime

  @@map("account")
}

// ----------------------------------------------------------------------
// SAAS BUSINESS LOGIC TABLES
// ----------------------------------------------------------------------

model Tenant {
  id           String    @id @default(uuid())
  ownerName    String
  companyName  String
  contactEmail String    @unique
  createdAt    DateTime  @default(now())
  licenses     License[]
}

model License {
  id                   String            @id @default(uuid())
  tenantId             String
  tenant               Tenant            @relation(fields: [tenantId], references: [id])
  licenseKey           String            @unique // e.g., SHP-XYZ1-ABC2-9988
  status               String            @default("PENDING") // PENDING, ACTIVE, EXPIRED, REVOKED
  
  // Capacity Limits
  maxBranches          Int               @default(1)
  maxSystemsPerBranch  Int               @default(3) // 5 device license, 10 device license, etc.
  
  // Lifecycle
  branchName           String?           // Set by App B upon activation
  validDurationDays    Int               @default(365) // Pre-set before activation
  activatedAt          DateTime?         // Set when App B activates
  expiresAt            DateTime?         // Calculated as activatedAt + validDurationDays
  createdAt            DateTime          @default(now())
  
  // Hardware Binding Tracking
  motherboardSerial    String?
  macAddress           String?
}
```

---

## 2. Local Branch Database (App B: `main-local`)

The local PostgreSQL database managed by Prisma running alongside the `main-local` Express/Electron app.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model ShopConfig {
  id               String   @id @default(uuid())
  shopName         String
  branchName       String
  licenseKey       String   @unique // The exact string e.g. SHP-XYZ1
  licenseJwt       String   @db.Text // The signed JWT from App A containing limits
  lastSyncedAt     DateTime @default(now()) // Used to periodically pull license upgrades
  setupCompletedAt DateTime @default(now())
}

model AuthorizedClient {
  id           String   @id @default(uuid())
  friendlyName String   // e.g., "Counter 1"
  macAddress   String   @unique
  authorizedAt DateTime @default(now())
  
  invoices     Invoice[] // Track all invoices from this device
}

model User {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String
  role         String   @default("CASHIER") // SUPER_ADMIN, MANAGER, CASHIER
  createdAt    DateTime @default(now())

  invoices     Invoice[] // Track all invoices this user made
}

// NOTE: DO NOT delete database tables on license upgrades! App B handles capacity changes via JWT updates.

model Invoice {
  id               String           @id @default(uuid()) // Uses robust UUIDs to prevent offline collision
  totalAmount      Decimal          @db.Decimal(10, 2)
  paymentMethod    String           @default("CASH") // CASH, CARD, UPI
  createdAt        DateTime         @default(now())

  // Offline Tracking: Which system made this bill?
  originDeviceId   String
  originDevice     AuthorizedClient @relation(fields: [originDeviceId], references: [id])
  
  // Who made it?
  cashierId        String
  cashier          User             @relation(fields: [cashierId], references: [id])
}
```

---

## 3. Activation Flow (App B -> App A)

App B needs to activate itself by talking to App A for the first time.

*   **Endpoint**: `POST https://<admin-saas-url>/api/v1/licenses/activate` (App A)
*   **Request Body**:
    ```json
    {
      "licenseKey": "SHP-XYZ1-ABC2-9988",
      "hardwareId": "AA:BB:CC:DD:EE:FF" // MAC or Motherboard Serial
    }
    ```
*   **Response Body** (Success 200 OK):
    ```json
    {
      "success": true,
      "jwt": "ey..." // Signed JWT from Server containing { maxBranches, maxSystemsPerBranch, expiresAt }
    }
    ```

---

## 4. License Syncing / Upgrade Flow (App B -> App A)

For handling capacity bumps (e.g. 5 terminals to 10 terminals without data loss), App B will periodically call this endpoint to fetch an updated JWT if the Admin made changes in App A.

*   **Endpoint**: `POST https://<admin-saas-url>/api/v1/licenses/sync` (App A)
*   **Request Body**:
    ```json
    {
      "licenseKey": "SHP-XYZ1-ABC2-9988",
      "hardwareId": "AA:BB:CC:DD:EE:FF" 
    }
    ```
*   **Response Body**: Either identical JWT, or a new JWT with updated `maxSystemsPerBranch`.

---

## 5. Client Pairing Flow (App C -> App B)

App C needs to pair with App B on the LAN.

*   **Endpoint**: `POST http://<main-local-ip>:<port>/api/v1/system/pair-client` (App B)
*   **Request Body** (from App C):
    ```json
    {
      "macAddress": "11:22:33:44:55:66",
      "friendlyName": "Front Desk Billing"
    }
    ```
*   **Response**: `200 OK` (Authorized), or `403 Forbidden` (`LICENSE_LIMIT_REACHED` if JWT says max 5 systems and this is system #6).
