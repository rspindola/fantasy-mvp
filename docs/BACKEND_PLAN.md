# Plano do Backend Node.js — Fantasy Draft

> **Status:** Em planejamento (Out/2026)
> Este documento descreve a estratégia para extrair a lógica de negócio do monolito Next.js para um serviço Node.js autônomo.

---

## 1. Motivação

O MVP foi construído com Server Actions do Next.js como camada de negócio. Isso funcionou para velocidade de entrega, mas traz limitações:

| Problema atual | Impacto |
|---|---|
| Lógica de negócio acoplada ao Next.js | Difícil testar isoladamente; impossível reutilizar em outros clientes (app mobile, CLI, etc.) |
| Server Actions não têm timeout configurável | Processamento de rodada pode exceder os limites da Vercel (60s por default) |
| Sem fila de jobs | Auto-pick, fechar rodada e sync de API são operações síncronas; qualquer falha de rede abota tudo |
| Sem retry automático | Falha na API-Football ou no WhatsApp = erro silencioso |
| Escalabilidade limitada | Lógica de draft em realtime competindo com requests HTTP normais |

---

## 2. Arquitetura alvo

```
                    ┌─────────────────────┐
                    │   Next.js (frontend) │
                    │   App Router / RSC   │
                    └──────────┬──────────┘
                               │ HTTP REST
                               ▼
                    ┌─────────────────────┐
                    │  fantasy-api        │
                    │  Node.js + Express  │
                    │  (ou Fastify)       │
                    │                     │
                    │  ├ /draft/*          │
                    │  ├ /round/*          │
                    │  ├ /lineup/*         │
                    │  ├ /admin/*          │
                    │  └ /webhooks/*       │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
       Supabase DB      API-Football       WhatsApp API
       (PostgreSQL)      (dados reais)      (Meta Cloud)
```

O Next.js passa a ser **somente frontend + BFF leve** (auth, SSR de páginas). Todas as operações de negócio crítico vão para o `fantasy-api`.

---

## 3. Módulos a migrar

Os seguintes módulos de `src/lib/` são candidatos diretos à migração — a lógica já está isolada, basta mover para o novo projeto:

| Módulo atual (Next.js) | Endpoint no backend |
|---|---|
| `lib/draft/engine.ts` | `POST /draft/:leagueId/start` |
| `lib/draft/engine.ts` → `makePick` | `POST /draft/:leagueId/pick` |
| `lib/draft/auto-pick.ts` | `POST /draft/:leagueId/auto-pick` |
| `lib/round/round-processor.ts` | `POST /round/:leagueId/close` |
| `lib/round/sync-api-round.ts` | `POST /round/sync` |
| `lib/scoring/scoring-engine.ts` | Utilitário interno |
| `lib/lineup/lock.ts` | `POST /lineup/:leagueId/lock` |
| `lib/lineup/auto-sub.ts` | Chamado pelo round close |
| `lib/h2h/h2h-processor.ts` | Chamado pelo round close |
| `lib/standings/total-standings.ts` | Chamado pelo round close |
| `lib/whatsapp/` | Serviço de notificação interno |
| `lib/league/h2h-validation.ts` | Utilitário compartilhado |

---

## 4. Stack do backend

### Escolhas recomendadas

| Decisão | Opção | Justificativa |
|---|---|---|
| Runtime | Node.js 22 LTS | Compatibilidade com código existente (TypeScript, mesmas libs) |
| Framework | **Fastify** | Mais rápido que Express, schema validation nativo, suporte a plugins |
| Linguagem | TypeScript | Reutilizar tipos do monorepo atual |
| Fila de jobs | **BullMQ** (Redis) | Retry automático, filas por prioridade, delay; perfeito para sync de API e fechar rodada |
| Auth | Supabase JWT | Verificar token via `@supabase/ssr`; backend valida o JWT diretamente |
| ORM / DB | `pg` (node-postgres) | Já usado nos scripts; evitar adicionar outro ORM |
| Containerização | Docker | Deploy em Railway, Render ou EC2 |
| Testes | Vitest | Mesma config do projeto atual |

