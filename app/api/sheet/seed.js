import { ensureInventorySeed, createSpreadsheetWithTabs } from '../_lib/sheets.js'

export default async function handler(req, res) {
  // Allow preflight for custom headers and JSON
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key')
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).end('Method Not Allowed')
  }
  const expected = process.env.ADMIN_API_KEY
  if (expected && req.headers['x-admin-key'] !== expected) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  try {
    const body = req.body || {}
    const prizes = Array.isArray(body.prizes) ? body.prizes : undefined
    // If no spreadsheet configured yet or body.createNew === true, create and seed
    if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID || body.createNew) {
      const created = await createSpreadsheetWithTabs(body.title || 'Scratch Rewards', prizes)
      res.setHeader('Access-Control-Allow-Origin', '*')
      return res.status(200).json({ ok: true, spreadsheetId: created.spreadsheetId, url: created.url, created: true })
    }
    const r = await ensureInventorySeed(prizes)
    const url = `https://docs.google.com/spreadsheets/d/${r.spreadsheetId}/edit`
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).json({ ok: true, spreadsheetId: r.spreadsheetId, url })
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(500).json({ error: e.message || 'failed_to_seed' })
  }
}


