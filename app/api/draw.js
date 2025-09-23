import { readInventory, decrementInventory, appendSheetRow } from './_lib/sheets.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end('Method Not Allowed')
  }
  const body = req.body || {}
  const prizesAll = await readInventory()

  const available = prizesAll.filter(p => (p.remaining === -1) || (p.remaining ?? 0) > 0)
  if (available.length === 0) return res.status(503).json({ error: 'sold_out' })
  // Treat all prizes uniformly; weight by tempered remaining, unlimited uses UNLIMITED_WEIGHT
  const temperature = 0.5
  const unlimitedWeight = 1000
  const weightOf = (p) => {
    const base = p.remaining === -1 ? unlimitedWeight : Math.max(1, p.remaining)
    return Math.max(1, Math.min(2000, Math.floor(Math.pow(base, temperature))))
  }
  const items = available.map(p => ({ p, w: weightOf(p) }))
  const total = items.reduce((s, x) => s + x.w, 0)
  let r = Math.random() * total
  let acc = 0
  let prize = items[0].p
  for (const { p, w } of items) {
    acc += w
    if (r <= acc) { prize = p; break }
  }

  if (prize && prize.remaining !== -1) {
    await decrementInventory(prize.id)
  }

  const firstName = (body && (body.firstName || body.name)) || ''
  const lastName = (body && body.lastName) || ''
  const email = (body && body.email) || ''

  try {
    await appendSheetRow([
      new Date().toISOString(),
      firstName,
      lastName,
      email,
      prize?.name || '',
      prize?.id || '',
      prize?.baseline ? 'baseline' : ''
    ])
  } catch {}

  return res.status(200).json({ prize: { id: prize.id, name: prize.name, baseline: !!prize.baseline } })
}


