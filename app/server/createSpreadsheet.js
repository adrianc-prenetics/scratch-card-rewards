import 'dotenv/config'
import { google } from 'googleapis'

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag)
  return idx > -1 && process.argv[idx + 1] ? process.argv[idx + 1] : undefined
}

async function main() {
  const title = getArgValue('--title') || 'Scratch Rewards Entries'

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!clientEmail || !privateKey) {
    console.error('[createSpreadsheet] Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in .env')
    process.exit(1)
  }
  privateKey = privateKey.replace(/\\n/g, '\n')

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  })

  const sheets = google.sheets({ version: 'v4', auth })

  const createRes = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
    },
  })
  const spreadsheetId = createRes.data.spreadsheetId

  // Seed header row to match server expectations
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1:G1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        'Timestamp',
        'First Name',
        'Last Name',
        'Email',
        'Prize Name',
        'Prize ID',
        'Baseline',
      ]],
    },
  })

  // Create Inventory tab with headers
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { addSheet: { properties: { title: 'Inventory' } } }
      ]
    }
  }).catch(() => {})
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Inventory!A1:E1',
    valueInputOption: 'RAW',
    requestBody: { values: [[ 'id', 'name', 'total', 'remaining', 'baseline' ]] }
  })

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
  console.log('\n[createSpreadsheet] Spreadsheet created:')
  console.log('ID:  ' + spreadsheetId)
  console.log('URL: ' + url + '\n')
}

main().catch((err) => {
  console.error('[createSpreadsheet] Failed:', err?.errors || err?.message || err)
  process.exit(1)
})


