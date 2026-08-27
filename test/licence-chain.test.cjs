/**
 * Cross-app end-to-end: App A (admin-saas, real Next server over HTTP)
 * <- proxied by -> App B (main-local Express, real Postgres).
 *
 * This is the seam no existing suite covers: main-local's e2e stubs global.fetch
 * for /licenses/refresh, and admin-saas's suite exercises claimSeat() directly
 * rather than the HTTP routes. Here both routes are real.
 */
const ROOT = process.env.XAPP_ROOT
const SAAS = process.env.XAPP_SAAS_URL
const LOCAL = process.env.XAPP_LOCAL_URL
const HW = process.env.XAPP_HW || 'XAPP-HARDWARE-0001'

const { PrismaClient } = require(ROOT + '/admin-saas/node_modules/@prisma/client')
const saasDb = new PrismaClient({ datasources: { db: { url: process.env.SAAS_DATABASE_URL } } })

let pass = 0, fail = 0
const t = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, detail !== undefined ? JSON.stringify(detail) : '') }
}

async function post(base, path, body) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) },
    body: JSON.stringify(body)
  })
  let b = null; try { b = await res.json() } catch {}
  return { status: res.status, body: b }
}
let TOKEN = null
async function get(base, path, token) {
  const tk = token || TOKEN
  const res = await fetch(base + path, { headers: tk ? { Authorization: 'Bearer ' + tk } : {} })
  let b = null; try { b = await res.json() } catch {}
  return { status: res.status, body: b }
}

