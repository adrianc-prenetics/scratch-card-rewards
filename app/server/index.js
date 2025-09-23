// Minimal Express API for prize configuration and draws
import 'dotenv/config'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { google } from 'googleapis'

const app = express()
app.use(express.json())

const dataDir = path.resolve(process.cwd(), 'server', 'data')
const dataFile = path.join(dataDir, 'prizes.json')
const sheetIdFile = path.join(dataDir, 'sheet-id.json')
const INVENTORY_TAB = process.env.GOOGLE_SHEETS_INVENTORY_TAB || 'Inventory'

// Default prize set used when Inventory sheet is empty or spreadsheet ID is not configured yet
const DEFAULT_PRIZES = [
  { id: 'discount', name: '10% off first order', total: -1, remaining: -1, baseline: true },
  { id: 'hat', name: 'IM8 Limited Edition Embroidered Logo Cap', total: 1000, remaining: 1000, baseline: false },
  { id: 'sixpack', name: 'Daily Ultimate Essentials 6 Sticks Pack', total: 500, remaining: 500, baseline: false },
  { id: 'kit', name: 'Daily Ultimate Essentials Kit', total: 10, remaining: 10, baseline: false },
]

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(dataFile)) {
    const initial = {
      updatedAt: new Date().toISOString(),
      prizes: [
        { id: 'discount', name: '10% off first order', remaining: -1, total: -1, baseline: true },
        { id: 'hat', name: 'IM8 Limited Edition Embroidered Logo Cap', remaining: 1000, total: 1000 },
        { id: 'sixpack', name: 'Daily Ultimate Essentials 6 Sticks Pack', remaining: 500, total: 500 },
        { id: 'kit', name: 'Daily Ultimate Essentials Kit', remaining: 10, total: 10 },
      ],
    }
    fs.writeFileSync(dataFile, JSON.stringify(initial, null, 2))
  }
}

function readStore() {
  ensureStore()
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'))
}

function writeStore(store) {
  store.updatedAt = new Date().toISOString()
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2))
}

// Get prize config with counts from Inventory tab
app.get('/api/prizes', async (req, res) => {
  try {
    // If no spreadsheet configured yet, return defaults (UI can seed via /api/sheet/seed)
    if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
      return res.json({ updatedAt: new Date().toISOString(), prizes: DEFAULT_PRIZES })
    }
    const { sheets, spreadsheetId } = await getSheetsClient()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${INVENTORY_TAB}!A2:E` })
    const rows = r.data.values || []
    const prizes = (rows.length === 0 ? DEFAULT_PRIZES : rows.map(row => ({ id: row[0], name: row[1], total: Number(row[2]||0), remaining: Number(row[3]||0), baseline: String(row[4]||'').toLowerCase()==='true' })))
    res.json({ updatedAt: new Date().toISOString(), prizes })
  } catch (e) {
    res.status(500).json({ error: 'failed_to_read_inventory' })
  }
})

// Update prize totals/remaining -> writes to Inventory tab
app.post('/api/prizes', async (req, res) => {
  try {
    const body = req.body || {}
    const { sheets, spreadsheetId } = await getSheetsClient()
    const current = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${INVENTORY_TAB}!A2:E` })
    const rows = current.data.values || []
    const map = Object.fromEntries(rows.map(row => [row[0], { id: row[0], name: row[1], total: Number(row[2]||0), remaining: Number(row[3]||0), baseline: String(row[4]||'').toLowerCase()==='true' }]))
    if (Array.isArray(body.prizes)) {
      for (const p of body.prizes) {
        if (!map[p.id]) map[p.id] = { id: p.id, name: '', total: 0, remaining: 0, baseline: false }
        if (typeof p.total === 'number') {
          const diff = p.total - (map[p.id].total ?? 0)
          map[p.id].total = p.total
          if (map[p.id].remaining !== -1) {
            map[p.id].remaining = Math.max(0, (map[p.id].remaining ?? 0) + diff)
          }
        }
        if (typeof p.remaining === 'number' && map[p.id].remaining !== -1) {
          map[p.id].remaining = Math.max(0, p.remaining)
        }
        if (typeof p.name === 'string') map[p.id].name = p.name
        if (typeof p.baseline === 'boolean') map[p.id].baseline = p.baseline
      }
      const updated = Object.values(map)
      await sheets.spreadsheets.values.update({ spreadsheetId, range: `${INVENTORY_TAB}!A1:E1`, valueInputOption: 'RAW', requestBody: { values: [[ 'id','name','total','remaining','baseline' ]] } })
      await sheets.spreadsheets.values.update({ spreadsheetId, range: `${INVENTORY_TAB}!A2:E`, valueInputOption: 'RAW', requestBody: { values: updated.map(p => [p.id, p.name, String(p.total), String(p.remaining), p.baseline ? 'TRUE' : 'FALSE']) } })
      return res.json({ updatedAt: new Date().toISOString(), prizes: updated })
    }
    res.status(400).json({ error: 'prizes array required' })
  } catch (e) {
    res.status(500).json({ error: 'failed_to_update_inventory' })
  }
})

