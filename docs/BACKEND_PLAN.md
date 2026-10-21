# Plano do Backend NestJS — Fantasy Draft

> **Status:** Em desenvolvimento ativo (`api-cartola-mvp`)
> **Decisão:** Sair completamente do Supabase no backend. PostgreSQL hospedado externamente (Neon ou Railway), ORM Drizzle, auth via JWT próprio no futuro. Ver seção de [Saída do Supabase](#9-saída-do-supabase).

---

## 1. Motivação

O MVP foi construído com Server Actions do Next.js como camada de negócio. Isso funcionou para velocidade de entrega, mas traz limitações:

| Problema atual | Impacto |
|---|---|
| Lógica de negócio acoplada ao Next.js | Difícil testar isoladamente; impossível reutilizar em outros clientes |
| Server Actions sem timeout configurável | Processamento de rodada pode exceder 60s (limite Vercel) |
| Sem fila de jobs | Auto-pick, fechar rodada e sync de API são síncronos; falha de rede aborta tudo |
| Sem retry automático | Falha na API-Football ou WhatsApp = erro silencioso |
| Vendor lock-in no Supabase | Auth, RLS, Realtime e Storage acoplados; difícil migrar, difícil testar |

---

## 2. Arquitetura alvo

```
Browser (React 19)
    │
    ├─ Next.js (frontend only)
    │   ├─ SSR / RSC — renderização de páginas
    │   ├─ Supabase Auth — sessão JWT (transitório, ver seção 9)
    │   └─ WebSocket client — draft board ao vivo
    │
    │   HTTP REST + Bearer JWT
    │
    ▼
┌──────────────────────────────────┐
│  fantasy-api  (NestJS 12)        │
│                                  │
│  Modules:                        │
│  ├── FootballModule              │  ← BFF API-Football (já existe)
│  ├── FixturesModule              │  ← endpoints de fixtures/rodadas (já existe)
│  ├── DraftModule        (TODO)   │
│  ├── RoundModule        (TODO)   │
│  ├── LineupModule       (TODO)   │
│  ├── LeagueModule       (TODO)   │
│  ├── AdminModule        (TODO)   │
│  └── NotificationsModule (TODO)  │
│                                  │
│  Infra:                          │
│  ├── Drizzle ORM + pg            │
│  ├── BullMQ (Redis) — jobs       │
│  └── WebSocket Gateway — draft   │
└──────────────┬───────────────────┘
               │
    ┌──────────┼─────────────┐
    ▼          ▼             ▼
PostgreSQL  API-Football  WhatsApp API
(Neon /    (dados reais)  (Meta Cloud)
 Railway)
```

---

## 3. Estado atual do projeto (`api-cartola-mvp`)

O repositório NestJS **já existe** em `/workspace/api-cartola-mvp` com os seguintes módulos implementados:

| Módulo | Status | Descrição |
|---|---|---|
| `FootballModule` + `ApiFootballClient` | ✅ Pronto | HTTP client para API-Football com error handling |
| `FixturesModule` | ✅ Pronto | `GET /rounds/:round`, `GET /fixtures`, `POST /fantasy/rounds/:round/players` |
| `fantasy/scoring.ts` | ✅ Pronto | Motor de pontuação (espelho Cartola) isolado e testável |
| DB / Drizzle | 🔧 A fazer | Conectar ao PostgreSQL externo |
| DraftModule | 🔧 A fazer | Migrar `lib/draft/` do Next.js |
| RoundModule | 🔧 A fazer | Migrar `lib/round/` do Next.js |
| LineupModule | 🔧 A fazer | Migrar `lib/lineup/` do Next.js |
| WebSocket Gateway | 🔧 A fazer | Substituir Supabase Realtime no draft |
| Auth Guard | 🔧 A fazer | Validar JWT (Supabase agora → próprio depois) |

---

## 4. Stack

| Decisão | Escolha | Justificativa |
|---|---|---|
| Runtime | Node.js 22 LTS | Compatibilidade com código existente |
| Framework | **NestJS 12** | Já adotado; módulos, DI, guards, interceptors prontos |
| Linguagem | TypeScript | Compartilhar tipos com o Next.js |
| **ORM** | **Drizzle ORM** | Type-safe, sem magia, schema como código, migrations limpas; sem vendor lock-in |
| **Banco** | **PostgreSQL externo** | Neon (serverless) ou Railway; exportar do Supabase via `pg_dump` |
| Fila de jobs | **BullMQ** (Redis) | Retry, delay, prioridade; Upstash Redis no cloud |
| Realtime (draft) | **WebSocket** (`@nestjs/websockets`) | Substitui Supabase Realtime; sem vendor lock-in |
| Auth | JWT próprio (JWKS) | Supabase JWT na transição; auth próprio na Fase 3 |
| Storage | **Cloudflare R2** | Barato, S3-compatible; substitui Supabase Storage |
| Containerização | Docker | Deploy em Railway ou Fly.io |
| Testes | Vitest | Mesma config do projeto atual |

---

## 5. Estrutura do projeto (target)

```
api-cartola-mvp/
└── src/
    ├── football/                  # ✅ Pronto
    │   ├── api-football.client.ts
    │   ├── api-football.types.ts
    │   └── football.module.ts
    ├── fixtures/                  # ✅ Pronto
    │   ├── fixtures.controller.ts
    │   ├── fixtures.service.ts
    │   └── fixtures.module.ts
    ├── fantasy/                   # ✅ Pronto
    │   └── scoring.ts
    ├── db/                        # 🔧 A fazer
    │   ├── schema/
    │   │   ├── catalog.ts         # seasons, real_clubs, real_players, fixtures, stats
    │   │   ├── league.ts          # leagues, fantasy_teams, draft_picks, roster_players
    │   │   ├── lineup.ts          # lineups, lineup_slots
    │   │   └── scoring.ts         # round_scores, league_standings, h2h_matchups
    │   ├── index.ts               # drizzle client + pool pg
    │   └── migrations/            # geradas pelo drizzle-kit
    ├── auth/                      # 🔧 A fazer
    │   ├── auth.guard.ts          # verifica JWT Bearer
    │   ├── auth.module.ts
    │   └── current-user.decorator.ts
    ├── draft/                     # 🔧 A fazer
    │   ├── draft.controller.ts
    │   ├── draft.service.ts       # migrado de lib/draft/engine.ts
    │   ├── auto-pick.service.ts   # migrado de lib/draft/auto-pick.ts
    │   ├── snake-order.ts
    │   ├── draft.gateway.ts       # WebSocket — draft board ao vivo
    │   └── draft.module.ts
    ├── round/                     # 🔧 A fazer
    │   ├── round.controller.ts
    │   ├── round.service.ts       # migrado de lib/round/round-processor.ts
    │   ├── sync-api.service.ts    # migrado de lib/round/sync-api-round.ts
    │   └── round.module.ts
    ├── lineup/                    # 🔧 A fazer
    │   ├── lineup.controller.ts
    │   ├── lineup.service.ts
    │   ├── lock.service.ts
    │   ├── auto-sub.service.ts
    │   └── lineup.module.ts
    ├── league/                    # 🔧 A fazer
    │   ├── league.controller.ts
    │   ├── league.service.ts
    │   ├── h2h-validation.ts
    │   └── league.module.ts
    ├── notifications/             # 🔧 A fazer
    │   ├── whatsapp.service.ts
    │   └── notifications.module.ts
    ├── jobs/                      # 🔧 A fazer
    │   ├── close-round.job.ts
    │   ├── sync-fixtures.job.ts
    │   ├── lock-lineups.job.ts
    │   └── market-alert.job.ts
    ├── app.module.ts
    └── main.ts
```

---

## 6. Banco de dados com Drizzle ORM

### Setup inicial

```bash
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

### Schema (exemplo — tabelas de catálogo)

```typescript
// src/db/schema/catalog.ts
import {
  pgTable, uuid, text, integer, boolean,
  numeric, timestamp, unique
} from 'drizzle-orm/pg-core'

export const seasons = pgTable('seasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueApiId: integer('league_api_id').notNull(),
  year: integer('year').notNull(),
  name: text('name').notNull(),
  currentRound: integer('current_round').default(1),
  totalRounds: integer('total_rounds').default(38),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [unique().on(t.leagueApiId, t.year)])

export const realPlayers = pgTable('real_players', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => realClubs.id),
  name: text('name').notNull(),
  photoUrl: text('photo_url'),
  position: text('position').notNull(), // GOL | LAT | ZAG | MEI | ATA
  apiFootballId: integer('api_football_id').notNull().unique(),
  isActive: boolean('is_active').default(true),
  avgPoints: numeric('avg_points', { precision: 6, scale: 2 }).default('0'),
  totalMinutes: integer('total_minutes').default(0),
})
```

### drizzle.config.ts

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema/*.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

### Introspect do schema Supabase atual

```bash
# Gera o schema Drizzle a partir do banco Supabase existente
DATABASE_URL="postgresql://postgres:senha@db.xyz.supabase.co:5432/postgres" \
npx drizzle-kit introspect
```

### DB client

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema/index.js'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })
```

