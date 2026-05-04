# Phase 1: Foundation Implementation Plan

This plan details the setup and foundational build of the Shop Management System (Cashlio). Based on your feedback, we are adopting an **independent sub-folder approach** within the main `Cashlio` directory. This allows different AI agents to work safely in their own designated folders simultaneously without Git conflicts or tooling interference.

## Proposed Repository Structure

```text
/Users/leroy/Desktop/Projects/Cashlio
  ├── /docs                       # Existing architecture documentation
  ├── /admin-saas                 # APP A: Next.js 16 + Express + Postgres
  ├── /main-local                 # APP B: Electron + Vite/React + Express + Postgres
  ├── /billing-client             # APP C: Electron + Vite/React
  └── /shared                     # Shared logic, interfaces, or types (optional, to be copied into apps as needed to avoid symlink issues with agents)
```

## User Review Required

> [!NOTE] 
> Please review the structure and initialization commands below. If everything looks good, approve this plan so we can begin the automated setup.

## Proposed Changes

### Setup & Initialization

We will use standard `npx` templates to initialize the foundational stacks for each application.

#### [NEW] `/admin-saas` (App A)
- **Framework**: Next.js 16 (Pages or App router depending on preference, App router selected by default).
- **Styling**: Tailwind CSS + Shadcn UI.
- **Backend API**: We will use Next.js 16 API Routes for simplicity, or spin up a dedicated Express server inside this folder. Given the architecture docs mention Next.js 16 + Node/Express + Postgres, we will initialize a standard Next.js 16 app and add a custom Express server if needed, or rely on Next.js 16 API endpoints.
- **Data**: Prisma ORM + PostgreSQL.
- **Initial Command**: `npx create-next-app@latest admin-saas --ts --tailwind --eslint --app --src-dir --import-alias "@/*"`
- **Shadcn Command**: `npx shadcn-ui@latest init`

#### [NEW] `/main-local` (App B)
- **Framework**: Electron + Vite + React + TypeScript.
- **Styling**: Tailwind CSS + Shadcn UI.
- **Backend**: Express + Prisma ORM + Local Postgres.
- **Initial Command**: `npm create electron-vite@latest main-local -- --template react-ts`
- **Follow-up**: Install Tailwind, Shadcn, setup Express process within the Electron main process, and configure Prisma.

#### [NEW] `/billing-client` (App C)
- **Framework**: Electron + Vite + React + TypeScript.
- **Styling**: Tailwind CSS + Shadcn UI.
- **Backend**: None (pure HTTP client calling App B over LAN).
- **Initial Command**: `npm create electron-vite@latest billing-client -- --template react-ts`
- **Follow-up**: Install Tailwind, Shadcn, and Axios/Fetch for API communication.

## Verification Plan

### Automated Verification
- Verify successful execution of initialization scripts.
- Ensure all three applications can compile/build without errors out of the box.
- Run `npm run dev` on `/admin-saas` to verify Next.js startup.
- Run `npm run dev` on `/main-local` and `/billing-client` to verify Vite + Electron startup.

### Manual Verification
- Check the folder structure visually to ensure independent directories exist.
- Verify Tailwind and Shadcn are correctly configured in at least the Next.js app.
