# Cashlio — Tester Setup Guide

This bundle contains:

- **`main-local-1.0.0.dmg`** — installable Mac app (the local branch server + manager UI). Apple Silicon (arm64) only.
- **`admin-saas/`** — source code for the cloud license API. You'll run this from source on `localhost:3000`.
- **`main-local/`** — source code for the desktop app (only needed if you want to build it yourself or run `npm run dev`).

You will run **both** apps on the same Mac for testing. `main-local` (the desktop app) talks to `admin-saas` (the license server) at `http://localhost:3000`.

---

## 1. Prerequisites

Install once if you don't already have them:

| Tool | Why | Install |
|---|---|---|
| **Node.js 20+** | runs `admin-saas` and the build tooling | https://nodejs.org or `brew install node` |
| **PostgreSQL 14+** | local database for both apps | `brew install postgresql@16 && brew services start postgresql@16` |
| **Git** | optional, only if cloning | preinstalled on Mac |

Verify:

```bash
node -v        # v20+
npm -v
psql --version # 14+
```

---

## 2. Create the two PostgreSQL databases

The default `.env` files assume Postgres user `postgres` with password `postgres`. If your local Postgres uses a different user, edit `DATABASE_URL` in both `.env` files (paths shown below).

```bash
# Create the role if you don't already have one with this password
psql postgres -c "CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';" 2>/dev/null || true

# Create both databases
psql -U postgres -c "CREATE DATABASE admin_saas;"
psql -U postgres -c "CREATE DATABASE shopms_local;"
```

---

## 2b. Generate the license signing keys (once)

`.env` files are not in git — each holds secrets. Copy the examples and fill
them in:

```bash
cp admin-saas/.env.example admin-saas/.env
cp main-local/.env.example main-local/.env
```

Then generate the keypair that lets the desktop app trust licenses from the
server, and paste each half where the script says:

```bash
node admin-saas/scripts/gen-license-keys.js
```

`LICENSE_PRIVATE_KEY` goes in `admin-saas/.env` and must stay secret.
`LICENSE_PUBLIC_KEY` goes in `main-local/.env`. Also set `BETTER_AUTH_SECRET`
and `JWT_SECRET` to long random strings — they do not need to match each other.

## 3. Start the license server (`admin-saas`)

```bash
cd admin-saas
npm install
npx prisma migrate deploy   # applies all migrations from prisma/migrations
npx prisma generate
npm run dev                 # starts Next.js on http://localhost:3000
```

Leave this terminal open. It's the license API the desktop app calls.

**Sanity check** in another terminal:

```bash
curl http://localhost:3000/
# Should return a Next.js HTML page (not connection refused).
```

### Create a license for testing

The desktop app activates against a license key. You'll need one row in the SaaS DB. Easiest way:

```bash
cd admin-saas
npx prisma studio   # opens a browser at http://localhost:5555
```

> **The console has no public sign-up.** Create your login with:
>
> ```bash
> cd admin-saas
> node scripts/seed-admin.mjs you@yourcompany.com "a long password" SUPER_ADMIN
> ```
>
> It writes straight to the database, so the web server does not need to be
> running. Only a `SUPER_ADMIN` can open the console or touch a licence.

In Prisma Studio:

1. Open the **`License`** model.
2. Click **Add record** and fill in at least:
   - `key` — any string, e.g. `TEST-LICENSE-001`
   - `status` — `ACTIVE`
   - `gracePeriodDays` — `30`
   - `refreshTokenSeq` — `0`
3. Save. Copy the `key` — you'll paste it into the desktop app on first launch.

---

## 4. Set up the desktop app database (one-time)

> **Upgrading an existing install?** Run this in `main-local/` after pulling:
>
> ```bash
> ./scripts/upgrade-db.sh
> ```
>
> It runs the migration files and backfills data in one step, and is safe to
> re-run. A database created before migration files existed (with `prisma db
> push`) is detected and baselined automatically. Your data is preserved.

`main-local`'s Prisma schema needs to be applied to `shopms_local`. Easiest path:

```bash
cd main-local
npm install
./scripts/upgrade-db.sh     # applies prisma/migrations and generates the client
```

> If `npm install` fails on `better-sqlite3` or other native modules, run `npx electron-rebuild` once.

---

## 5. Install the desktop app

1. Double-click **`main-local-1.0.0.dmg`**.
2. Drag **main-local.app** to **Applications**.
3. First launch: macOS will block it as "from an unidentified developer".
   - Right-click the app → **Open** → **Open** in the warning dialog.
   - Or: System Settings → Privacy & Security → scroll to "main-local was blocked" → **Open Anyway**.

The app reads its config from `Contents/Resources/.env` inside the bundle. Defaults already point to `http://localhost:3000` for the license server and `localhost:5432` for Postgres — no edits needed for the standard setup.

### Overriding config on your machine (optional)

If your Postgres lives elsewhere, or you want to point at a different license server, drop a `.env` file at:

```
~/Library/Application Support/main-local/.env
```

Anything in that file takes precedence over the bundled defaults. Example:

```env
DATABASE_URL="postgresql://myuser:mypass@localhost:5432/shopms_local?schema=public"
SAAS_API_URL=http://localhost:3000
```

---

