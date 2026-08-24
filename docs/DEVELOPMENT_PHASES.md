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

### Phase A — The shop can meet its obligations

*Without this, the shop needs a second system to stay legal, which defeats the
purpose of the first one.*

- **HSN codes on products.** A GST invoice above the turnover threshold must
  carry them, and GSTR-1 cannot be filed without them. The field does not
  exist today. Everything else the return needs — taxable value, the tax heads,
  place of supply — is already stored per line.
- **GSTR-1 export.** B2B and B2C summaries, HSN summary, credit notes, in the
  shape the portal accepts. The data is all there; nothing gets it out.
- **Day book and cash close.** At the end of trading somebody counts the drawer
  against what the system says. Money-collected-by-tender exists on the
  analytics screen; a day-close flow that reconciles and records the difference
  does not.

### Phase B — The counter works at counter speed

*A shop with a queue does not tolerate a slow till.*

- **Barcodes.** The billing search already says *"Scan barcode or search by
  name / item code"* — but there is no barcode field on a product, so a
  scanner types a number that matches nothing. Either add the field and the
  lookup, or stop promising it.
- **Thermal receipt printing.** Printing goes through the OS dialog today. A
  counter printer wants a direct path and a paper size that fits.
- **Keyboard-first billing.** A cashier at speed should not need the mouse.

### Phase C — "Profit" means profit

*The analytics screen is honest about being gross margin. It is still not the
number a shopkeeper thinks they are reading.*

- **Expenses** — rent, power, wages, transport, and the rest — recorded and
  categorised, so the margin figure can be stated net. This is the one item
  carried forward from the original plan's Phase 7, because it makes something
  already shipped tell the truth.

### Phase D — The backup is real

*An untested backup is not a backup.*

- A restore path, exercised. Backups have run twice a day for months and
  nothing has ever read one back.

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