### Alternativa mais simples (sem Redis)
Se não houver infraestrutura para Redis no início:
- Usar **cron jobs próprios** com `node-cron` + `pg_advisory_lock` para evitar concorrência.
- Fila de jobs pode vir depois.

---

## 5. Estrutura do projeto

```
fantasy-api/
├── src/
│   ├── routes/
│   │   ├── draft.ts          # POST /draft/:id/start, /pick, /auto-pick
│   │   ├── round.ts          # POST /round/:id/close, /sync, /partials
│   │   ├── lineup.ts         # POST /lineup/:id/lock
│   │   └── admin.ts          # POST /admin/sync-catalog, /advance-round
│   ├── services/
│   │   ├── draft/            # Migrado de lib/draft/
│   │   ├── round/            # Migrado de lib/round/
│   │   ├── lineup/           # Migrado de lib/lineup/
│   │   ├── scoring/          # Migrado de lib/scoring/
│   │   ├── h2h/              # Migrado de lib/h2h/
│   │   ├── standings/        # Migrado de lib/standings/
│   │   └── whatsapp/         # Migrado de lib/whatsapp/
│   ├── jobs/
│   │   ├── close-round.job.ts       # Job: fechar rodada após todos os jogos
│   │   ├── sync-fixtures.job.ts     # Job: sincronizar fixtures da API
│   │   └── market-alert.job.ts      # Job: alerta de fechamento de mercado
│   ├── middleware/
│   │   ├── auth.ts           # Verificar JWT Supabase
│   │   └── rate-limit.ts
│   ├── db/
│   │   └── client.ts         # Pool de conexão pg
│   └── app.ts                # Fastify setup
├── tests/
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## 6. API REST — endpoints principais

### Draft

```
POST /draft/:leagueId/start
  Body: {}
  Auth: commissioner only
  Ação: startDraftEngine — shuffle, gera matchups H2H, muda status

POST /draft/:leagueId/pick
  Body: { playerId: string, fantasyTeamId: string }
  Auth: owner do fantasyTeamId
  Ação: valida turno, insere draft_pick, roster_player, avança current_pick, notifica WhatsApp

POST /draft/:leagueId/auto-pick
  Body: { fantasyTeamId: string }
  Auth: commissioner ou owner
  Ação: auto-pick do melhor disponível

GET /draft/:leagueId/board
  Query: ?position=MEI&club=&search=
  Auth: membro da liga
  Retorna: jogadores disponíveis com status de draft
```

### Rodada

```
POST /round/:leagueId/close
  Body: { round: number }
  Auth: commissioner ou service role
  Ação: lock lineups → auto-sub → pontuar → H2H → standings → avançar

POST /round/sync
  Body: { seasonId: string, round: number }
  Auth: service role
  Ação: syncRoundFromApiFootball

POST /round/:leagueId/partials
  Body: { round: number }
  Auth: membro da liga
  Ação: pontos parciais em tempo real (antes de fechar)
```

### Escalação

```
POST /lineup/:leagueId/save
  Body: { fantasyTeamId, round, formation, starters: [{ playerId, slotPosition, isCaptain }] }
  Auth: owner do fantasyTeamId
  Ação: salva lineup (se não lockada)

POST /lineup/:leagueId/lock
  Body: { round: number }
  Auth: service role (chamado por cron)
  Ação: ensureLockedRoundLineups para todos os times
```

### Admin

```
POST /admin/sync-catalog
  Auth: service role
  Ação: atualiza squads dos 20 clubes

POST /admin/sync-round-schedule
  Body: { seasonId }
  Auth: service role

POST /admin/advance-season
  Body: { seasonId }
  Auth: service role
