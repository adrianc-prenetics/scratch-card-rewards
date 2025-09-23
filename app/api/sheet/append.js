import { getSheetsClient } from '../_lib/sheets.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end('Method Not Allowed')
  }
  const expected = process.env.ADMIN_API_KEY
  if (expected && req.headers['x-admin-key'] !== expected) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const body = req.body || {}
  const values = Array.isArray(body.values) ? body.values : null
  const range = typeof body.range === 'string' ? body.range : 'Sheet1!A:G'
  if (!values) return res.status(400).json({ error: 'values array required' })
  try {
    const { sheets, spreadsheetId } = await getSheetsClient()
    const r = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    })
    return res.status(200).json({ updatedRange: r.data.updates?.updatedRange || null })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'failed_to_append' })
  }
}