---

## 7. Auth Guard (transição)

Durante a migração, o JWT é emitido pelo Supabase Auth. O backend valida a assinatura via JWKS — sem dependência do SDK `@supabase/supabase-js`:

```typescript
// src/auth/auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import * as jose from 'jose'

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly JWKS = jose.createRemoteJWKSet(
    new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
  )

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (!token) throw new UnauthorizedException()

    try {
      const { payload } = await jose.jwtVerify(token, this.JWKS, {
        issuer: `${process.env.SUPABASE_URL}/auth/v1`,
      })
      request.user = payload
      return true
    } catch {
      throw new UnauthorizedException()
    }
  }
}
```

> Na Fase 3 (auth próprio), apenas `JWKS` muda — o guard permanece o mesmo.

---

## 8. API REST — endpoints

### Fixtures / BFF (já implementado)

```
GET  /rounds/:round                    → resumo da rodada com jogos
GET  /fixtures?ids=1234,5678           → detalhes de fixtures por ID
POST /fantasy/rounds/:round/players    → jogadores com pontos fantasy da rodada
```

### Draft

```
POST /leagues/:leagueId/draft/start
  Auth: comissário
  Body: {}

POST /leagues/:leagueId/draft/pick
  Auth: dono do time
  Body: { fantasyTeamId, playerId }

POST /leagues/:leagueId/draft/auto-pick
  Auth: comissário ou dono
  Body: { fantasyTeamId }

GET  /leagues/:leagueId/draft/board
  Query: ?position=MEI&club=&search=
  Auth: membro da liga

WS   /draft (WebSocket)
  Evento: pick_made   → { pick, currentPick, playersRemaining }
  Evento: draft_done  → { leagueId }
```