```

---

## 7. Jobs (BullMQ ou cron)

| Job | Trigger | O que faz |
|---|---|---|
| `sync-fixtures` | A cada hora | Atualiza status de fixtures e kickoff_at |
| `lock-lineups` | 30 min antes do 1º kickoff da rodada | Bloqueia escalações |
| `market-alert` | 2h antes do 1º kickoff | Avisa managers sem escalação via WhatsApp |
| `close-round` | Quando último jogo da rodada = FT | Fecha rodada, calcula pontos, atualiza standings |
| `sync-round-stats` | Depois que fechar rodada | Baixa player stats da API se não existirem |

---

## 8. Autenticação

O backend valida o **JWT do Supabase** em cada request:

```typescript
// middleware/auth.ts
import { createClient } from '@supabase/supabase-js'

async function authMiddleware(request, reply) {
  const token = request.headers.authorization?.replace('Bearer ', '')
  if (!token) return reply.status(401).send({ error: 'Unauthorized' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) return reply.status(401).send({ error: 'Invalid token' })
  request.user = user
}
```

O Next.js envia o token do usuário logado no header de cada request para o backend.

---

## 9. Estratégia de migração

### Fase 1 — Setup e módulos utilitários (sem breaking changes)
1. Criar o repositório `fantasy-api` com Fastify + TypeScript.
2. Copiar `lib/scoring/`, `lib/h2h/`, `lib/standings/`, `lib/league/` para `services/`.
3. Adicionar endpoints `/health` e `/round/:leagueId/partials`.
4. O Next.js continua como está; o backend roda em paralelo.

### Fase 2 — Draft engine
1. Migrar `lib/draft/` para o backend.
2. Criar endpoints `/draft/:leagueId/start` e `/draft/:leagueId/pick`.
3. Substituir Server Actions do draft pelo cliente HTTP no Next.js.
4. Manter Supabase Realtime no frontend para o board ao vivo.

### Fase 3 — Round processor e jobs
1. Migrar `lib/round/` para o backend.
2. Implementar fila BullMQ para `close-round` e `sync-round-stats`.
3. Substituir cron do Next.js (`/api/cron/market-alert`) pelo job do backend.
4. Testar com uma liga real.

### Fase 4 — Deprecar Server Actions críticas
1. Painel do admin passa a chamar o backend.
2. Server Actions restam apenas para read (RSC) e auth.

---

## 10. Compartilhamento de tipos

Criar um pacote `@fantasy/types` (ou simplesmente `types/`) compartilhado entre o frontend e o backend:

```typescript
// types/index.ts
export type ScoringMode = 'TOTAL' | 'H2H'
export type DraftMode = 'MANUAL' | 'AUTO' | 'HYBRID'
export type LeagueStatus = 'open' | 'drafting' | 'active' | 'closed'
export type Position = 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'

export interface PlayerFixtureStats {
  playerId: string
  minutes: number
  tackles: number
  foulsCommitted: number
  // ... todos os scouts
  computedPoints: number
}
```

---

## 11. Deploy

### Opção A — Railway (recomendado para piloto)
- Deploy automático via GitHub Actions.
- Redis incluído no plano.
- Variáveis de ambiente via painel.
- Custo estimado: ~$10–20/mês.

### Opção B — Render
- Similar ao Railway, sem Redis nativo (usar Upstash Redis).

### Opção C — EC2 / VPS
- Mais controle, mais trabalho de DevOps.
- Docker Compose com Node.js + Redis.

---

## 12. Checklist para começar

- [ ] Criar repositório `fantasy-api` (pode ser monorepo junto com `fantasy-mvp` em `/apps/api`)
- [ ] Setup Fastify + TypeScript + Vitest
- [ ] Configurar conexão `pg` com pool
- [ ] Implementar middleware de auth (JWT Supabase)
- [ ] Copiar e adaptar `scoring-engine.ts` (zero dependências externas)
- [ ] Implementar `GET /draft/:leagueId/board` (primeiro endpoint simples)
- [ ] Testes unitários para scoring engine
- [ ] CI com GitHub Actions (lint + test)
- [ ] Deploy do esqueleto no Railway
- [ ] Conectar Next.js ao endpoint de board
