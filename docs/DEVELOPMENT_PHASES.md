# Cashlio — Full Development Phases

**Architecture Reminder:**

- **App B (main-local)**: Electron desktop — runs the Express API + Manager UI. All data lives here.
- **App C (billing-client)**: Electron desktop — connects to App B over LAN. Shows the identical inner UI.
- **Both apps share the same inner UI.** Role determines what each user sees. Only the app shell header differs.
- **Roles (Phase 1 scope):** `SUPER_ADMIN`, `CASHIER`. More roles added progressively per phase.

---

## App Shell Architecture

Both App B and App C render an identical inner layout. The only part that differs is the **top shell header**.

### App B Shell Header (main-local — Manager)

| Slot   | Content                                                                   |
| ------ | ------------------------------------------------------------------------- |
| Left   | Shop name + branch name (from `ShopConfig`)                               |
| Center | Active screen title                                                       |
| Right  | Notification bell (Phase 8) · Logged-in user name + role badge · Sign Out |

### App C Shell Header (billing-client — Terminal)

| Slot   | Content                                                         |
| ------ | --------------------------------------------------------------- |
| Left   | Terminal name (from `localStorage.terminalName`)                |
| Center | Server connection status (green/red dot + IP:port) · live clock |
| Right  | Cashier name + avatar · Sign Out                                |

### Shared Sidebar Navigation

Both apps show the same left sidebar. Items are conditionally shown based on role and phase availability.

| Nav Item        | Phases | Roles              |
| --------------- | ------ | ------------------ |
| Dashboard       | All    | All                |
| New Bill        | 3A+    | All                |
| Bills           | 3A+    | All                |
| Customers       | 2B+    | All                |
| Products        | 2A+    | All                |
| Suppliers       | 2A+    | SUPER_ADMIN        |
| Inventory       | 2A+    | All                |
| Purchase Orders | 4+     | SUPER_ADMIN        |
| Warranties      | 5+     | All                |
| Staff           | 6+     | SUPER_ADMIN        |
| Expenses        | 7+     | All                |
| Reports         | 9+     | All (scope varies) |
| Settings        | All    | SUPER_ADMIN        |

### React Router v7 Route Map (both apps)

Routes grow with each phase. The full target route tree:

```
/                         → redirect based on auth state
/setup                    → App C only — pair with server
/login                    → Cashier login
/dashboard                → Main KPI dashboard (Phase 9 enriches this)
/bills                    → Bills list
/bills/new                → New bill form
/bills/:id                → Bill detail / receipt
/customers                → Customers list
/customers/:id            → Customer profile
/products                 → Products list
/products/:id             → Product detail
/suppliers                → Suppliers list
/inventory                → Stock overview
/orders                   → Purchase orders list
/orders/:id               → Order detail
/warranties               → Warranties list
/warranties/:id           → Warranty detail
/staff                    → Staff list
/staff/:id                → Staff profile + attendance
/expenses                 → Expenses list
/reports/sales            → Sales report
/reports/profit           → Profit report
/reports/outstanding      → Outstanding / receivables
/reports/inventory        → Inventory report
/reports/expenses         → Expense report
/reports/staff            → Staff report
/settings                 → Shop settings, user management
```

### Auth Token Flow

- **App B** stores manager login token in `localStorage.managerToken`
- **App C** stores cashier login token in `localStorage.cashierToken`
- Both send `Authorization: Bearer <token>` header on every API request
- JWT payload contains `{ userId, role, shopId }` — role drives UI visibility

---

## ✅ Phase 1 — Foundation (COMPLETE)

**What was built:**

- License activation (App B proxies to App A, stores signed JWT)
- Shop profile setup + Super Admin account creation (bcrypt passwords)
- Hardware MAC address binding
- Cashier login with JWT session tokens
- App C pairing with terminal naming (stored in App B DB)
- Manager dashboard shell (Overview, Devices tab)
- Cashier dashboard shell (post-login screen)

**Database models in use:** `ShopConfig`, `User`, `AuthorizedClient`, `Invoice` (stub)

---

## Phase 2 — Core Data Foundation

**Goal:** Establish the master data that everything else depends on — products, suppliers, customers, and basic inventory. No billing yet, just management of the core records.

### 2A — Product & Supplier Management

**New Prisma Models:**