## 6. First-run flow inside the app

1. Launch **main-local** from Applications.
2. **Activate** screen: paste the license key you created in Prisma Studio (e.g. `TEST-LICENSE-001`).
3. **Setup profile** screen: shop name, address, GST settings.
4. **Till account** (optional, on the same screen): create a cashier login. Without one you would have to type the manager password into every till, which defeats the point of having roles at all. You can add more later under Settings.
5. You should land on the manager dashboard. The Express API is now running on `http://127.0.0.1:52001`.

The app generates its own session secret on first launch and stores it at
`~/Library/Application Support/main-local/session.key`. Nothing secret ships
inside the app any more, so each installation is independent.

**Verify the API is up** (in another terminal):

```bash
curl http://127.0.0.1:52001/api/v1/system/status
# Returns { ok: true, ... }
```

---

## 7. What to test

A quick smoke list — the surface area is large, so just exercise the main flows:

- [ ] License activates without errors
- [ ] Shop profile saves and persists across app restarts
- [ ] Create a category → supplier → product (Phase 2A CRUD)
- [ ] Add a customer (Phase 2B)
- [ ] Create a bill on the **Billing** screen — confirm stock decrements and bill number increments
- [ ] Open the **Sales** screen — your bill appears, click into detail, try void (super admin)
- [ ] Open the **Analytics** screen — switch period selectors, KPIs render
- [ ] Quit and relaunch — license & data persist
- [ ] **Settings → Shop Details** — set your GSTIN; bills should then print as "TAX INVOICE"
- [ ] Create a bill with a **bill-level discount** — check that Subtotal, Taxable value,
      CGST/SGST and Total all differ and add up (they used to be identical)
- [ ] Confirm bill numbers read `INV-YYMM-NNNN` and batch codes read `BT-YYMM-NNNN`
- [ ] Deactivate a product — it should disappear from the Active filter and show
      under Inactive with a badge, and be restorable
- [ ] Try saving a customer with a 9-digit phone or a wrong GSTIN — both should be
      refused with a specific message
- [ ] **Brands** — add a brand, use it on a product, rename it, and confirm the
      product's brand updates too; deleting a brand still in use should be refused
- [ ] **Cut-to-length** — create a product with "Sold as: Cut to length" and unit `m`,
      receive 12.5 m of stock, then bill 2.75 m. Stock should read 9.75 m
- [ ] A whole-unit product should refuse a fractional quantity
- [ ] **Batch GST** — add a batch entering the rate *including* GST and check the
      Base / GST / Landed readout splits it correctly
- [ ] **Analytics** — margin should now read as a believable percentage (it compares
      revenue and cost both excluding GST)
- [ ] **Credit** — give a customer a credit limit (Customers → edit), then bill them
      taking less than the full amount. The bill should save as Part paid with a
      balance, and the receipt should print BALANCE DUE
- [ ] Billing a walk-in for less than the total should be refused — credit needs a
      named customer
- [ ] Push a customer past their limit: a cashier is blocked, a super admin is
      offered "Authorise anyway"
- [ ] **Split payment** — take part cash, part UPI on one bill; both should print
- [ ] **Receivables** (new tab) — the debtor appears with ageing; record a payment
      and watch the balance clear
- [ ] Try voiding a bill you have collected against — it should be refused
- [ ] **Prices are the shop's, not the till's** — a cashier should not be able to
      change a line's rate; a super admin should be able to, deliberately
- [ ] **Cashier accounts** — Settings → add a till user, sign in on a terminal with
      it, and confirm manager-only actions (void, credit limits) are refused
- [ ] **Batch-accurate returns** — receive two batches of one product at different
      rates, sell enough to span both, then return most of it. Each batch should get
      back exactly what it gave (check under Products → the product's batches)
- [ ] Return something as **Damaged** — the customer is refunded but stock must NOT
      go back up
- [ ] **Orders** (new tab) — a product below its minimum should appear under "Needs
      reordering"; create the order, place it, then receive part of it. The order
      should stay open showing what is still pending
- [ ] Receive the rest — the order should close as Received
- [ ] On a terminal, use the **Returns** tab to take something back; the credit note
      should print

---

## 8. Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| App says "Could not connect to license server" on activate | `admin-saas` not running | `cd admin-saas && npm run dev` |
| App refuses to start, logs about clock | System clock skew | Re-enable automatic time in System Settings |
| `EADDRINUSE: 52001` | Port collision | Kill the other process or set `LOCAL_SERVER_PORT` in the override `.env` |
| Postgres errors on launch | DB not created or wrong creds | Re-run step 2; check `DATABASE_URL` |
| App opens but pages are blank | Renderer build issue | Send the developer a screenshot of the DevTools console (View menu → Toggle Developer Tools) |

---

## 9. Sending feedback

Logs land here:

- macOS: `~/Library/Logs/main-local/` (Electron defaults — may be empty if the app crashes early; check Console.app and filter by "main-local")
- The Express API logs to stdout — visible only when running from source (`npm run dev` inside `main-local/`).

If something breaks, capture:

1. Steps to reproduce.
2. What you saw vs. expected.
3. Screenshot of the app + DevTools console (Cmd+Opt+I).
4. The `admin-saas` terminal output around that time.
