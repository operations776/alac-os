/**
 * Create a sign-in account.
 *
 *   node scripts/create-user.mjs <email> [full name]
 *
 * The password comes from ALAC_SEED_PASSWORD, or is generated and printed
 * once. It is never hardcoded and never committed: this repo is public.
 *
 * Re-running for an existing email resets that user's password rather than
 * failing, which is the useful behaviour when someone is locked out.
 */
import dotenv from 'dotenv'
import pg from 'pg'
import { randomBytes, scrypt as scryptCb } from 'node:crypto'
import { promisify } from 'node:util'

dotenv.config({ path: '.env.local', quiet: true })
const scrypt = promisify(scryptCb)

const email = process.argv[2]
const fullName = process.argv[3] ?? ''

if (!email || !email.includes('@')) {
  console.error('\n  usage: node scripts/create-user.mjs <email> [full name]\n')
  process.exit(1)
}

async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 64)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

const generated = !process.env.ALAC_SEED_PASSWORD
const password = process.env.ALAC_SEED_PASSWORD || randomBytes(12).toString('base64url')

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
await client.connect()

try {
  const {
    rows: [org],
  } = await client.query('select id, name from orgs order by created_at limit 1')
  if (!org) throw new Error('No org exists. Seed an org first.')

  const passwordHash = await hashPassword(password)

  await client.query('begin')
  try {
    // Upsert so a rerun is a password reset, not a crash. The unique index is
    // on lower(email), an expression index, so the conflict target has to be
    // that same expression rather than the bare column.
    const {
      rows: [user],
    } = await client.query(
      `insert into users (email, password_hash, full_name)
       values ($1, $2, $3)
       on conflict (lower(email)) do update
         set password_hash = excluded.password_hash,
             full_name = case when excluded.full_name <> '' then excluded.full_name
                              else users.full_name end
       returning id, (xmax = 0) as created`,
      [email.toLowerCase(), passwordHash, fullName],
    )

    await client.query(
      `insert into org_memberships (org_id, user_id, role)
       values ($1, $2, 'owner'::org_role)
       on conflict (org_id, user_id) do nothing`,
      [org.id, user.id],
    )
    await client.query('commit')

    console.log('')
    console.log(`  ${user.created ? 'Created' : 'Updated'} ${email}`)
    console.log(`  Org: ${org.name}`)
    if (generated) {
      console.log('')
      console.log(`  Password: ${password}`)
      console.log('  Shown once. Store it now.')
    } else {
      console.log('  Password: from ALAC_SEED_PASSWORD')
    }
    console.log('')
  } catch (e) {
    await client.query('rollback')
    throw e
  }
} finally {
  await client.end()
}
