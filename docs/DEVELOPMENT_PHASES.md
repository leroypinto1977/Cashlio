# Cashlio — what is built, and what comes next

**Last updated:** 24 August 2026, after the walkthrough feedback was verified end to end.

This replaces the original eleven-phase plan written before any of the system
existed. That document was kept as though it were a plan of record, and by the
time anyone read it back three things had gone wrong with it:

- **It was never updated.** It still described `Invoice (stub)` as a model; the
  model is `Bill`, and has been since billing was built.
- **Its numbering collided with reality.** Its "Phase 4" was purchase orders.
  The fourth block of work actually executed was licence hardening. Two things
  called Phase 4 is worse than neither being numbered.
- **It planned work nobody had asked for while omitting most of the work that
  happened.** Staff rotas, attendance sheets and salary calculation were in it
  from the start, and were never requested. Meanwhile eight passes of
  correctness and security work — the majority of the effort — appear nowhere
  in it at all.

So this document is written the other way round: what is true first, then what
is next, ordered by what actually stops a shop using this.

---

## Architecture

- **admin-saas** — Next.js on the cloud. Issues and enforces licences. The only
  part not running in the shop.
- **main-local** — Electron on the shop's own machine. Runs the branch API and
  the manager UI. Every business record lives here, in local PostgreSQL.
- **billing-client** — Electron on each till. No database of its own beyond an
  offline outbox and a mirror; talks to main-local over the shop LAN.

Both desktop apps render the same inner UI. Only the shell header differs, and
role decides what a person can reach.

---

## Part 1 — What is built

Verified against the running system on 24 August 2026: **79 routes, 21 models,
9 migrations, 9 manager screens**, and 17,642 assertions across four suites.

### The counter

| | |
|---|---|
| **Billing** | Multi-line sale, GST extracted from inclusive prices, line and bill discounts apportioned to the paisa, split tenders across cash/UPI/card/cheque |
| **Cut-to-length** | Pipe, wire and tube sold in fractions; stock is one running total in metres |
| **Credit** | A short payment leaves a balance against the customer, whatever the tender; limits enforced server-side; walk-in credit impossible |
| **Numbering** | `INV-YYMM-NNNN`, `CN-` for credit notes, `BT-` for batches, `PO-` for orders — allocated atomically inside the sale, released on rollback |
| **Returns & exchanges** | Reverse the exact batches the sale consumed, so cost of goods stays truthful; fractional returns for cut lengths |
| **Offline** | A till keeps selling with the network down — SQLite outbox, terminal-prefixed bill numbers, rejected bills surfaced rather than lost |

### The back office

Products with brands, categories, suppliers, warehouses and batches (with the
purchase GST split recorded). Customers with credit terms. Receivables with
real ageing. Purchase orders from reorder suggestion through to receipt.
Warranty cover recorded at the moment of sale, with claims and resolutions.
Analytics on revenue net of returns, with margin against real cost of goods.

### The parts nobody asks for until they are missing

This is what the original document had no record of, and it is most of the work:

- **Money integrity** — one settlement formula, stock deducted by conditional
  UPDATE so the database arbitrates, every mutation locked before it is
  checked. Verified under concurrency: two simultaneous returns produce one
  credit note; two payments never over-collect; a delivery booked twice arrives
  once.
- **Security** — CORS closed to the app's own windows, sign-in throttled, roles
  checked against the database rather than trusted from a token, accounts
  switchable off with sessions ending immediately, pairing requiring a manager,
  the renderer's IPC narrowed to a named list, backups owner-only with the
  password off the command line.
- **Licensing that means something** — Ed25519-signed licences, revocation that
  actually stops billing, per-machine seat counting, a stable machine
  fingerprint.
- **TLS on the branch link** — the server issues its own certificate and each
  till pins it at pairing, verified by a person comparing fingerprints before
  any password is typed.
- **Sync that cannot silently lose a change** — the feed pages by commit order,
  not sequence order, and the log is trimmed only below the point every till
  has passed.

### Verified against the walkthrough feedback

All sixteen items from the counter walkthrough are done and were re-verified
after the refactor: 56 assertions against the API worded as the original
complaints, and 31 more driving the actual screens.

---

## Part 2 — What comes next

Ordered by what stops a shop from running on this, not by what is interesting
to build.

**Phases A through D are closed.** What is left is Phase E, which is held
rather than planned, and one engineering item named at the end of it. A shop
can trade on what is built today: it can file its GST return, count its
drawer, scan and print at counter speed, state its profit net of what it costs
to run, and — as of D — actually get its data back.

### Phase A — The shop can meet its obligations ✅ *complete*

*Without this, the shop needs a second system to stay legal, which defeats the
purpose of the first one.*

- ✅ **HSN codes on products.** A GST invoice above the turnover threshold must
  carry them, and GSTR-1 cannot be filed without them. The field now exists on
  the product, is snapshotted onto every bill line at the moment of sale, and
  is validated as 4, 6 or 8 digits. Credit notes carry the code the original
  line carried.
- ✅ **GSTR-1 export.** `GET /api/v1/reports/gstr1` builds B2B, B2CL, B2CS,
  CDNR/CDNUR, the HSN summary and the document series, with `?format=portal`
  for upload. The GST return screen leads with a readiness panel, because a
  return nobody looked at is how a wrong one gets filed.