### Rodada

```
POST /rounds/sync
  Auth: service key
  Body: { seasonId, round }

POST /leagues/:leagueId/rounds/:round/close
  Auth: comissário ou service key

POST /leagues/:leagueId/rounds/:round/partials
  Auth: membro da liga
```

### Escalação

```
PUT  /leagues/:leagueId/lineups/:round
  Auth: dono do time
  Body: { fantasyTeamId, formation, starters: [{ playerId, slotPosition, isCaptain }] }

POST /leagues/:leagueId/lineups/:round/lock
  Auth: service key (chamado por job)
```

### Admin

```
POST /admin/catalog/sync        → atualiza squads dos 20 clubes
POST /admin/rounds/:round/sync  → sincroniza fixtures e stats
GET  /health                    → status do serviço
```

---

## 9. Saída do Supabase

### O que migrar e quando

| Camada Supabase | Substituto | Quando |
|---|---|---|
| **PostgreSQL** (dados) | Neon ou Railway Postgres | **Fase 1 — agora** |
| **RLS** | Guards + ownership check no NestJS | **Fase 1 — junto com DB** |
| **Storage** (banners) | Cloudflare R2 | **Fase 2** |
| **Auth** (JWT, magic link) | Auth próprio (Lucia / Auth.js / custom) | **Fase 3** |
| **Realtime** (draft board) | WebSocket no NestJS (`draft.gateway.ts`) | **Fase 2** |

### Fase 1 — Banco de dados (agora)

```bash
# 1. Exportar dados do Supabase
pg_dump \
  "postgresql://postgres:SENHA@db.XYZ.supabase.co:5432/postgres" \
  --no-owner --no-acl \
  -f dump.sql

# 2. Criar banco no Neon (neon.tech) ou Railway
# Copiar a DATABASE_URL do painel

# 3. Importar
psql "postgresql://user:senha@ep-xxx.neon.tech/neondb?sslmode=require" < dump.sql

# 4. Verificar
psql $DATABASE_URL -c "SELECT COUNT(*) FROM real_players;"
```

O schema é idêntico — nenhuma migration nova necessária. O Next.js continua apontando para o Supabase enquanto o backend aponta para o Neon/Railway.

### Fase 2 — Realtime e Storage

**Realtime → WebSocket NestJS:**
- `DraftGateway` emite eventos via `@nestjs/websockets` (Socket.IO ou ws nativo).
- Next.js substitui `supabase.channel()` por `socket.on('pick_made', ...)`.
- Supabase Realtime pode ser desligado.

