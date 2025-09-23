import 'dotenv/config'
import fs from 'fs'
import path from 'path'

// For local dev via vercel dev, we persist to disk. On Vercel, this is ephemeral; consider KV.
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

export function readStore() {
  ensureStore()
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'))
}

export function writeStore(store) {
  store.updatedAt = new Date().toISOString()
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2))
}


