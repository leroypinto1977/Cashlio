# APP A: ADMIN SaaS DASHBOARD (Cloud)

## 1. Overview
This is the central cloud application managed exclusively by the software provider (our team). It does not hold any shop billing data. Its sole purpose is to manage subscriptions, generate license keys, and validate hardware activations.

## 2. Technical Stack
*   **Frontend**: Next.js (React) styled with Tailwind CSS.
*   **Backend API**: Node.js + Express.
*   **Database**: PostgreSQL (Hosted on AWS RDS, Supabase, or similar cloud provider).
*   **Authentication**: Secure JWT login for our internal staff.

## 3. Core Responsibilities
1.  **Tenant Management**: Create and manage customer profiles (the Shop Owners).
2.  **License Generation**: Generate cryptographically secure license strings.
3.  **Activation Endpoint**: Provide a highly available REST API endpoint (`POST /api/v1/licenses/activate`) that the "Main App" (App B) calls during its first launch.

## 4. Draft Database Schema
```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    owner_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE licenses (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    license_key VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, ACTIVE, EXPIRED, REVOKED
    max_branches INT NOT NULL,
    max_systems_per_branch INT NOT NULL,
    valid_until TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hardware_bindings (
    id UUID PRIMARY KEY,
    license_id UUID REFERENCES licenses(id),
    branch_name VARCHAR(255),
    motherboard_serial VARCHAR(255) NOT NULL,
    mac_address VARCHAR(255) NOT NULL,
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 5. The Activation Logic (API Endpoint)
When App B calls `/activate` with a `license_key` and `hardware_id`:
1.  Check if `license_key` exists and `status == 'PENDING'`.
2.  If true, check if `valid_until` is in the future.
3.  If true, generate a **Signed JWT** containing the `max_branches` and `max_systems_per_branch` claims.
4.  Update license status to `ACTIVE` and insert the `hardware_id` into `hardware_bindings`.
5.  Return the Signed JWT to App B.