```prisma
model Category {
  id        String    @id @default(uuid())
  name      String    @unique
  createdAt DateTime  @default(now())
  products  Product[]
}

model Supplier {
  id            String           @id @default(uuid())
  name          String
  contactPerson String?
  phone         String
  email         String?
  address       String?
  gstin         String?
  isActive      Boolean          @default(true)
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  products      ProductSupplier[]
  purchaseOrders PurchaseOrder[]
}

model Product {
  id                 String           @id @default(uuid())
  name               String
  description        String?
  sku                String           @unique
  categoryId         String
  category           Category         @relation(fields: [categoryId], references: [id])
  purchaseRate       Decimal          @db.Decimal(10, 2)
  sellingRate        Decimal          @db.Decimal(10, 2)
  transportCharges   Decimal          @db.Decimal(10, 2) @default(0)
  warrantyPeriodDays Int              @default(0)
  gstPercentage      Decimal          @db.Decimal(5, 2)  @default(0)
  minStockLevel      Int              @default(0)
  defaultStockLevel  Int              @default(0)
  isActive           Boolean          @default(true)
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt
  suppliers          ProductSupplier[]
  inventory          InventoryItem?
  orderItems         PurchaseOrderItem[]
  billItems          BillItem[]
  warranties         Warranty[]
}

model ProductSupplier {
  id           String   @id @default(uuid())
  productId    String
  product      Product  @relation(fields: [productId], references: [id])
  supplierId   String
  supplier     Supplier @relation(fields: [supplierId], references: [id])
  supplierRate Decimal  @db.Decimal(10, 2)
  isDefault    Boolean  @default(false)
  leadTimeDays Int      @default(0)

  @@unique([productId, supplierId])
}

model InventoryItem {
  id               String   @id @default(uuid())
  productId        String   @unique
  product          Product  @relation(fields: [productId], references: [id])
  quantity         Int      @default(0)
  reservedQuantity Int      @default(0)
  lastUpdatedAt    DateTime @updatedAt
}
```

**API Endpoints (App B server.ts):**

| Method | Path                             | Access      | Description                       |
| ------ | -------------------------------- | ----------- | --------------------------------- |
| GET    | `/api/v1/categories`             | All         | List all categories               |
| POST   | `/api/v1/categories`             | SUPER_ADMIN | Create category                   |
| GET    | `/api/v1/suppliers`              | All         | List all suppliers                |
| POST   | `/api/v1/suppliers`              | SUPER_ADMIN | Create supplier                   |
| PUT    | `/api/v1/suppliers/:id`          | SUPER_ADMIN | Update supplier                   |
| DELETE | `/api/v1/suppliers/:id`          | SUPER_ADMIN | Soft-delete (isActive=false)      |
| GET    | `/api/v1/products`               | All         | List all active products          |
| GET    | `/api/v1/products/:id`           | All         | Get single product with inventory |
| POST   | `/api/v1/products`               | SUPER_ADMIN | Create product                    |
| PUT    | `/api/v1/products/:id`           | SUPER_ADMIN | Update product                    |
| DELETE | `/api/v1/products/:id`           | SUPER_ADMIN | Soft-delete                       |
| GET    | `/api/v1/products/:id/suppliers` | All         | List suppliers for product        |
| POST   | `/api/v1/products/:id/suppliers` | SUPER_ADMIN | Link supplier to product          |

**UI Screens (both App B and App C):**

- **Products list** — searchable/filterable table, stock level indicators (green/yellow/red)
- **Product detail** — rates, warranty info, linked suppliers, current stock
- **Add/Edit Product form** — with category, rates, GST%, warranty, stock thresholds
- **Suppliers list** — table with contact info, linked products count
- **Add/Edit Supplier form**
- **Categories management** — simple list with add/edit

**Role Access:**

- `SUPER_ADMIN`: Full CRUD on all
- `CASHIER`: Read-only (view products and rates for billing reference)

---

### 2B — Customer Management

**New Prisma Models:**

```prisma
model Customer {
  id          String              @id @default(uuid())
  name        String
  phone       String
  email       String?
  address     String?
  gstin       String?
  isGst       Boolean             @default(false)
  creditLimit Decimal             @db.Decimal(10, 2) @default(0)
  creditDays  Int                 @default(0)
  notes       String?             @db.Text
  isActive    Boolean             @default(true)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  bills       Bill[]
  payments    Payment[]
  followUps   CustomerFollowUp[]
}

model CustomerFollowUp {
  id             String   @id @default(uuid())
  customerId     String
  customer       Customer @relation(fields: [customerId], references: [id])
  note           String   @db.Text
  followUpDate   DateTime?
  isResolved     Boolean  @default(false)
  createdByUserId String
  createdBy      User     @relation(fields: [createdByUserId], references: [id])
  createdAt      DateTime @default(now())
}
```

**API Endpoints:**

| Method | Path                                      | Access               | Description                               |
| ------ | ----------------------------------------- | -------------------- | ----------------------------------------- |
| GET    | `/api/v1/customers`                       | All                  | List customers (with outstanding balance) |
| GET    | `/api/v1/customers/:id`                   | All                  | Full profile + bill history + outstanding |
| POST   | `/api/v1/customers`                       | SUPER_ADMIN, CASHIER | Create customer                           |
| PUT    | `/api/v1/customers/:id`                   | SUPER_ADMIN          | Update customer                           |
| DELETE | `/api/v1/customers/:id`                   | SUPER_ADMIN          | Soft-delete                               |
| GET    | `/api/v1/customers/:id/outstanding`       | All                  | Aggregate unpaid amount (GST + non-GST)   |
| POST   | `/api/v1/customers/:id/followups`         | All                  | Add follow-up note                        |
| PUT    | `/api/v1/customers/followups/:id/resolve` | All                  | Mark follow-up resolved                   |

