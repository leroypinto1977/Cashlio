# STANDARD OPERATING PROCEDURE (SOP)

## Project: Local Billing System (Electron + Express + PostgreSQL)

------------------------------------------------------------------------

# 1. SYSTEM OVERVIEW

## Objective

Build a local-first billing desktop application with:

-   Electron frontend (UI)
-   Express backend running inside Electron main process
-   Local PostgreSQL database
-   Strict localhost binding
-   Optional secure remote access (disabled by default)
-   Automated backup system

------------------------------------------------------------------------

# 2. HIGH-LEVEL ARCHITECTURE

User\
↓\
Electron Renderer (React UI)\
↓ (HTTP)\
Express API Server (runs in Electron Main Process)\
↓\
PostgreSQL (Local machine)

Rules: - UI NEVER talks directly to DB - All DB access goes through
API - API binds ONLY to 127.0.0.1 unless remote mode enabled

------------------------------------------------------------------------

# 3. PROJECT STRUCTURE

/billing-app\
├─ /electron\
│ ├─ main.ts\
│ ├─ preload.ts\
│\
├─ /backend\
│ ├─ app.ts\
│ ├─ routes/\
│ ├─ controllers/\
│ ├─ services/\
│ ├─ middleware/\
│ ├─ prisma/\
│\
├─ /renderer\
│ ├─ src/\
│ ├─ components/\
│ ├─ pages/\
│\
├─ package.json

------------------------------------------------------------------------

# 4. TECHNOLOGY STACK

## Frontend

-   Electron
-   React (Vite)
-   TailwindCSS

## Backend

-   Node.js
-   Express.js
-   Prisma ORM

## Database

-   PostgreSQL (local installation)

## Authentication

-   bcrypt
-   JWT (access tokens)
-   Role-based authorization

------------------------------------------------------------------------

# 5. DATABASE DESIGN STANDARD

## Requirements

-   All monetary operations must use transactions
-   No money calculation in frontend
-   Decimal precision enforced (NUMERIC, not FLOAT)

## Core Tables

### users

-   id (uuid, pk)
-   name (text)
-   email (text, unique)
-   password_hash (text)
-   role (enum: admin, cashier)
-   created_at (timestamp)

### customers

-   id (uuid)
-   name (text)
-   phone (text)
-   gst_number (text)
-   created_at (timestamp)

### products

-   id (uuid)
-   name (text)
-   sku (text)
-   barcode (text)
-   buy_price (numeric(12,2))
-   sell_price (numeric(12,2))
-   stock_quantity (integer)
-   tax_rate (numeric(5,2))
-   created_at (timestamp)

### invoices

-   id (uuid)
-   invoice_number (text, unique)
-   customer_id (uuid, nullable)
-   subtotal (numeric(12,2))
-   tax_amount (numeric(12,2))
-   discount (numeric(12,2))
-   total (numeric(12,2))
-   created_by (uuid)
-   created_at (timestamp)

### invoice_items

-   id (uuid)
-   invoice_id (uuid)
-   product_id (uuid)
-   quantity (integer)
-   unit_price (numeric(12,2))
-   tax_amount (numeric(12,2))
-   total_price (numeric(12,2))

### stock_movements

-   id (uuid)
-   product_id (uuid)
-   type (enum: sale, return, manual)
-   quantity (integer)
-   reference_id (uuid)
-   created_at (timestamp)

------------------------------------------------------------------------

# 6. TRANSACTION RULES (CRITICAL)

Invoice creation MUST: 1. Begin database transaction 2. Lock product
rows 3. Validate stock availability 4. Insert invoice 5. Insert
invoice_items 6. Deduct stock 7. Insert stock_movements 8. Commit

If ANY step fails → Rollback immediately.

------------------------------------------------------------------------

# 7. BACKEND API STANDARD

## Binding Rules

Default: app.listen(PORT, '127.0.0.1')

NEVER bind to: app.listen(PORT, '0.0.0.0') unless remote mode is
enabled.

## API Design Principles

-   REST-based
-   JSON only
-   No business logic in routes
-   Validation middleware for all inputs
-   Centralized error handler

Example Routes: - POST /api/auth/login - GET /api/products - POST
/api/products - PUT /api/products/:id - POST /api/invoices - GET
/api/reports/sales

------------------------------------------------------------------------

# 8. SECURITY SOP

## Password Handling

-   Use bcrypt
-   Minimum cost factor: 10
-   Never store plain password

## JWT Handling

-   Short access token lifetime (30--60 min)
-   Store token in memory (not localStorage)

## Role-Based Access

Admin: - Manage products - Manage users - View reports

Cashier: - Create invoices only

## SQL Injection Prevention

-   Use Prisma parameterized queries only
-   No raw string concatenation SQL

------------------------------------------------------------------------

# 9. ELECTRON SECURITY HARDENING

In BrowserWindow: - nodeIntegration: false - contextIsolation: true -
enableRemoteModule: false

Use preload script to expose safe APIs.

------------------------------------------------------------------------

# 10. LOCAL BACKUP SYSTEM (MANDATORY)

Daily automatic backup: pg_dump → encrypted file

Store: - Configurable backup directory - Optionally external drive -
Optional encrypted cloud copy

Retention: - Keep last 14 backups minimum

Must include restore function inside app.

------------------------------------------------------------------------

# 11. REMOTE ACCESS MODE SOP

Disabled by default.

When enabled: 1. Require admin login 2. Warn user about risk 3. Require
strong password 4. Force HTTPS

Mandatory Security: - JWT validation - Rate limiting - IP logging -
Brute force protection

------------------------------------------------------------------------

# 12. ERROR HANDLING POLICY

-   All failed DB writes must rollback
-   Log errors to file
-   No raw stack traces to UI
-   UI displays user-friendly messages

------------------------------------------------------------------------

# 13. LOGGING

Maintain logs for: - Login attempts - Invoice creation - Stock updates -
Admin operations - Remote access activation

Log format: - timestamp - user_id - action - ip (if remote enabled)

------------------------------------------------------------------------

# 14. DEPLOYMENT SOP

Installation must: 1. Install PostgreSQL 2. Create dedicated DB user 3.
Create database 4. Run migrations 5. Seed initial admin account

Never use postgres superuser in production config.

------------------------------------------------------------------------

# 15. PERFORMANCE RULES

-   Index invoice_number
-   Index product barcode
-   Index created_at
-   Use pagination
-   Never load entire invoice history in memory

------------------------------------------------------------------------

# 16. FUTURE SYNC DESIGN (Optional Phase 2)

Design export service: POST /api/export

Exports: - Encrypted JSON - Signed payload - Sent via HTTPS

------------------------------------------------------------------------

# 17. TESTING REQUIREMENTS

Before release: - Simulate power failure mid-invoice - Simulate stock
conflict - Simulate DB restart - Verify backup restore works - Try SQL
injection attempts - Try invalid JWT

If any test fails → not production-ready.

------------------------------------------------------------------------

# 18. PRODUCT DEFINITION

This is a Local-first ACID-compliant financial system.\
Not a CRUD demo application.
