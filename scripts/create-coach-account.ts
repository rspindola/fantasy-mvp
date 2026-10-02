import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'

async function createAccounts() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ilinrgasbkhvzujltbhp.supabase.co'
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_H9-s-TPy4RMmTP7iAu8BHg_W6-HA3KS'
  const supabase = createClient(supabaseUrl, supabaseKey)

  const accounts = [
    { email: 'furia@fantasy.com', teamName: 'Furia Rubro-Negra', coachName: 'Técnico Fúria' },
    { email: 'verdao@fantasy.com', teamName: 'Verdão Imparável', coachName: 'Técnico Verdão' },
  ]

  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()

  for (const acc of accounts) {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: acc.email,
      password: 'password123',
    })

    await client.query(`UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = $1;`, [acc.email])

    const u = (await client.query(`SELECT id FROM auth.users WHERE email = $1;`, [acc.email])).rows[0]
    const userId = u.id

    await client.query(
      `
      INSERT INTO profiles (id, display_name) 
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET display_name = $2;
    `,
      [userId, acc.coachName]
    )

    await client.query(
      `
      UPDATE fantasy_teams 
      SET user_id = $1 
      WHERE name = $2 AND league_id = (SELECT id FROM leagues WHERE invite_code = 'DEMO2026');
    `,
      [userId, acc.teamName]
    )

    console.log(`✅ ${acc.email} vinculado a ${acc.teamName}!`)
  }

  await client.end()
}

createAccounts().catch(console.error)
