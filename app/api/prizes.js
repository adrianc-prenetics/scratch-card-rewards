import { readInventory, writeInventory } from './_lib/sheets.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const prizes = await readInventory()
    return res.status(200).json({ updatedAt: new Date().toISOString(), prizes })
  }
  if (req.method === 'POST') {
    const body = req.body || {}
    const current = await readInventory()
    if (Array.isArray(body.prizes)) {
      const map = Object.fromEntries(current.map(p => [p.id, p]))
      for (const p of body.prizes) {
        if (!map[p.id]) map[p.id] = { id: p.id, name: '', total: 0, remaining: 0, baseline: false }
        if (typeof p.total === 'number') {
          map[p.id].total = p.total
        }
        if (typeof p.remaining === 'number') {
          map[p.id].remaining = p.remaining < 0 ? -1 : Math.max(0, p.remaining)
        }
        if (typeof p.name === 'string') map[p.id].name = p.name
        if (typeof p.baseline === 'boolean') map[p.id].baseline = p.baseline
      }
      const updated = Object.values(map)
      await writeInventory(updated)
      return res.status(200).json({ updatedAt: new Date().toISOString(), prizes: updated })
    }
    return res.status(400).json({ error: 'prizes array required' })
  }
  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end('Method Not Allowed')
}