;(async () => {
  console.log('\n— the licence server is actually up —')
  {
    const r = await post(SAAS, '/api/v1/licenses/activate', {})
    t('an empty activation is refused, not crashed', r.status === 400 && r.body.error === 'MISSING_PARAMETERS', r)
  }

  console.log('\n— an unknown licence key —')
  {
    const r = await post(SAAS, '/api/v1/licenses/activate', { licenseKey: 'NOPE-0000', hardwareId: HW })
    t('is not found', r.status === 404 && r.body.error === 'LICENSE_NOT_FOUND', r)
  }

  // Seed a tenant + a single-seat licence in App A's own database.
  const tenant = await saasDb.tenant.create({ data: {
    ownerName: 'Cross App', companyName: 'Cross App Traders', contactEmail: 'x@test.local' }})
  const lic = await saasDb.license.create({ data: {
    licenseKey: 'XAPP-0001', tenantId: tenant.id, status: 'PENDING',
    validDurationDays: 365, maxBranches: 1, maxSystemsPerBranch: 3 }})

  console.log('\n— the shop activates through the branch server, over real HTTP —')
  let activated
  {
    activated = await post(LOCAL, '/api/v1/system/save-config', {
      licenseKey: 'XAPP-0001', hardwareId: HW, shopName: 'Cross App Traders', branchName: 'Main'
    })
    t('the branch server accepts the activation', activated.status === 200 && activated.body.success === true, activated)
  }
  {
    const fresh = await saasDb.license.findUnique({ where: { id: lic.id } })
    t('App A flipped the licence to ACTIVE', fresh.status === 'ACTIVE', fresh && fresh.status)
    t('...and gave it a hard expiry', !!fresh.expiresAt)
    const seats = await saasDb.licenseInstall.findMany({ where: { licenseId: lic.id, releasedAt: null } })
    t('...and recorded exactly one seat', seats.length === 1, seats.length)
    t('...bound to this machine', seats[0] && seats[0].hardwareId === HW)
  }

  console.log('\n— the shop finishes onboarding —')
  {
    const r = await post(LOCAL, '/api/v1/system/setup-profile', {
      branchName: 'Main', shopName: 'Cross App Traders', adminUsername: 'manager',
      adminPassword: 'password123', location: '1 Test Road', gst: '27ABCDE1234F1Z0' })
    t('the profile is accepted', r.status === 200 && r.body.success === true, r)
  }
  {
    const r = await post(LOCAL, '/api/v1/system/setup-profile', {
      branchName: 'Main', shopName: 'Someone Else', adminUsername: 'intruder',
      adminPassword: 'password123', location: 'x', gst: '27ABCDE1234F1Z0' })
    t('...and a second run cannot mint another admin', r.status === 409, r)
  }
  {
    const r = await post(LOCAL, '/api/v1/auth/login', { username: 'manager', password: 'password123' })
    t('the manager can log in', r.status === 200 && !!(r.body.token || r.body.accessToken), r.status)
    TOKEN = r.body.token || r.body.accessToken
  }

  console.log('\n— the branch server verified what App A signed —')
  {
    const r = await get(LOCAL, '/api/v1/system/license-status')
    t('the licence reads as valid on the branch', r.status === 200 && r.body.status.ok === true, r.body)
    t('...and is not locked', r.body.status.locked === false, r.body)
    t('...with the clock in agreement', r.body.status.clock.ok === true, r.body.status.clock)
  }

  console.log('\n— activating the same licence twice —')
  {
    const r = await post(LOCAL, '/api/v1/system/save-config', {
      licenseKey: 'XAPP-0001', hardwareId: HW, shopName: 'Cross App Traders', branchName: 'Main' })
    t('is refused by the branch server', r.status === 409 && r.body.error === 'LICENSE_ALREADY_ACTIVATED', r)
  }

  console.log('\n— a second machine on a one-seat licence —')
  {
    const r = await post(SAAS, '/api/v1/licenses/activate', { licenseKey: 'XAPP-0001', hardwareId: 'OTHER-MACHINE' })
    t('is refused by App A', r.status === 403 && r.body.error === 'LICENSE_SEAT_LIMIT', r)
    t('...and says how many seats there are', r.body && r.body.seatLimit === 1, r.body)
    const seats = await saasDb.licenseInstall.count({ where: { licenseId: lic.id, releasedAt: null } })
    t('...without quietly taking the seat', seats === 1, seats)
  }

  console.log('\n— the refresh route, for real —')
  {
    const r = await post(SAAS, '/api/v1/licenses/refresh', { licenseKey: 'XAPP-0001', hardwareId: HW })
    t('App A issues a fresh token', r.status === 200 && r.body.success === true && !!r.body.jwt, r.status)
    t('...and tells the shop what time it is', !!(r.body && r.body.serverNow), r.body && r.body.serverNow)
  }
  {
    const r = await post(LOCAL, '/api/v1/system/license-refresh', {})
    t('the branch server refreshes against it', r.status === 200 && r.body.success === true, r)
  }

  console.log('\n— revoking the licence from the dashboard —')
  {
    await saasDb.license.update({ where: { id: lic.id }, data: {
      revokedAt: new Date(), revokeReason: 'Non-payment', status: 'REVOKED' }})
    const r = await post(SAAS, '/api/v1/licenses/refresh', { licenseKey: 'XAPP-0001', hardwareId: HW })
    t('App A refuses to refresh', r.status === 403 && r.body.error === 'LICENSE_REVOKED', r)
    t('...and says why', r.body && r.body.revokeReason === 'Non-payment', r.body)
  }
  {
    const r = await post(LOCAL, '/api/v1/system/license-refresh', {})
    t('the branch server reports the refusal', r.body && r.body.success === false, r)
    const s = await get(LOCAL, '/api/v1/system/license-status')
    t('...and the shop is now locked', s.body.status.locked === true, s.body)
    t('...for a licence reason', s.body.status.reason === 'LICENSE_BLOCKED', s.body.status.reason)
    t('...naming the reason the dashboard gave', JSON.stringify(s.body || {}).includes('Non-payment'), s.body)
  }

  console.log('\n— a locked shop cannot bill —')
  {
    const r = await post(LOCAL, '/api/v1/bills', { items: [], paymentMode: 'CASH' })
    t('the till is refused with 402', r.status === 402, r.status)
    t('...for the licence, not for the cart', r.body && r.body.error === 'LICENSE_LOCKED', r.body)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  await saasDb.$disconnect()
  process.exit(fail ? 1 : 0)
})().catch(async (e) => { console.error(e); await saasDb.$disconnect(); process.exit(1) })
