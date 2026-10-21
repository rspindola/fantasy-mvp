# Fantasy Draft MVP

Liga fantasy fechada com draft snake, elenco único por liga e pontuação estilo Cartola FC baseada no desempenho real no **Brasileirão Série A**.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend + BFF leve | Next.js 16 (App Router, React 19) |
| **Backend de negócio** | **NestJS 12** (`api-cartola-mvp`) |
| Banco de dados | Supabase PostgreSQL → **Neon / Railway** (migração em curso) |
| ORM | **Drizzle ORM** (backend) / `@supabase/supabase-js` (frontend, transitório) |
| Validações | Zod 4 |
| IDs curtos | nanoid |
| Notificações | WhatsApp Cloud API (Meta Graph API v22) |
| Fonte de dados | API-Football (`league_id=71`, Brasileirão Série A) |
| Realtime | Supabase Realtime → **WebSocket NestJS** (Fase 2) |
| Storage | Supabase Storage → **Cloudflare R2** (Fase 2) |
| Auth | Supabase Auth → **JWT próprio** (Fase 3) |
| Testes | Vitest |
| Linguagem | TypeScript |

> **Migração do Supabase:** saída completa em 3 fases. Ver [`docs/BACKEND_PLAN.md`](./docs/BACKEND_PLAN.md) seção 9.

---

## Pré-requisitos

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase start` para local)
- Variáveis de ambiente configuradas (ver abaixo)

## Setup local

```bash
# 1. Instalar dependências
npm install

# 2. Copiar e preencher variáveis de ambiente
cp .env .env.local
# edite .env.local com suas chaves

# 3. Subir Supabase local
supabase start

# 4. Aplicar migrations
supabase db push
# ou
npm run migrate

# 5. Popular catálogo (sem API key — dados seed locais)
npm run seed

# 6. Popular via API-Football (requer API_FOOTBALL_KEY)
npm run seed:api

# 7. Criar liga demo para testes
npm run seed:demo

# 8. Rodar o dev server
npm run dev
```

Acesse em [http://localhost:3000](http://localhost:3000).

## Variáveis de ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# API-Football (https://www.api-football.com)
API_FOOTBALL_KEY=
API_FOOTBALL_LEAGUE_ID=71       # Brasileirão Série A

# WhatsApp Cloud API (Meta)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=

# Cron auth
CRON_SECRET=
```

---

## Scripts disponíveis

```bash
npm run dev           # Dev server (Next.js)
npm run build         # Build produção
npm run lint          # ESLint
npm run test          # Vitest (single run)
npm run test:watch    # Vitest (watch mode)

npm run seed          # Seed catálogo local (sem API)
npm run seed:api      # Seed catálogo via API-Football
npm run seed:demo     # Cria liga demo com times e draft completo
npm run migrate       # Aplica migrations Supabase via pg direto

# Scripts auxiliares (via tsx direto)
npx tsx scripts/sync-all-fixtures.ts              # Sincroniza todos os fixtures da season
npx tsx scripts/fetch-batch-rounds-stats.ts       # Baixa stats de rodadas em batch
npx tsx scripts/backfill-passes-completed.ts      # Backfill de passes completados
npx tsx scripts/fix-clean-sheets.ts               # Recalcula clean sheets
npx tsx scripts/update-player-position.ts         # Atualiza posições de jogadores
npx tsx scripts/cross_check_squads_v2.ts          # Cross-check de elencos vs API
npx tsx scripts/clean-database-for-production.ts  # Limpa dados de teste antes do go-live
```

---

## Estrutura do projeto

