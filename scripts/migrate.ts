import { Client } from 'pg'
import fs from 'fs'
import path from 'path'

async function runMigration() {
  const connectionString = process.env.DATABASE_URL || 'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'

  console.log('🔌 Conectando ao banco de dados Supabase (ca-central-1)...')
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  try {
    await client.connect()
    console.log('✅ Conectado com sucesso!')

    const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '20260928000000_create_schema.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('🚀 Executando migration schema...')
    await client.query(sql)
    console.log('✨ Migration executada com sucesso no Supabase remoto!')

  } catch (error) {
    console.error('❌ Erro ao executar migration:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
