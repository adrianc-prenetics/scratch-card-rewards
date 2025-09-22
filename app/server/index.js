// Minimal Express API for prize configuration and draws
import express from 'express'
import fs from 'fs'
import path from 'path'

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
        { id: 'hat', name: 'Hat', remaining: 1000, total: 1000 },
        { id: 'sixpack', name: 'Six Pack', remaining: 500, total: 500 },
        { id: 'kit', name: 'Daily Essentials Kit', remaining: 10, total: 10 },
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
  res.json({ prize: { id: prize.id, name: prize.name, baseline: !!prize.baseline } })
})

const port = process.env.PORT || 5174
app.listen(port, () => console.log(`[server] API running on http://localhost:${port}`))