```
fantasy-mvp/
├── src/
│   ├── app/
│   │   ├── (auth)/             # Login / signup
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx      # Layout com navbar
│   │   │   ├── dashboard/      # Home do usuário
│   │   │   ├── join/           # Entrar em liga pelo invite code
│   │   │   └── league/
│   │   │       ├── create/     # Criar nova liga
│   │   │       └── [id]/       # Detalhes da liga
│   │   │           ├── page.tsx       # Hub da liga (standings, rodada, elenco)
│   │   │           ├── draft/         # Board do draft em tempo real
│   │   │           ├── lineup/        # Escalação da rodada
│   │   │           ├── matchup/       # Duelo H2H da rodada
│   │   │           ├── standings/     # Tabela completa
│   │   │           ├── team/          # Elenco do time
│   │   │           ├── rules/         # Regras da liga
│   │   │           ├── prep/          # Sala de espera pré-draft
│   │   │           └── admin/         # Painel do comissário
│   │   └── api/
│   │       └── cron/
│   │           └── market-alert/      # Endpoint cron: alerta de fechamento de mercado
│   ├── components/
│   │   ├── league/             # Componentes de liga (LeagueCard, etc.)
│   │   ├── lineup/             # Componentes de escalação
│   │   ├── player/             # PlayerDetailModal, etc.
│   │   └── ui/                 # Button, Badge, ThemeToggle, etc.
│   └── lib/
│       ├── api/                # Integração API-Football
│       ├── draft/              # Engine do draft (snake, auto-pick, realtime)
│       ├── h2h/                # Gerador Berger + processamento H2H
│       ├── league/             # Validações de liga e H2H, invite code
│       ├── lineup/             # Lock de escalação, auto-sub, lineup engine
│       ├── round/              # Round processor + sync com API
│       ├── scoring/            # Motor de pontuação (scouts → pontos)
│       ├── standings/          # Cálculo de tabela TOTAL
│       ├── supabase/           # Cliente Supabase (server/client/middleware)
│       ├── utils/              # Formatação e utilitários
│       ├── validations/        # Schemas Zod
│       └── whatsapp/           # Cliente WhatsApp Cloud API + notificações
├── supabase/
│   ├── config.toml
│   └── migrations/             # 18 migrations (schema + RLS + realtime)
├── scripts/                    # Scripts de seed, sync e manutenção (tsx)
├── tests/                      # Testes Vitest
└── docs/
    ├── ARCHITECTURE.md         # Schema do banco + decisões técnicas
    └── BACKEND_PLAN.md         # Plano do backend Node.js separado
```

---

## Fluxo principal

```
Criar liga (teamCap 2..20) → gerar inviteCode → convidar managers
  → comissário inicia draft (≥ 2 times inscritos)
  → draft snake N×22 picks (MANUAL | AUTO | HYBRID)
  → liga ativa → a cada rodada real:
      manager escala 11 + capitão → lock no 1º apito
      jogos reais → ingest de scouts via API-Football
      → motor de pontuação → atualiza standings TOTAL ou H2H
      → notificação WhatsApp
```

## Módulos core (lib/) — em migração para NestJS

| Módulo | Responsabilidade | Status |
|---|---|---|
| `draft/engine.ts` | Start draft, Fisher-Yates shuffle, geração de H2H matchups, notificações | 🔧 → `DraftModule` |
| `draft/auto-pick.ts` | Auto-pick por ranking (avgPoints, déficit de posição) | 🔧 → `AutoPickService` |
| `draft/snake-order.ts` | Geração da ordem snake para N times | 🔧 utilitário puro |
| `round/round-processor.ts` | Fecha rodada: auto-sub, pontuação, H2H, avança temporada | 🔧 → `RoundModule` |
| `round/sync-api-round.ts` | Sincroniza fixtures e player stats da API-Football | 🔧 → `SyncApiService` |
| `scoring/scoring-engine.ts` | Scouts → pontos (espelho Cartola 2026) | ✅ Portado para NestJS |
| `lineup/lock.ts` | Lock de escalação no kickoff, fallback para última escalação | 🔧 → `LockService` |
| `lineup/auto-sub.ts` | Substituição automática se titular não jogou | 🔧 → `AutoSubService` |
| `h2h/berger-generator.ts` | Geração de chave H2H (método do círculo/Berger) | 🔧 utilitário puro |
| `h2h/h2h-processor.ts` | Processamento de resultados e pontos de tabela H2H | 🔧 → `H2HService` |
| `standings/total-standings.ts` | Recalcula standings TOTAL | 🔧 → `StandingsService` |
| `whatsapp/client.ts` | Envio de template messages via Meta Cloud API | 🔧 → `NotificationsModule` |

---

## Banco de dados (PostgreSQL)

Ver [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) para detalhes completos do schema.

Atualmente hospedado no **Supabase** (em migração para Neon/Railway). O schema é PostgreSQL puro e porta sem alterações.

Tabelas principais:

- `seasons` → `real_clubs` → `real_players` (catálogo)
- `fixtures` → `player_fixture_stats` (estatísticas por jogo)
- `leagues` → `fantasy_teams` → `draft_picks` → `roster_players`
- `lineups` → `lineup_slots` (escalação por rodada)
- `round_scores` → `league_standings` → `h2h_matchups`

Autorização atual: **RLS no Supabase**. Destino: **Guards no NestJS** (Fase 1 da migração).

---

## Testes

```bash
npm run test          # Roda suite Vitest
npm run test:watch    # Modo watch
```

Os testes ficam em `tests/` e cobrem lógica de scoring, snake order, validações H2H e round processor.