**UI Screens:**

- **Customers list** — search by name/phone, shows outstanding balance badge
- **Customer profile** — contact info, credit info, bill history, follow-ups timeline, outstanding summary
- **Add/Edit Customer form** — GST/non-GST toggle, credit limit, credit days
- **Follow-up panel** — add note, set follow-up date, mark resolved

**Role Access:**

- `SUPER_ADMIN`: Full CRUD, can set credit limits
- `CASHIER`: Create customer, view profiles, add follow-ups (no delete, no credit limit change)

---

## Phase 3 — Billing & Payments

**Goal:** Full billing workflow — create bills, handle GST/non-GST, partial payments, credit bills with OTP, payment collection and approval.

### 3A — Billing

**New Prisma Models:**

```prisma
model Bill {
  id                 String           @id @default(uuid())
  billNumber         String           @unique
  customerId         String
  customer           Customer         @relation(fields: [customerId], references: [id])
  cashierId          String
  cashier            User             @relation(fields: [cashierId], references: [id])
  authorizedClientId String?
  terminal           AuthorizedClient? @relation(fields: [authorizedClientId], references: [id])
  billDate           DateTime         @default(now())
  subtotal           Decimal          @db.Decimal(10, 2)
  discountAmount     Decimal          @db.Decimal(10, 2) @default(0)
  taxAmount          Decimal          @db.Decimal(10, 2) @default(0)
  totalAmount        Decimal          @db.Decimal(10, 2)
  paidAmount         Decimal          @db.Decimal(10, 2) @default(0)
  status             String           @default("PAID") // PAID | PARTIAL | CREDIT
  paymentMethod      String           @default("CASH") // CASH | CARD | UPI | CREDIT
  otpVerified        Boolean          @default(false)
  notes              String?          @db.Text
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt
  items              BillItem[]
  payments           Payment[]
  warranties         Warranty[]
}

model BillItem {
  id               String   @id @default(uuid())
  billId           String
  bill             Bill     @relation(fields: [billId], references: [id])
  productId        String
  product          Product  @relation(fields: [productId], references: [id])
  quantity         Int
  purchaseRate     Decimal  @db.Decimal(10, 2)
  transportCharges Decimal  @db.Decimal(10, 2)
  sellingRate      Decimal  @db.Decimal(10, 2)
  discountAmount   Decimal  @db.Decimal(10, 2) @default(0)
  taxPercentage    Decimal  @db.Decimal(5, 2)
  taxAmount        Decimal  @db.Decimal(10, 2)
  totalAmount      Decimal  @db.Decimal(10, 2)
  profit           Decimal  @db.Decimal(10, 2)
}
```

**API Endpoints:**

| Method | Path                       | Access               | Description                                         |
| ------ | -------------------------- | -------------------- | --------------------------------------------------- |
| GET    | `/api/v1/bills`            | All                  | List bills (filterable by date, status, customer)   |
| GET    | `/api/v1/bills/:id`        | All                  | Full bill detail with items                         |
| POST   | `/api/v1/bills`            | CASHIER, SUPER_ADMIN | Create bill (validates stock, decrements inventory) |
| PUT    | `/api/v1/bills/:id/status` | SUPER_ADMIN          | Override bill status                                |
| POST   | `/api/v1/bills/otp/send`   | CASHIER, SUPER_ADMIN | Send OTP to customer for credit bill                |
| POST   | `/api/v1/bills/otp/verify` | CASHIER, SUPER_ADMIN | Verify OTP, allow credit bill creation              |

**UI Screens:**

- **New Bill screen** — customer search/select (shows outstanding), product search with quantity, editable rates, running total, payment method selector, submit with OTP flow for credit
- **Bills list** — filterable table, status badges (Paid/Partial/Credit), total amounts
- **Bill detail / receipt** — full breakdown, payment history, print/export

**External Dependency:** SMS/WhatsApp OTP provider (Twilio, MSG91, or 2Factor) for credit bill verification.

**Role Access:**

- `SUPER_ADMIN`: Full access including rate overrides and status changes
- `CASHIER`: Create bills, send/verify OTP, view own bills

---

### 3B — Payment Collection

**New Prisma Models:**

```prisma
model Payment {
  id                String   @id @default(uuid())
  billId            String
  bill              Bill     @relation(fields: [billId], references: [id])
  customerId        String
  customer          Customer @relation(fields: [customerId], references: [id])
  amount            Decimal  @db.Decimal(10, 2)
  paymentDate       DateTime @default(now())
  method            String   // CASH | CARD | UPI | CHEQUE
  referenceNumber   String?
  collectedByUserId String
  collectedBy       User     @relation("PaymentCollector", fields: [collectedByUserId], references: [id])
  approvedByUserId  String?
  approvedBy        User?    @relation("PaymentApprover", fields: [approvedByUserId], references: [id])
  status            String   @default("PENDING") // PENDING | APPROVED | REJECTED
  notes             String?  @db.Text
  createdAt         DateTime @default(now())
}
```