- ✅ **Day book and cash close.** Expected cash — opening float plus the day's
  cash payments less its cash refunds — sits beside what was counted, and the
  difference is recorded with a reason. This needed refunds to be written down
  as money moving in the first place, which they were not: returns against a
  paid bill, and exchanges where the replacement is cheaper, now record cash
  going back. Returns against an unpaid bill cancel debt and move no money.
  A day can only be counted once, and the figures freeze at the count.

### Phase B — The counter works at counter speed ✅ *complete*

*A shop with a queue does not tolerate a slow till.*

- ✅ **Barcodes.** The search box promised scanning and there was no barcode
  field, so a scanner typed a number that matched nothing. Codes are a table
  rather than a column, because the same item genuinely carries more than one:
  a manufacturer changes its EAN between runs, and the alternative — a
  duplicate product for the second code — splits one thing's stock and history
  in two. Printed GTINs are check-digit verified, so a mistyped one is refused
  with the digit it should have ended in rather than becoming a code that
  scans to nothing. The terminal answers scans from its own mirror, so the
  scanner keeps working when the LAN does not.
- ✅ **Thermal receipt printing.** A printer is chosen per machine and receipts
  go straight to it instead of stopping at the OS dialog. The page is cut to
  the receipt — a till roll has no page length, so the height is measured from
  the rendered content rather than fixed. 80mm and 58mm rolls both lay out to
  the printable strip rather than the paper width, which is what stops the
  first and last character being shaved off every line.
- ✅ **Keyboard-first billing.** F2 search, F4 customer, F6 amount, F9 collect;
  Alt with the arrows picks a line, Alt with plus/minus changes its quantity,
  Alt with backspace drops it. Function keys and Alt only, so a cashier typing
  a product name can never trigger a command. The keys are shown on screen.

### Phase C — "Profit" means profit ✅ *complete*

*The analytics screen was honest about being gross margin. It was still not the
number a shopkeeper thinks they are reading.*

- ✅ **Expenses.** Recorded against a controlled list of categories, split into
  costs that are there whether or not the shop sells anything and ones that
  move with trade. Net profit is worked out against the cost *after* the GST a
  registered shop reclaims — counting that tax as cost would report a business
  as losing money it never spent, and the revenue it is compared with is
  already ex-GST.
- ✅ **Cash out of the till.** An expense paid from the drawer comes off
  expected cash and is named in the day book, so what used to surface as "the
  drawer is ₹250 short" now reads as "the courier was paid ₹250". Only cash can
  be marked that way.
- ✅ **Two things that would otherwise mislead.** A month of fixed cost recorded
  on one day makes that day look catastrophic, so the screen says how much of
  the period's cost is monthly. Recurring costs are pointed at, never created —
  a rent figure that quietly repeated itself after the rent went up is worse
  than a missing one.

### Phase D — The backup is real ✅ *complete*

*An untested backup is not a backup.*

- ✅ **The backups were never running.** Prisma's connection string ends in
  `?schema=public`, and libpq refuses a URL carrying a parameter it does not
  recognise rather than ignoring it. `DATABASE_URL` was handed to `pg_dump`
  untouched, so every scheduled backup exited non-zero, wrote no file, and left
  one line in a log. Prisma-only parameters are now stripped before any
  Postgres tool sees the URL.
- ✅ **A manifest beside every dump** — exact row counts at the moment it was
  taken, a SHA-256, and the migration it came from. Without one a dump can only
  be checked for being readable, never for being complete, and the failure that
  matters most is the one that looks fine.
- ✅ **It reads itself back.** Every backup is verified as it is written, and
  once a week the newest is restored into a throwaway database and what comes
  back is counted. The result is recorded beside the backups, not in the
  database — the database is the thing being tested.
- ✅ **A restore that rehearses first.** Verify, restore into a scratch database,
  dump what is about to be replaced, and only then replace it. This goes wrong
  when somebody restores in a panic and learns the file was empty after the
  original is gone.

### Phase E — Only if the business actually needs it

Held, not planned. Each of these was in the original document; none was asked
for, and none blocks a shop from trading.

| | Why it is held |
|---|---|
| Staff, attendance, salary | This is HR software, not retail. A shop with two cashiers does not run payroll through its till. |
| Notifications & approvals | The screens that would raise them already show what needs attention where it needs attending to. |
| OTP on credit bills | Adds an SMS provider, a cost per bill, and a step at the counter. Worth it only if credit fraud proves to be a real problem. |
| Mobile app | A second client to maintain before the first two are in a shop. |

### The engineering item worth naming

Not a feature, but the thing most likely to slow everything above down:
`billing-client` has one 1,800-line screen doing sale entry, offline queueing,
sync, printing and customer lookup. The manager app's equivalent was split into
domain and routes; the terminal never got the same treatment.

---

## How work is tracked

Each phase lands as a branch, a PR describing what was wrong and why the fix is
shaped as it is, and tests that fail without the change. `npm test` in
`main-local` runs all four suites: shared invariants and fuzzing, TLS
handshakes, the billing domain without a server, and end-to-end against a real
PostgreSQL built from the migration files.
