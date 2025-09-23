import 'dotenv/config'
import { google } from 'googleapis'

export async function getSheetsClient() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!spreadsheetId) throw new Error('Missing GOOGLE_SHEETS_SPREADSHEET_ID')
  if (!clientEmail || !privateKey) throw new Error('Missing Google service account env vars')
  privateKey = privateKey.replace(/\\n/g, '\n')
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })
  const sheets = google.sheets({ version: 'v4', auth })
  return { sheets, spreadsheetId }
}

export async function appendSheetRow(values, range = 'Sheet1!A:G') {
  const { sheets, spreadsheetId } = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] }
  })
}

// Inventory helpers using a second tab named "Inventory"
const INVENTORY_TAB = 'Inventory'
const INVENTORY_RANGE = `${INVENTORY_TAB}!A2:E` // columns: id, name, total, remaining, baseline

const DEFAULT_PRIZES = [
  { id: 'discount', name: '10% off first order', total: -1, remaining: -1, baseline: true },
  { id: 'hat', name: 'IM8 Limited Edition Embroidered Logo Cap', total: 1000, remaining: 1000, baseline: false },
  { id: 'sixpack', name: 'Daily Ultimate Essentials 6 Sticks Pack', total: 500, remaining: 500, baseline: false },
  { id: 'kit', name: 'Daily Ultimate Essentials Kit', total: 10, remaining: 10, baseline: false },
]

export async function readInventory() {
  const { sheets, spreadsheetId } = await getSheetsClient()
  // Try to read; if tab missing, throw to caller
  const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: INVENTORY_RANGE })
  const rows = r.data.values || []
  if (rows.length === 0) return DEFAULT_PRIZES
  const prizes = rows.map((row) => ({
    id: row[0],
    name: row[1],
    total: toNum(row[2]),
    remaining: toNum(row[3]),
    baseline: toBool(row[4]),
  })).filter(p => !!p.id)
  return prizes
}

export async function writeInventory(prizes) {
  const { sheets, spreadsheetId } = await getSheetsClient()
  const headerRange = `${INVENTORY_TAB}!A1:E1`
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: headerRange,
    valueInputOption: 'RAW',
    requestBody: { values: [[ 'id', 'name', 'total', 'remaining', 'baseline' ]] }
  })
  const rows = prizes.map(p => [p.id, p.name, numOrEmpty(p.total), numOrEmpty(p.remaining), p.baseline ? 'TRUE' : 'FALSE'])
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: INVENTORY_RANGE,
    valueInputOption: 'RAW',
    requestBody: { values: rows }
  })
}

export async function decrementInventory(prizeId) {
  const { sheets, spreadsheetId } = await getSheetsClient()
  // Read with row numbers by fetching the entire sheet
  const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: INVENTORY_RANGE })
  const rows = r.data.values || []
  let rowIndex = -1
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][0] || '') === prizeId) { rowIndex = i; break }
  }
  if (rowIndex === -1) return null
  const row = rows[rowIndex]
  const remaining = toNum(row[3])
  const baseline = toBool(row[4])
  if (!baseline && remaining > 0) {
    const targetCell = `${INVENTORY_TAB}!D${rowIndex + 2}` // D column = remaining
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: targetCell,
      valueInputOption: 'RAW',
      requestBody: { values: [[ String(remaining - 1) ]] }
    })
  }
  return {
    id: row[0],
    name: row[1],
    total: toNum(row[2]),
    remaining: Math.max(0, remaining - (baseline ? 0 : (remaining > 0 ? 1 : 0))),
    baseline,
  }
}

// Create a new spreadsheet owned by the service account with entries + Inventory seeded
export async function createSpreadsheetWithTabs(title = 'Scratch Rewards', prizes = DEFAULT_PRIZES) {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!clientEmail || !privateKey) throw new Error('Missing Google service account env vars')
  privateKey = privateKey.replace(/\\n/g, '\n')
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })
  const sheets = google.sheets({ version: 'v4', auth })
  const createRes = await sheets.spreadsheets.create({ requestBody: { properties: { title } } })
  const spreadsheetId = createRes.data.spreadsheetId
  await sheets.spreadsheets.values.update({ spreadsheetId, range: 'Sheet1!A1:G1', valueInputOption: 'RAW', requestBody: { values: [[ 'Timestamp','First Name','Last Name','Email','Prize Name','Prize ID','Baseline' ]] } })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: INVENTORY_TAB } } }] } }).catch(() => {})
  await sheets.spreadsheets.values.update({ spreadsheetId, range: 'Inventory!A1:E1', valueInputOption: 'RAW', requestBody: { values: [[ 'id','name','total','remaining','baseline' ]] } })
  const values = prizes.map(p => [p.id, p.name, numOrEmpty(p.total), numOrEmpty(p.remaining), p.baseline ? 'TRUE' : 'FALSE'])
  await sheets.spreadsheets.values.update({ spreadsheetId, range: 'Inventory!A2:E', valueInputOption: 'RAW', requestBody: { values } })
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
  return { spreadsheetId, url }
}

export const DEFAULTS = { DEFAULT_PRIZES, INVENTORY_TAB, INVENTORY_RANGE }

export async function ensureInventorySeed(prizes = DEFAULT_PRIZES) {
  const { sheets, spreadsheetId } = await getSheetsClient()
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: INVENTORY_TAB } } }] }
    })
  } catch {}
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${INVENTORY_TAB}!A1:E1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[ 'id', 'name', 'total', 'remaining', 'baseline' ]] }
  })
  const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: INVENTORY_RANGE })
  const rows = r.data.values || []
  if (rows.length === 0) {
    const values = prizes.map(p => [p.id, p.name, numOrEmpty(p.total), numOrEmpty(p.remaining), p.baseline ? 'TRUE' : 'FALSE'])
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: INVENTORY_RANGE,
      valueInputOption: 'RAW',
      requestBody: { values }
    })
  }
  return { spreadsheetId }
}

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : (v === '-1' ? -1 : 0)
}

function numOrEmpty(v) {
  return (v === undefined || v === null || v === '') ? '' : String(v)
}

function toBool(v) {
  if (typeof v === 'boolean') return v
  const s = String(v || '').toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}