**API Endpoints:**

| Method | Path                             | Access               | Description                                |
| ------ | -------------------------------- | -------------------- | ------------------------------------------ |
| POST   | `/api/v1/payments`               | CASHIER, SUPER_ADMIN | Record a payment against a bill            |
| GET    | `/api/v1/payments`               | All                  | List payments (filterable by status, date) |
| PUT    | `/api/v1/payments/:id/approve`   | SUPER_ADMIN          | Approve payment entry                      |
| PUT    | `/api/v1/payments/:id/reject`    | SUPER_ADMIN          | Reject with reason                         |
| GET    | `/api/v1/customers/:id/payments` | All                  | Payment history for customer               |

**UI Screens:**

- **Record Payment** — select bill, enter amount, method, reference number, notes
- **Payments queue** — SUPER_ADMIN sees pending approvals, approve/reject with one click
- **Payment history** — per customer or global, filterable

**Role Access:**

- `SUPER_ADMIN`: Record + approve/reject all
- `CASHIER`: Record payment (auto-pending approval), view own entries

---

## Phase 4 — Order & Inventory Management

**Goal:** Full purchase order lifecycle — place order, receive goods, handle partial deliveries, update stock.

**New Prisma Models:**

```prisma
model PurchaseOrder {
  id                   String             @id @default(uuid())
  orderNumber          String             @unique
  supplierId           String
  supplier             Supplier           @relation(fields: [supplierId], references: [id])
  orderDate            DateTime           @default(now())
  expectedDeliveryDate DateTime?
  status               String             @default("PENDING")
  // PENDING | CONFIRMED | PARTIALLY_RECEIVED | RECEIVED | CANCELLED
  transportInfo        String?            @db.Text
  notes                String?            @db.Text
  createdByUserId      String
  createdBy            User               @relation("OrderCreator", fields: [createdByUserId], references: [id])
  approvedByUserId     String?
  approvedBy           User?              @relation("OrderApprover", fields: [approvedByUserId], references: [id])
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt
  items                PurchaseOrderItem[]
}

model PurchaseOrderItem {
  id               String        @id @default(uuid())
  orderId          String
  order            PurchaseOrder @relation(fields: [orderId], references: [id])
  productId        String
  product          Product       @relation(fields: [productId], references: [id])
  orderedQuantity  Int
  receivedQuantity Int           @default(0)
  unitRate         Decimal       @db.Decimal(10, 2)
  status           String        @default("PENDING")
  // PENDING | PARTIALLY_RECEIVED | RECEIVED
}
```

**API Endpoints:**

| Method | Path                           | Access      | Description                                                   |
| ------ | ------------------------------ | ----------- | ------------------------------------------------------------- |
| GET    | `/api/v1/orders`               | All         | List purchase orders                                          |
| GET    | `/api/v1/orders/:id`           | All         | Order detail with items                                       |
| POST   | `/api/v1/orders`               | SUPER_ADMIN | Place new order (auto-calculates required qty from inventory) |
| PUT    | `/api/v1/orders/:id/confirm`   | SUPER_ADMIN | Confirm order to supplier                                     |
| POST   | `/api/v1/orders/:id/receive`   | SUPER_ADMIN | Record goods received (full or partial)                       |
| PUT    | `/api/v1/orders/:id/cancel`    | SUPER_ADMIN | Cancel order                                                  |
| GET    | `/api/v1/inventory`            | All         | Current stock levels with low-stock flags                     |
| PUT    | `/api/v1/inventory/:productId` | SUPER_ADMIN | Manual stock adjustment with reason                           |

**UI Screens:**

- **New Order form** — select supplier, add products (auto-suggests quantity based on min stock), expected delivery date, transport info
- **Orders list** — status badges, supplier, date, items count
- **Order detail** — items with ordered vs received qty, receive goods button
- **Receive Goods modal** — enter received qty per item, handles partial, notifies manager if partial
- **Inventory overview** — product list with current stock, reserved qty, low stock highlighted red/yellow
- **Manual stock adjustment** — product, qty change, reason log

**Role Access:**

- `SUPER_ADMIN`: Full order and inventory management
- `CASHIER`: View inventory (read-only)

---

## Phase 5 — Warranty Management

**Goal:** Track warranties linked to sold products, manage claims, send expiry notifications.

**New Prisma Models:**

