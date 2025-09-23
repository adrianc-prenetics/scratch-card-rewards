import { getSheetsClient } from '../_lib/sheets.js'

export default async function handler(req, res) {
  const expected = process.env.ADMIN_API_KEY
  if (expected && req.headers['x-admin-key'] !== expected) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const range = typeof req.query.range === 'string' ? req.query.range : 'Sheet1!A:G'
  try {
    const { sheets, spreadsheetId } = await getSheetsClient()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId, range })
    return res.status(200).json({ values: r.data.values || [] })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'failed_to_read' })
  }
}


