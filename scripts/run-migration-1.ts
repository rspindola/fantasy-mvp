import { Client } from 'pg'
import fs from 'fs'
import path from 'path'

async function run() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'

  console.log('🔌 Conectando ao banco de dados Supabase...')
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    const sqlPath = path.join(
      process.cwd(),
      'supabase',
      'migrations',
      '20260928000001_draft_pause_and_queue.sql'
    )
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('🚀 Executando migration 001 (pause + draft_queues)...')
    await client.query(sql)
    console.log('✨ Migration 001 executada com sucesso no Supabase!')
  } catch (error) {
    console.error('❌ Erro ao executar migration:', error)
  } finally {
    await client.end()
  }
}

run()