```prisma
model Warranty {
  id                String   @id @default(uuid())
  productId         String
  product           Product  @relation(fields: [productId], references: [id])
  billId            String
  bill              Bill     @relation(fields: [billId], references: [id])
  billItemId        String
  serialNumber      String?
  purchaseDate      DateTime
  expiryDate        DateTime
  status            String   @default("ACTIVE")
  // ACTIVE | EXPIRED | CLAIMED | RESOLVED
  claimDate         DateTime?
  claimDescription  String?  @db.Text
  resolvedByUserId  String?
  resolvedBy        User?    @relation(fields: [resolvedByUserId], references: [id])
  resolvedAt        DateTime?
  resolutionNotes   String?  @db.Text
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

**API Endpoints:**

| Method | Path                               | Access      | Description                                |
| ------ | ---------------------------------- | ----------- | ------------------------------------------ |
| GET    | `/api/v1/warranties`               | All         | List all warranties (filterable by status) |
| GET    | `/api/v1/warranties/:id`           | All         | Warranty detail                            |
| GET    | `/api/v1/warranties/expiring-soon` | All         | Warranties expiring in next 30 days        |
| POST   | `/api/v1/warranties/:id/claim`     | All         | File a warranty claim                      |
| PUT    | `/api/v1/warranties/:id/resolve`   | SUPER_ADMIN | Resolve claim with notes                   |

**UI Screens:**

- **Warranties list** — filter by status (Active/Expired/Claimed/Resolved), search by customer/product/serial
- **Warranty detail** — product info, bill reference, dates, claim history
- **Claim form** — description of issue
- **Resolve form** — SUPER_ADMIN enters resolution notes, changes status

**Role Access:**

- `SUPER_ADMIN`: Full management including resolution
- `CASHIER`: View warranties, file claims

---

## Phase 6 — Staff & Attendance

**Goal:** Staff profiles, daily attendance, and salary calculation.

**New Prisma Models:**

```prisma
model Staff {
  id          String       @id @default(uuid())
  userId      String?      @unique
  user        User?        @relation(fields: [userId], references: [id])
  name        String
  phone       String
  email       String?
  address     String?
  jobRole     String       // "Salesman", "Driver", "Accountant", etc.
  joinDate    DateTime
  basicSalary Decimal      @db.Decimal(10, 2)
  isActive    Boolean      @default(true)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  attendances Attendance[]
  salaries    Salary[]
}

model Attendance {
  id          String   @id @default(uuid())
  staffId     String
  staff       Staff    @relation(fields: [staffId], references: [id])
  date        DateTime
  status      String   // PRESENT | ABSENT | HALF_DAY | LEAVE
  checkIn     DateTime?
  checkOut    DateTime?
  notes       String?

  @@unique([staffId, date])
}

model Salary {
  id             String   @id @default(uuid())
  staffId        String
  staff          Staff    @relation(fields: [staffId], references: [id])
  month          Int
  year           Int
  workingDays    Int
  presentDays    Int
  halfDays       Int
  basicSalary    Decimal  @db.Decimal(10, 2)
  allowances     Decimal  @db.Decimal(10, 2) @default(0)
  deductions     Decimal  @db.Decimal(10, 2) @default(0)
  bonus          Decimal  @db.Decimal(10, 2) @default(0)
  netSalary      Decimal  @db.Decimal(10, 2)
  status         String   @default("PENDING") // PENDING | PAID
  paidByUserId   String?
  paidBy         User?    @relation(fields: [paidByUserId], references: [id])
  paidAt         DateTime?
  notes          String?

  @@unique([staffId, month, year])
}
```

**API Endpoints:**

| Method | Path                                | Access      | Description                      |
| ------ | ----------------------------------- | ----------- | -------------------------------- |
| GET    | `/api/v1/staff`                     | SUPER_ADMIN | List all staff                   |
| POST   | `/api/v1/staff`                     | SUPER_ADMIN | Add staff member                 |
| PUT    | `/api/v1/staff/:id`                 | SUPER_ADMIN | Update staff                     |
| POST   | `/api/v1/staff/:id/attendance`      | SUPER_ADMIN | Mark attendance for a day        |
| GET    | `/api/v1/staff/:id/attendance`      | SUPER_ADMIN | Attendance history               |
| POST   | `/api/v1/staff/:id/salary/generate` | SUPER_ADMIN | Auto-generate salary for a month |
| PUT    | `/api/v1/staff/salary/:id/pay`      | SUPER_ADMIN | Mark salary as paid              |

**UI Screens:**

- **Staff list** — profiles with job role, status
- **Staff profile** — contact, salary info, attendance summary
- **Attendance sheet** — monthly calendar view, mark present/absent/leave
- **Salary sheet** — per staff per month, working days auto-calculated from attendance, allowances/deductions input, mark paid

**Role Access:**

- `SUPER_ADMIN`: Full staff management
- `CASHIER`: No access

---

## Phase 7 — Expense Management

**Goal:** Record and categorise all business outgoings (rent, utilities, transport, misc). Cashiers can log expenses that go to SUPER_ADMIN for approval, keeping spend visible and auditable.

**New Prisma Models:**

```prisma
model ExpenseCategory {
  id       String    @id @default(uuid())
  name     String    @unique
  expenses Expense[]
}