**Storage → Cloudflare R2:**
- R2 é S3-compatible; SDK `@aws-sdk/client-s3` funciona sem alteração.
- Migrar banners existentes: `rclone copy supabase:bucket r2:bucket`.
- Atualizar `banner_url` no banco com as novas URLs.

### Fase 3 — Auth próprio

- Substituir Supabase Auth por solução própria (Lucia Auth recomendado para Next.js) ou manter Supabase Auth somente como emissor de JWT (sem usar as features de managed auth).
- O `AuthGuard` do NestJS não muda — apenas a URL do JWKS muda.
- Supabase pode ser desligado completamente.

---

## 10. Jobs (BullMQ)

| Job | Trigger | O que faz |
|---|---|---|
| `sync-fixtures` | A cada hora | Atualiza `status` e `kickoff_at` dos jogos |
| `lock-lineups` | 30 min antes do 1º kickoff | Bloqueia escalações e auto-escala times sem lineup |
| `market-alert` | 2h antes do 1º kickoff | WhatsApp para managers sem escalação |
| `close-round` | Quando último fixture = FT | Lock → auto-sub → pontuação → H2H → standings |
| `sync-round-stats` | Após `close-round` | Baixa player stats da API se não existirem |

### Alternativa sem Redis (início)
`pg_advisory_lock` + `node-cron` se não tiver Redis disponível na infra inicial. BullMQ pode ser adicionado depois sem mudar a interface dos jobs.

---

## 11. Compartilhamento de tipos

Criar `packages/types/` (monorepo) ou um arquivo compartilhado simples:

```typescript
// packages/types/src/index.ts
export type ScoringMode = 'TOTAL' | 'H2H'
export type DraftMode = 'MANUAL' | 'AUTO' | 'HYBRID'
export type LeagueStatus = 'open' | 'drafting' | 'active' | 'closed'
export type Position = 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
export type Formation = '4-3-3' | '4-4-2' | '3-5-2' | '4-2-3-1' | '5-3-2' | '5-4-1' | '3-4-3'
```

---

## 12. Deploy

### Recomendado: Railway

- PostgreSQL + Redis + Node.js na mesma plataforma.
- Deploy via GitHub push automático.
- `DATABASE_URL` e `REDIS_URL` gerados automaticamente.
- Custo estimado: ~$15–25/mês para o conjunto.

### Alternativa: Neon (DB) + Upstash (Redis) + Fly.io (API)

- Cada serviço no melhor vendor para o caso.
- Mais configuração, mais barato em escala.

---

## 13. Variáveis de ambiente do backend

```env
# Banco de dados
DATABASE_URL=postgresql://user:senha@host/db?sslmode=require

# Redis (BullMQ)
REDIS_URL=redis://...

# Auth (JWT — Supabase na transição)
SUPABASE_URL=https://xyz.supabase.co
# JWT_SECRET=...  (quando auth próprio)

# API-Football
API_FOOTBALL_KEY=
API_FOOTBALL_LEAGUE_ID=71

# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=

# Cloudflare R2 (Storage)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# Segurança
SERVICE_API_KEY=     # para endpoints de admin/cron
```

---

## 14. Checklist de implementação

### Fase 1 — Banco + Auth (próximos passos imediatos)

- [ ] Instalar Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `pg`)
- [ ] Criar `src/db/schema/` com introspect do Supabase atual
- [ ] Configurar `DatabaseModule` com pool `pg` injetável
- [ ] Exportar banco do Supabase e importar no Neon/Railway
- [ ] Criar `AuthGuard` com validação JWKS (sem SDK Supabase)
- [ ] Substituir `process.env.API_FOOTBALL_KEY` por `@Inject` no `ApiFootballClient`
- [ ] Testar `GET /rounds/:round` apontando para novo banco

### Fase 2 — Módulos de domínio

- [ ] `DraftModule` — migrar `lib/draft/` + `DraftGateway` WebSocket
- [ ] `RoundModule` — migrar `lib/round/`
- [ ] `LineupModule` — migrar `lib/lineup/`
- [ ] `LeagueModule` — migrar `lib/league/`
- [ ] `NotificationsModule` — migrar `lib/whatsapp/`
- [ ] Migrar Storage para Cloudflare R2

### Fase 3 — Jobs e Auth próprio

- [ ] Setup BullMQ + jobs de cron
- [ ] Auth próprio (Lucia ou custom JWT)
- [ ] Desligar Supabase completamente
