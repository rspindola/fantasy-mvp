import { Client } from 'pg'

async function cleanDatabaseForProduction() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()

  console.log('🧹 Iniciando limpeza do banco para produção...')

  // 1. Get the admin user (rspindolaa@gmail.com)
  const adminRes = await client.query(`
    SELECT id, email FROM auth.users WHERE email = 'rspindolaa@gmail.com';
  `)

  if (adminRes.rows.length === 0) {
    throw new Error('Usuário rspindolaa@gmail.com não encontrado!')
  }

  const adminId = adminRes.rows[0].id
  console.log(`👤 Preservando usuário oficial: rspindolaa@gmail.com (${adminId})`)

  // 2. Wipe all fantasy leagues and related tables
  console.log('🏆 Limpando todas as ligas e dados de fantasy...')
  await client.query(`TRUNCATE leagues CASCADE;`)

  // 3. Delete all other users from auth and profiles
  console.log('👥 Removendo usuários demo e temporários...')
  
  // Clean auth.identities
  await client.query(`
    DELETE FROM auth.identities 
    WHERE user_id != $1;
  `, [adminId])

  // Clean profiles
  await client.query(`
    DELETE FROM profiles 
    WHERE id != $1;
  `, [adminId])

  // Clean auth.users
  const deletedUsers = await client.query(`
    DELETE FROM auth.users 
    WHERE id != $1
    RETURNING email;
  `, [adminId])

  console.log(`🗑️ Removidos ${deletedUsers.rows.length} usuários:`, deletedUsers.rows.map((r: any) => r.email))

  // 4. Verify what remains
  const remainingUsers = await client.query(`SELECT id, email FROM auth.users;`)
  const remainingProfiles = await client.query(`SELECT id, display_name FROM profiles;`)
  const remainingLeagues = await client.query(`SELECT count(*) as count FROM leagues;`)
  const remainingRealClubs = await client.query(`SELECT count(*) as count FROM real_clubs;`)
  const remainingRealPlayers = await client.query(`SELECT count(*) as count FROM real_players;`)
  const remainingFixtures = await client.query(`SELECT count(*) as count FROM fixtures;`)
  const seasonInfo = await client.query(`SELECT year, current_round, total_rounds FROM seasons LIMIT 1;`)

  console.log('\n📊 Status Atual do Banco de Dados:')
  console.log('- Usuários em auth.users:', remainingUsers.rows)
  console.log('- Perfis em profiles:', remainingProfiles.rows)
  console.log('- Ligas Fantasy:', remainingLeagues.rows[0].count)
  console.log('- Clubes Reais (Série A):', remainingRealClubs.rows[0].count)
  console.log('- Jogadores Reais:', remainingRealPlayers.rows[0].count)
  console.log('- Rodadas / Fixtures Reais:', remainingFixtures.rows[0].count)
  console.log('- Temporada Ativa:', seasonInfo.rows[0])

  await client.end()
  console.log('\n✅ Limpeza concluída com sucesso!')
}

cleanDatabaseForProduction().catch(console.error)