// Seed Inventory tab with defaults or provided prizes; creates sheet if missing
app.post('/api/sheet/seed', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return

    const body = req.body || {}
    const prizes = Array.isArray(body.prizes) && body.prizes.length > 0 ? body.prizes : DEFAULT_PRIZES

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    if (!clientEmail || !privateKey) return res.status(400).json({ error: 'missing_service_account_envs' })
    privateKey = privateKey.replace(/\\n/g, '\n')
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ]
    })
    const sheets = google.sheets({ version: 'v4', auth })

    let spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    if (!spreadsheetId) {
      const createRes = await sheets.spreadsheets.create({ requestBody: { properties: { title: 'Scratch Rewards' } } })
      spreadsheetId = createRes.data.spreadsheetId
      // NOTE: we cannot write back to .env automatically; return the ID for the user to set
    }

    // Ensure entries header
    await sheets.spreadsheets.values.update({ spreadsheetId, range: 'Sheet1!A1:G1', valueInputOption: 'RAW', requestBody: { values: [[ 'Timestamp','First Name','Last Name','Email','Prize Name','Prize ID','Baseline' ]] } })
    // Add Inventory sheet if missing
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: INVENTORY_TAB } } }] } }).catch(() => {})
    // Write headers and seed rows
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${INVENTORY_TAB}!A1:E1`, valueInputOption: 'RAW', requestBody: { values: [[ 'id','name','total','remaining','baseline' ]] } })
    const values = prizes.map(p => [p.id, p.name, String(p.total), String(p.remaining), p.baseline ? 'TRUE' : 'FALSE'])
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${INVENTORY_TAB}!A2:E`, valueInputOption: 'RAW', requestBody: { values } })

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    res.json({ ok: true, spreadsheetId, url })
  } catch (e) {
    console.error('[seed] failed:', e?.message || e)
    res.status(500).json({ error: 'failed_to_seed', details: e?.message || String(e) })
  }
})

// Helpers to read/decrement inventory in Google Sheet
async function readInventoryFromSheet() {
  const { sheets, spreadsheetId } = await getSheetsClient()
  const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${INVENTORY_TAB}!A2:E` })
  const rows = r.data.values || []
  if (rows.length === 0) return DEFAULT_PRIZES
  return rows.map(row => ({ id: row[0], name: row[1], total: Number(row[2]||0), remaining: Number(row[3]||0), baseline: String(row[4]||'').toLowerCase()==='true' }))
}

async function decrementInventoryInSheet(prizeId) {
  const { sheets, spreadsheetId } = await getSheetsClient()
  const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${INVENTORY_TAB}!A2:E` })
  const rows = r.data.values || []
  let rowIndex = -1
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][0] || '') === prizeId) { rowIndex = i; break }
  }
  if (rowIndex === -1) return null
  const row = rows[rowIndex]
  const remaining = Number(row[3] || 0)
  const baseline = String(row[4] || '').toLowerCase() === 'true'
  if (!baseline && remaining > 0) {
    const targetCell = `${INVENTORY_TAB}!D${rowIndex + 2}`
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: targetCell,
      valueInputOption: 'RAW',
      requestBody: { values: [[ String(remaining - 1) ]] }
    })
    return remaining - 1
  }
  return remaining
}

// Random draw that respects remaining counts; uses baseline when inventory is exhausted
app.post('/api/draw', async (req, res) => {
  try {
    const prizes = await readInventoryFromSheet()
    const available = prizes.filter(p => (p.remaining === -1) || (p.remaining ?? 0) > 0)
    const nonBaseline = available.filter(p => !p.baseline && (p.remaining === -1 || p.remaining > 0))
    const baseline = available.find(p => p.baseline) || prizes.find(p => p.baseline)

    // Weighted random including the baseline so it appears frequently
    // Configure baseline weight via BASELINE_WEIGHT (default 1000)
    const baselineWeight = Math.max(1, Number(process.env.BASELINE_WEIGHT || 1000))
    const pool = []
    let prize
    if (baseline) {
      for (let i = 0; i < baselineWeight; i++) pool.push(baseline)
    }
    for (const p of nonBaseline) {
      const weight = p.remaining === -1 ? 1 : Math.max(1, Math.min(1000, p.remaining))
      for (let i = 0; i < weight; i++) pool.push(p)
    }
    prize = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : baseline

    if (prize && !prize.baseline && prize.remaining !== -1) {
      await decrementInventoryInSheet(prize.id)
    }
    return res.json({ prize: { id: prize.id, name: prize.name, baseline: !!prize.baseline } })
  } catch (e) {
    console.error('[draw] failed:', e?.message || e)
    return res.status(500).json({ error: 'draw_failed', details: e?.message || String(e) })
  }
})

