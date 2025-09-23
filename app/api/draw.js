import { readInventory, decrementInventory, appendSheetRow } from './_lib/sheets.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end('Method Not Allowed')
  }
  const body = req.body || {}
  const prizesAll = await readInventory()

  const available = prizesAll.filter(p => (p.remaining === -1) || (p.remaining ?? 0) > 0)
  const nonBaseline = available.filter(p => !p.baseline && (p.remaining === -1 || p.remaining > 0))
  const baseline = available.find(p => p.baseline) || prizesAll.find(p => p.baseline)

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

  if (prize && !prize.baseline && prize.remaining !== -1) {
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


