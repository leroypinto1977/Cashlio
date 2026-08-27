// Clears the revocation the licence suite left behind, refreshes the branch
// server back to healthy, and writes a manager token for the till suite.
const ROOT = process.env.XAPP_ROOT
const fs = require('fs')
const { PrismaClient } = require(ROOT + '/admin-saas/node_modules/@prisma/client')
const saas = new PrismaClient({ datasources: { db: { url: process.env.SAAS_DATABASE_URL } } })
const LOCAL = process.env.XAPP_LOCAL_URL
;(async () => {
  await saas.license.updateMany({ where: { licenseKey: 'XAPP-0001' },
    data: { revokedAt: null, revokeReason: null, status: 'ACTIVE' } })
  const login = await fetch(LOCAL + '/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'manager', password: 'password123' }) })
  const lb = await login.json()
  const token = lb.token || lb.accessToken
  const r = await fetch(LOCAL + '/api/v1/system/license-refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } })
  console.log('  licence restored, refresh ->', r.status)
  fs.writeFileSync(process.env.XAPP_TOKEN_FILE, token)
  await saas.$disconnect()
})().catch(async (e) => { console.error(e); await saas.$disconnect(); process.exit(1) })