// Simple debug endpoint to inspect parsed inventory (do not expose in production)
app.get('/api/debug/inventory', async (req, res) => {
  try {
    const prizes = await readInventoryFromSheet()
    res.json({ prizes })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'failed_to_read_inventory' })
  }
})

// Serve the simple dashboard HTML at /prizes (via Vite proxy)
app.get('/prizes', (req, res) => {
  const filePath = path.resolve(process.cwd(), 'src', 'prizes.html')
  res.sendFile(filePath)
})

// Removed Google Sheet append for PII; inventory is updated elsewhere

// Helper to get an authenticated Sheets client
async function getSheetsClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!clientEmail || !privateKey) throw new Error('Missing Google service account env vars')
  privateKey = privateKey.replace(/\\n/g, '\n')
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive'
    ]
  })
  const sheets = google.sheets({ version: 'v4', auth })
  let spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID

  if (!spreadsheetId) {
    // Try cache file
    try {
      if (fs.existsSync(sheetIdFile)) {
        const cached = JSON.parse(fs.readFileSync(sheetIdFile, 'utf8'))
        if (cached && cached.spreadsheetId) spreadsheetId = cached.spreadsheetId
      }
    } catch {}
  }

  if (!spreadsheetId) {
    // Create a new spreadsheet and seed headers + default inventory
    const createRes = await sheets.spreadsheets.create({ requestBody: { properties: { title: 'Scratch Rewards' } } })
    spreadsheetId = createRes.data.spreadsheetId
    // Seed entries header
    await sheets.spreadsheets.values.update({ spreadsheetId, range: 'Sheet1!A1:G1', valueInputOption: 'RAW', requestBody: { values: [[ 'Timestamp','First Name','Last Name','Email','Prize Name','Prize ID','Baseline' ]] } })
    // Ensure Inventory sheet
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: INVENTORY_TAB } } }] } }).catch(() => {})
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${INVENTORY_TAB}!A1:E1`, valueInputOption: 'RAW', requestBody: { values: [[ 'id','name','total','remaining','baseline' ]] } })
    const seedRows = DEFAULT_PRIZES.map(p => [p.id, p.name, String(p.total), String(p.remaining), p.baseline ? 'TRUE' : 'FALSE'])
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${INVENTORY_TAB}!A2:E`, valueInputOption: 'RAW', requestBody: { values: seedRows } })
    // Cache ID locally for future runs
    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
      fs.writeFileSync(sheetIdFile, JSON.stringify({ spreadsheetId }, null, 2))
    } catch {}
  }

  return { sheets, spreadsheetId }
}

function requireAdmin(req, res) {
  const expected = process.env.ADMIN_API_KEY
  if (!expected) return true
  const provided = req.headers['x-admin-key']
  if (provided === expected) return true
  res.status(401).json({ error: 'unauthorized' })
  return false
}


// Read rows from the sheet (default Sheet1!A:G)
app.get('/api/sheet/rows', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return
    const range = typeof req.query.range === 'string' ? req.query.range : 'Sheet1!A:G'
    const { sheets, spreadsheetId } = await getSheetsClient()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId, range })
    res.json({ values: r.data.values || [] })
  } catch (e) {
    res.status(500).json({ error: e.message || 'failed_to_read' })
  }
})

// Append rows to the sheet. Body: { values: [[...], [...]] }
app.post('/api/sheet/append', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return
    const body = req.body || {}
    const values = Array.isArray(body.values) ? body.values : null
    const range = typeof body.range === 'string' ? body.range : 'Sheet1!A:G'
    if (!values) return res.status(400).json({ error: 'values array required' })
    const { sheets, spreadsheetId } = await getSheetsClient()
    const r = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    })
    res.json({ updatedRange: r.data.updates?.updatedRange || null })
  } catch (e) {
    res.status(500).json({ error: e.message || 'failed_to_append' })
  }
})

// Update a specific range. Body: { range: 'Sheet1!A2:C2', values: [[...]] }
app.put('/api/sheet/update', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return
    const body = req.body || {}
    const range = typeof body.range === 'string' ? body.range : null
    const values = Array.isArray(body.values) ? body.values : null
    if (!range || !values) return res.status(400).json({ error: 'range and values required' })
    const { sheets, spreadsheetId } = await getSheetsClient()
    const r = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    })
    res.json({ updatedRange: r.data.updatedRange || null })
  } catch (e) {
    res.status(500).json({ error: e.message || 'failed_to_update' })
  }
})

const port = process.env.PORT || 5174
app.listen(port, () => console.log(`[server] API running on http://localhost:${port}`))