model Expense {
  id                String          @id @default(uuid())
  categoryId        String
  category          ExpenseCategory @relation(fields: [categoryId], references: [id])
  description       String
  amount            Decimal         @db.Decimal(10, 2)
  expenseDate       DateTime
  billReference     String?
  recordedByUserId  String
  recordedBy        User            @relation("ExpenseRecorder", fields: [recordedByUserId], references: [id])
  approvedByUserId  String?
  approvedBy        User?           @relation("ExpenseApprover", fields: [approvedByUserId], references: [id])
  status            String          @default("PENDING") // PENDING | APPROVED | REJECTED
  rejectionReason   String?
  createdAt         DateTime        @default(now())
}
```

**API Endpoints:**

| Method | Path                           | Access      | Description        |
| ------ | ------------------------------ | ----------- | ------------------ |
| GET    | `/api/v1/expenses`             | SUPER_ADMIN | List all expenses  |
| POST   | `/api/v1/expenses`             | All         | Record an expense  |
| PUT    | `/api/v1/expenses/:id/approve` | SUPER_ADMIN | Approve expense    |
| PUT    | `/api/v1/expenses/:id/reject`  | SUPER_ADMIN | Reject with reason |
| GET    | `/api/v1/expense-categories`   | All         | List categories    |
| POST   | `/api/v1/expense-categories`   | SUPER_ADMIN | Add category       |

**UI Screens:**

- **Expenses list** — date-range filter, category filter, status filter (All / Pending / Approved / Rejected); running total shown at top
- **Record Expense form** — category dropdown (with inline "add new"), description, amount, date, optional external bill/reference number
- **Expense detail** — all fields + current approval status, approver name, rejection reason if rejected
- **Expense Categories management** — simple CRUD list (SUPER_ADMIN only, accessible from Settings)
- **Approvals queue** — SUPER_ADMIN card list of all PENDING expenses, each with Approve / Reject (with reason) inline actions

**Role Access:**

- `SUPER_ADMIN`: Record + view all + approve/reject + manage categories
- `CASHIER`: Record expense (status auto-set to PENDING), view own expenses only

---

## Phase 8 — Notifications & Approvals

**Goal:** In-app notification system for all events requiring attention. OTP integration for billing.

**New Prisma Models:**

```prisma
model Notification {
  id           String   @id @default(uuid())
  type         String
  // PARTIAL_DELIVERY | PAYMENT_PENDING | WARRANTY_EXPIRY |
  // LOW_STOCK | EXPENSE_PENDING | CREDIT_BILL | ORDER_CONFIRMED
  title        String
  message      String   @db.Text
  targetUserId String?
  targetUser   User?    @relation(fields: [targetUserId], references: [id])
  referenceId  String?  // ID of the related record
  referenceType String? // "Bill", "Order", "Warranty", etc.
  isRead       Boolean  @default(false)
  createdAt    DateTime @default(now())
}
```

**API Endpoints:**

| Method | Path                             | Access | Description                        |
| ------ | -------------------------------- | ------ | ---------------------------------- |
| GET    | `/api/v1/notifications`          | All    | Get notifications for current user |
| PUT    | `/api/v1/notifications/:id/read` | All    | Mark as read                       |
| PUT    | `/api/v1/notifications/read-all` | All    | Mark all as read                   |

**Notification triggers (auto-created by server logic):**

- New purchase order placed → notify SUPER_ADMIN
- Partial delivery received → notify SUPER_ADMIN for approval
- Low stock reached (quantity ≤ minStockLevel) → notify SUPER_ADMIN
- Payment recorded by cashier → notify SUPER_ADMIN for approval
- Warranty expiring in ≤ 30 days → notify SUPER_ADMIN
- Credit bill created → notify SUPER_ADMIN
- Expense recorded → notify SUPER_ADMIN for approval

**UI Screens:**

- **Notification bell** in app shell header — badge count of unread
- **Notifications dropdown / panel** — grouped by type, click navigates to related record
- **Approvals queue** — dedicated page for SUPER_ADMIN showing all pending items across payments, expenses, partial deliveries, in one place

---

## Phase 9 — Reporting & Analytics

**Goal:** Comprehensive reports and KPI dashboard. All data is already in the DB from previous phases.

**API Endpoints:**

| Method | Path                          | Description                                                                     |
| ------ | ----------------------------- | ------------------------------------------------------------------------------- |
| GET    | `/api/v1/reports/dashboard`   | KPI summary (today's sales, outstanding, stock alerts, pending approvals count) |
| GET    | `/api/v1/reports/sales`       | Sales by date range — total, per product, per cashier                           |
| GET    | `/api/v1/reports/profit`      | Profit per bill and per product (selling - purchase - transport - expenses)     |
| GET    | `/api/v1/reports/outstanding` | All customers with unpaid balances, GST vs non-GST split                        |
| GET    | `/api/v1/reports/inventory`   | Stock levels, slow-moving products, reorder alerts                              |
| GET    | `/api/v1/reports/orders`      | Supplier orders, delivery performance                                           |
| GET    | `/api/v1/reports/expenses`    | Expense breakdown by category and period                                        |
| GET    | `/api/v1/reports/staff`       | Attendance summary, salary disbursements                                        |
| GET    | `/api/v1/reports/warranties`  | Active/expired/claimed breakdown                                                |

**UI Screens:**

- **Main Dashboard** — KPI cards (Today's Sales, Outstanding, Stock Alerts, Pending Approvals), quick charts
- **Sales Report** — date range picker, bar/line chart, table with drill-down
- **Profit Report** — per product and per bill, margin %
- **Outstanding Report** — customer-wise, aged analysis (0-30, 30-60, 60+ days)
- **Inventory Report** — stock levels with reorder suggestions
- **Expense Report** — category breakdown, pie chart
- **Staff Report** — attendance %, salary summary

**Role Access:**

- `SUPER_ADMIN`: All reports
- `CASHIER`: Own billing history only

---

## Phase 10 — OTP / SMS Integration

**Goal:** Real OTP verification for credit bills via SMS or WhatsApp.

**Implementation:**

- Integrate with SMS provider (Twilio, MSG91, or 2Factor)
- Store OTP temporarily (Redis or in-memory with TTL, or DB with expiry)
- `POST /api/v1/otp/send` — generates 6-digit OTP, sends to customer phone
- `POST /api/v1/otp/verify` — validates OTP, returns confirmation token for bill creation
- OTP expires in 5 minutes
- Bill with credit status only created after valid OTP confirmation

---

## Phase 11 — Mobile App (Future)

**For:** Warehouse staff (goods receiving) and field collection staff (payment collection).
**Platform:** React Native or Flutter.
**Connects to:** App B Express API (same endpoints as App C, just new client).
**Authentication:** Same JWT login as App C.

---

---

## Key API Request / Response Schemas

These schemas cover the most complex or business-critical endpoints. All endpoints require `Authorization: Bearer <jwt>` except system setup routes.

---

### POST `/api/v1/auth/login`

**Request:**

```json
{
  "username": "admin",
  "password": "plaintext"
}
```

**Response 200:**

```json
{
  "success": true,
  "token": "<JWT>",
  "user": { "id": "uuid", "username": "admin", "role": "SUPER_ADMIN" }
}
```

**Errors:** `401 INVALID_CREDENTIALS`

---

### POST `/api/v1/system/pair-client`

**Request:**

```json
{
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "friendlyName": "Counter 1"
}
```

**Response 200:**

```json
{
  "success": true,
  "client": {
    "id": "uuid",
    "macAddress": "AA:BB:CC:DD:EE:FF",
    "friendlyName": "Counter 1",
    "authorizedAt": "2026-01-01T00:00:00Z"
  }
}
```

**Errors:** `403 INVALID_LICENSE_JWT`, `429 DEVICE_LIMIT_REACHED`

---

### POST `/api/v1/products` (Phase 2A)

**Request:**

```json
{
  "name": "Product Name",
  "sku": "SKU-001",
  "categoryId": "uuid",
  "purchaseRate": 100.0,
  "sellingRate": 150.0,
  "transportCharges": 5.0,
  "gstPercentage": 18.0,
  "warrantyPeriodDays": 365,
  "minStockLevel": 5,
  "defaultStockLevel": 20,
  "description": "Optional description",
  "supplierIds": [
    {
      "supplierId": "uuid",
      "supplierRate": 98.0,
      "isDefault": true,
      "leadTimeDays": 3
    }
  ]
}
```

**Response 201:**

```json
{
  "success": true,
  "product": {
    "id": "uuid",
    "name": "...",
    "sku": "...",
    "inventory": { "quantity": 0 }
  }
}
```

---

### POST `/api/v1/bills` (Phase 3A)

**Request:**

```json
{
  "customerId": "uuid",
  "paymentMethod": "CASH",
  "discountAmount": 0,
  "notes": "",
  "otpToken": "abc123",
  "items": [
    {
      "productId": "uuid",
      "quantity": 2,
      "sellingRate": 150.0,
      "discountAmount": 0
    }
  ]
}
```

**Server-side logic on POST /api/v1/bills:**

1. Validate all `productId`s exist and have sufficient stock
2. Snapshot `purchaseRate`, `transportCharges`, `gstPercentage` from Product at time of billing
3. Calculate per-item: `taxAmount = sellingRate * qty * (gstPercentage / 100)`, `profit = (sellingRate - purchaseRate - transportCharges) * qty`
4. Calculate bill totals: `subtotal`, `taxAmount`, `totalAmount = subtotal + taxAmount - discountAmount`
5. Determine `status`: `PAID` if `paymentMethod != CREDIT`, `CREDIT` if OTP verified, `PARTIAL` if partial payment
6. Decrement `InventoryItem.quantity` for each item in a transaction
7. Auto-create `Warranty` records for products with `warrantyPeriodDays > 0`
8. Create `Payment` record if cash/card/UPI payment at point of sale

**Response 201:**

```json
{
  "success": true,
  "bill": {
    "id": "uuid",
    "billNumber": "BILL-2026-00001",
    "totalAmount": 354.00,
    "status": "PAID",
    "items": [...]
  }
}
```

**Errors:** `400 INSUFFICIENT_STOCK`, `400 INVALID_OTP_TOKEN`, `404 CUSTOMER_NOT_FOUND`

---

### POST `/api/v1/orders/:id/receive` (Phase 4)

**Request:**

```json
{
  "receivedItems": [{ "orderItemId": "uuid", "receivedQuantity": 10 }],
  "notes": "Partial delivery, 5 units back-ordered"
}
```

**Server-side logic:**

1. For each `orderItemId`, add `receivedQuantity` to `PurchaseOrderItem.receivedQuantity`
2. Update `PurchaseOrderItem.status` — `RECEIVED` if fully received, `PARTIALLY_RECEIVED` otherwise
3. Increment `InventoryItem.quantity` for each product
4. Update `PurchaseOrder.status` — `RECEIVED` if all items fully received, `PARTIALLY_RECEIVED` otherwise
5. If partial, auto-create `PARTIAL_DELIVERY` Notification for SUPER_ADMIN (Phase 8)

---

### GET `/api/v1/reports/dashboard` (Phase 9)

**Response 200:**

```json
{
  "today": {
    "salesTotal": 12500.0,
    "billsCount": 23,
    "cashCollected": 9000.0,
    "creditBills": 3
  },
  "outstanding": {
    "totalAmount": 45000.0,
    "customersCount": 12
  },
  "inventory": {
    "lowStockCount": 4,
    "outOfStockCount": 1
  },
  "pendingApprovals": {
    "payments": 2,
    "expenses": 5,
    "orders": 1
  }
}
```

---

## Implementation Guidelines

### JWT Middleware (App B)

Every protected route should use a shared middleware:

```typescript
function requireAuth(roles?: string[]) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "UNAUTHORIZED" });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      req.user = payload;
      if (roles && !roles.includes(payload.role)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      next();
    } catch {
      return res.status(401).json({ error: "INVALID_TOKEN" });
    }
  };
}

