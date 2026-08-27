/**
 * App C (billing-client) applying a REAL change feed from App B (main-local).
 *
 * The billing-client suite exercises applySyncEvents against hand-written
 * event objects; main-local's suite checks the feed it emits. Nothing joins
 * the two. Here the till's own SQLite code consumes what the branch server
 * actually served over HTTP.
 */
const ROOT = process.env.XAPP_ROOT
const LOCAL = process.env.XAPP_LOCAL_URL
const TOKEN = process.env.XAPP_TOKEN
const path = require('path'), fs = require('fs'), os = require('os')

// The till's db module expects Electron's app.getPath; stand in for it, the
// same way billing-client's own suite does.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cashlio-sync-'))
const esbuild = require(ROOT + '/billing-client/node_modules/esbuild')
const outfile = path.join(tmp, 'db.cjs')
esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'billing-client', 'src', 'main', 'db.ts')],
  outfile, bundle: true, platform: 'node', format: 'cjs',
  external: ['electron', 'better-sqlite3']
})
const Module = require('module')
const origResolve = Module._resolveFilename
Module._resolveFilename = function (req, ...rest) {
  if (req === 'electron') return require.resolve(path.join(tmp, 'electron-stub.cjs'))
  if (req === 'better-sqlite3') return require.resolve(ROOT + '/billing-client/node_modules/better-sqlite3')
  return origResolve.call(this, req, ...rest)
}
fs.writeFileSync(path.join(tmp, 'electron-stub.cjs'),
  `module.exports = { app: { getPath: () => ${JSON.stringify(tmp)} } }`)

const db = require(outfile)

let pass = 0, fail = 0
const t = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, detail !== undefined ? JSON.stringify(detail) : '') }
}
async function api(p, opts = {}) {
  const res = await fetch(LOCAL + p, { ...opts, headers: {
    'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN, ...(opts.headers || {}) }})
  let b = null; try { b = await res.json() } catch {}
  return { status: res.status, body: b }
}

;(async () => {
  console.log('\n— the till pulls what the branch server actually emitted —')
  const cat = await api('/api/v1/categories', { method: 'POST', body: JSON.stringify({ name: 'Cables' }) })
  const made = await api('/api/v1/products', { method: 'POST', body: JSON.stringify({
    itemCode: 'SYNC-001', name: 'Sync Test Cable', categoryId: cat.body?.category?.id ?? cat.body?.id,
    sellingRate: 236, gstPercentage: 18, unitOfMeasure: 'pcs' })})
  t('the branch server accepted a new product', made.status === 200 || made.status === 201, made.status)

  let cursor = db.getSyncState('pull_cursor') || '0'
  const pulled = await api(`/api/v1/sync/pull?cursor=${cursor}&limit=500`)
  t('the feed answers', pulled.status === 200, pulled.status)
  const events = pulled.body?.events ?? []
  t('...and carries at least the product we just made', events.length > 0, events.length)

  const applied = db.applySyncEvents(events)
  t('the till applies the real feed without throwing', !!applied, applied)

  const found = db.getProductByItemCode('SYNC-001')
  t('the product landed in the till mirror', !!found, found)
  t('...with the price the branch server set', found && Number(found.sellingRate) === 236, found && found.sellingRate)
  t('...and is searchable offline by name', db.searchProducts('Sync Test').length > 0)

  console.log('\n— an edit on the manager reaches the till —')
  const pid = found && found.id
  const upd = await api(`/api/v1/products/${pid}`, { method: 'PUT', body: JSON.stringify({
    itemCode: 'SYNC-001', name: 'Sync Test Cable HD', categoryId: cat.body?.category?.id ?? cat.body?.id,
    sellingRate: 295, gstPercentage: 18, unitOfMeasure: 'pcs' })})
  t('the edit is accepted', upd.status === 200, upd.status)

  if (pulled.body?.nextCursor) db.setSyncState('pull_cursor', String(pulled.body.nextCursor))
  cursor = db.getSyncState('pull_cursor') || '0'
  const p2 = await api(`/api/v1/sync/pull?cursor=${cursor}&limit=500`)
  db.applySyncEvents(p2.body?.events ?? [])
  const after = db.getProductByItemCode('SYNC-001')
  t('the till sees the new name', after && after.name === 'Sync Test Cable HD', after && after.name)
  t('...and the new price', after && Number(after.sellingRate) === 295, after && after.sellingRate)
  t('...without duplicating the row', db.countProductMirror() === 1, db.countProductMirror())

  if (p2.body?.nextCursor) db.setSyncState('pull_cursor', String(p2.body.nextCursor))

  console.log('\n— the cursor does not rewind —')
  {
    const c = db.getSyncState('pull_cursor')
    const again = await api(`/api/v1/sync/pull?cursor=${c}&limit=500`)
    t('re-pulling at the same cursor yields nothing new', (again.body?.events ?? []).length === 0,
      (again.body?.events ?? []).length)
  }

  console.log('\n— the till pairs with the branch server —')
  const paired = await api('/api/v1/system/pair-client', { method: 'POST', body: JSON.stringify({
    friendlyName: 'Counter 1', macAddress: 'AA:BB:CC:DD:EE:11' })})
  t('pairing is accepted', paired.status === 200, paired)
  const deviceId = paired.body?.clientId
  t('...and the till is given a terminal code', !!paired.body?.terminalCode, paired.body?.terminalCode)
  t('...and a device id to attribute sales to', !!deviceId, deviceId)

  console.log('\n— the manager receives stock —')
  {
    const r = await api(`/api/v1/products/${pid}/batches`, { method: 'POST', body: JSON.stringify({
      purchaseRate: 200, receivedQty: 5, rateIncludesGst: true })})
    t('a batch is received', r.status === 201, r.status)
  }

  console.log('\n— an offline sale queues, then submits for real —')
  {
    const localId = 'xapp-offline-1'
    db.enqueuePendingBill({
      clientLocalId: localId,
      payload: { clientLocalId: localId, billNumber: 'T1-90001', paymentMethod: 'CASH',
                 originDeviceId: deviceId, amountReceived: 295,
                 items: [{ productId: pid, quantity: 1, unitRate: 295, gstPercentage: 18,
                           lineDiscountPct: 0, lineDiscountAmt: 0 }] },
      display: { billNumber: 'T1-90001', total: 295 }
    })
    t('the bill is in the outbox', db.countPendingBills() === 1, db.countPendingBills())

    const queued = db.listPendingBills()[0]
    const sent = await api('/api/v1/bills', { method: 'POST', body: JSON.stringify(queued.payload) })
    t('the branch server accepts the queued bill', sent.status === 201 || sent.status === 200, sent)
    if (sent.status < 300) db.removePendingBill(localId)
    t('...and the outbox drains', db.countPendingBills() === 0, db.countPendingBills())

    const dup = await api('/api/v1/bills', { method: 'POST', body: JSON.stringify(queued.payload) })
    t('re-sending the same bill does not make a second one',
      dup.status === 200 || dup.status === 409, dup.status)
    const bills = await api('/api/v1/bills?page=1&pageSize=50')
    const matches = (bills.body?.bills ?? []).filter((b) => b.billNumber === 'T1-90001')
    t('...exactly one bill exists with that number', matches.length === 1, matches.length)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
