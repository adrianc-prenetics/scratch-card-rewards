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

// Get prize config with counts
app.get('/api/prizes', (req, res) => {
  const store = readStore()
  res.json(store)
})

// Update prize totals/remaining
app.post('/api/prizes', (req, res) => {
  const body = req.body || {}
  const store = readStore()
  if (Array.isArray(body.prizes)) {
    const map = Object.fromEntries(store.prizes.map(p => [p.id, p]))
    for (const p of body.prizes) {
      if (!map[p.id]) continue
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
    store.prizes = Object.values(map)
    writeStore(store)
  }
  res.json(store)
})

// Random draw that respects remaining counts; uses baseline when inventory is exhausted
app.post('/api/draw', (req, res) => {
  const store = readStore()
  const available = store.prizes.filter(p => (p.remaining === -1) || (p.remaining ?? 0) > 0)
  const nonBaseline = available.filter(p => !p.baseline && (p.remaining === -1 || p.remaining > 0))
  const baseline = available.find(p => p.baseline) || store.prizes.find(p => p.baseline)

  let prize
  if (nonBaseline.length > 0) {
    const pool = []
    for (const p of nonBaseline) {
      const weight = p.remaining === -1 ? 1 : Math.max(1, Math.min(1000, p.remaining))
      for (let i = 0; i < weight; i++) pool.push(p)
    }
    prize = pool[Math.floor(Math.random() * pool.length)]
  } else {
    prize = baseline
  }

  // Decrement remaining if not baseline and not unlimited
  if (prize && !prize.baseline && prize.remaining !== -1) {
    const record = store.prizes.find(p => p.id === prize.id)
    if (record && record.remaining > 0) record.remaining -= 1
    writeStore(store)
  }
  const firstName = (req.body && (req.body.firstName || req.body.name)) || ''
  const lastName = (req.body && req.body.lastName) || ''
  const email = (req.body && req.body.email) || ''

  // Append to Google Sheet (fire-and-forget)
  appendToSheet({ firstName, lastName, email, prize }).catch(() => {})

  res.json({ prize: { id: prize.id, name: prize.name, baseline: !!prize.baseline } })
})

// Serve the simple dashboard HTML at /prizes (via Vite proxy)
app.get('/prizes', (req, res) => {
  const filePath = path.resolve(process.cwd(), 'src', 'prizes.html')
  res.sendFile(filePath)
})

async function appendToSheet({ firstName, lastName, email, prize }) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1Oc1ITUZU0a49mOQI1r0CiQvJkpWMYCBaWMBOutj1kEo'
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!clientEmail || !privateKey) return
  // Handle escaped newlines from env
  privateKey = privateKey.replace(/\\n/g, '\n')
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })
  const sheets = google.sheets({ version: 'v4', auth })
  const values = [[
    new Date().toISOString(),
    firstName,
    lastName,
    email,
    prize?.name || '',
    prize?.id || '',
    prize?.baseline ? 'baseline' : ''
  ]]
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:G',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  })
}

const port = process.env.PORT || 5174
app.listen(port, () => console.log(`[server] API running on http://localhost:${port}`))