// Usage:
app.get("/api/v1/products", requireAuth(), handler);
app.post("/api/v1/products", requireAuth(["SUPER_ADMIN"]), handler);
```

### Frontend Auth-Aware Navigation

Both App B and App C should use a React context for auth state:

```typescript
// AuthContext provides: { user, token, role, isAuthenticated, signOut }
// ProtectedRoute component checks isAuthenticated, redirects to /login if not
// RoleGate component shows/hides children based on role:
//   <RoleGate allow={['SUPER_ADMIN']}> ... </RoleGate>
```

### Prisma Migration Strategy

Each phase adds new models. Always:

1. Add models to `main-local/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name phase-XX-description`
3. Never edit existing migrations — always create new ones
4. Keep migration names descriptive: `phase-2a-products-suppliers`, `phase-3a-billing`

### Bill Number Generation

Bill numbers must be sequential and human-readable:

```typescript
// Format: BILL-YYYY-NNNNN (e.g. BILL-2026-00001)
async function generateBillNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.bill.count({
    where: { billDate: { gte: new Date(`${year}-01-01`) } },
  });
  return `BILL-${year}-${String(count + 1).padStart(5, "0")}`;
}
```

Similarly for purchase orders: `PO-YYYY-NNNNN`

---

## Summary Table

| Phase | Feature                        | New DB Models                                               | Roles Introduced                  |
| ----- | ------------------------------ | ----------------------------------------------------------- | --------------------------------- |
| 1 ✅  | Foundation, auth, pairing      | ShopConfig, User, AuthorizedClient                          | SUPER_ADMIN, CASHIER              |
| 2A    | Products, Suppliers, Inventory | Category, Product, Supplier, ProductSupplier, InventoryItem | —                                 |
| 2B    | Customers                      | Customer, CustomerFollowUp                                  | —                                 |
| 3A    | Billing                        | Bill, BillItem                                              | —                                 |
| 3B    | Payment Collection             | Payment                                                     | —                                 |
| 4     | Orders & Receiving             | PurchaseOrder, PurchaseOrderItem                            | —                                 |
| 5     | Warranty                       | Warranty                                                    | —                                 |
| 6     | Staff & Attendance             | Staff, Attendance, Salary                                   | —                                 |
| 7     | Expenses                       | Expense, ExpenseCategory                                    | —                                 |
| 8     | Notifications                  | Notification                                                | —                                 |
| 9     | Reports & Dashboard            | (no new models)                                             | —                                 |
| 10    | OTP Integration                | (no new models)                                             | —                                 |
| 11    | Mobile App                     | (no new models)                                             | WAREHOUSE_STAFF, COLLECTION_STAFF |
