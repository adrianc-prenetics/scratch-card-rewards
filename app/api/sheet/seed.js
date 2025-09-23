import { ensureInventorySeed, createSpreadsheetWithTabs } from '../_lib/sheets.js'

export default async function handler(req, res) {
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
      return res.status(200).json({ ok: true, spreadsheetId: created.spreadsheetId, url: created.url, created: true })
    }
    const r = await ensureInventorySeed(prizes)
    const url = `https://docs.google.com/spreadsheets/d/${r.spreadsheetId}/edit`
    return res.status(200).json({ ok: true, spreadsheetId: r.spreadsheetId, url })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'failed_to_seed' })
  }
}


