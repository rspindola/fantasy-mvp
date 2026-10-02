import { Client } from 'pg'

async function setup() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()

  console.log('🔑 Atualizando auth.users para usuários demo...')

  await client.query(`
    UPDATE auth.users 
    SET 
      encrypted_password = crypt('demo123456', gen_salt('bf')),
      email_confirmed_at = NOW(),
      created_at = COALESCE(created_at, NOW()),
      updated_at = NOW(),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = json_build_object('sub', id, 'email', email, 'email_verified', true, 'phone_verified', false)::jsonb
    WHERE email LIKE 'demo_user_%@fantasy.com';
  `)

  console.log('🔑 Atualizando auth.identities...')
  await client.query(`DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'demo_user_%@fantasy.com');`)

  const usersRes = await client.query(`
    SELECT id, email FROM auth.users WHERE email LIKE 'demo_user_%@fantasy.com';
  `)

  for (const u of usersRes.rows) {
    const userId = u.id
    const userEmail = u.email

    await client.query(
      `
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        $1::uuid,
        json_build_object('sub', $2::text, 'email', $3::text, 'email_verified', true, 'phone_verified', false)::jsonb,
        'email',
        $2::text,
        NOW(),
        NOW(),
        NOW()
      );
    `,
      [userId, userId, userEmail]
    )
  }

  console.log(`✅ ${usersRes.rows.length} usuários demo configurados com a senha: demo123456`)
  await client.end()
}

setup().catch(console.error)
