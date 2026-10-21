# Arquitetura Técnica — Fantasy Draft MVP

> Documento de referência para o **sistema atual** (Next.js + Supabase).
> O Supabase será **migrado progressivamente** — veja o plano em [`BACKEND_PLAN.md`](./BACKEND_PLAN.md).

---

## 1. Visão geral (estado atual)

```
Browser (React 19)
    │
    ├─ Server Components / Server Actions (Next.js 16 App Router)
    │       │
    │       ├─ lib/supabase/server.ts   ← Supabase SSR client  [TRANSITÓRIO]
    │       ├─ lib/draft/engine.ts      ← lógica de draft       [→ NestJS DraftModule]
    │       ├─ lib/round/              ← processamento de rodada [→ NestJS RoundModule]
    │       ├─ lib/scoring/            ← motor de pontuação      [→ NestJS (já portado)]
    │       └─ lib/whatsapp/           ← notificações            [→ NestJS NotificationsModule]
    │
    ├─ Client Components (Realtime)
    │       └─ Supabase Realtime       [TRANSITÓRIO → WebSocket NestJS na Fase 2]
    │
    └─ API Routes
            └─ /api/cron/market-alert  [TRANSITÓRIO → job BullMQ no NestJS]

Supabase (PostgreSQL + Auth + RLS + Storage + Realtime)
    [TRANSITÓRIO — sendo migrado. Ver BACKEND_PLAN.md seção 9]

API-Football (fonte de dados externa — league_id=71)
    [Permanente — BFF no NestJS: api-cartola-mvp]

WhatsApp Cloud API (Meta Graph API v22)
    [Permanente — NotificationsModule no NestJS]
```

### Estado da migração

| Camada | Destino | Status |
|---|---|---|
| BFF API-Football | NestJS `FootballModule` + `FixturesModule` | ✅ Feito |
| Motor de pontuação | NestJS `fantasy/scoring.ts` | ✅ Feito |
| PostgreSQL (dados) | Neon ou Railway | 🔧 Fase 1 |
| Auth (JWT) | AuthGuard NestJS via JWKS | 🔧 Fase 1 |
| Draft engine | NestJS `DraftModule` + WebSocket | 🔧 Fase 2 |
| Round processor | NestJS `RoundModule` + BullMQ | 🔧 Fase 2 |
| Lineup engine | NestJS `LineupModule` | 🔧 Fase 2 |
| Storage (banners) | Cloudflare R2 | 🔧 Fase 2 |
| Realtime (draft) | WebSocket NestJS | 🔧 Fase 2 |
| Auth completo | Auth próprio (Lucia / custom JWT) | 🔧 Fase 3 |

---

## 2. Schema do banco de dados

O schema é PostgreSQL puro e **migra sem alterações** para qualquer host (Neon, Railway, etc.).
Atualmente hospedado no Supabase. Migrations em `supabase/migrations/`.

### Tabelas do catálogo (leitura pública)

#### `seasons`
| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID PK | |
| league_api_id | INT | 71 = Brasileirão |
| year | INT | |
| name | TEXT | "Brasileirão Série A 2026" |
| current_round | INT | Rodada atual |
| total_rounds | INT | Default 38 |

#### `real_clubs`
| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID PK | |
| season_id | UUID FK → seasons | |
| name | TEXT | Nome completo |
| short_name | TEXT | Abreviação |
| logo_url | TEXT | |
| api_football_id | INT | ID na API |

#### `real_players`
| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID PK | |
| club_id | UUID FK → real_clubs | |
| name | TEXT | |
| photo_url | TEXT | |
| position | TEXT | GOL, LAT, ZAG, MEI, ATA |
| api_football_id | INT | |
| is_active | BOOLEAN | false = transferido/lesionado |
| avg_points | NUMERIC(6,2) | Média de pontos para auto-pick |
| total_minutes | INT | Para desempate no auto-pick |

#### `fixtures`
| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID PK | |
| season_id | UUID FK → seasons | |
| round | INT | Rodada do campeonato |
| home_club_id | UUID FK | |
| away_club_id | UUID FK | |
| kickoff_at | TIMESTAMPTZ | Horário do jogo |
| status | TEXT | scheduled / live / FT / postponed |
| home_score / away_score | INT | |
| api_fixture_id | INT | |

#### `player_fixture_stats`

Estatísticas por jogador por jogo. Todos os scouts são persistidos aqui.

| Coluna | Scout Cartola | Pontos |
|---|---|---|
| tackles | DS desarme | +1,5 |
| fouls_committed | FC falta cometida | −0,3 |
| own_goals | GC gol contra | −3,0 |
| yellow_cards | CA amarelo | −1,0 |
| red_cards | CV vermelho | −3,0 |
| clean_sheet | SG sem sofrer gol | +5,0 (GOL/LAT/ZAG) |
| saves | DE defesa difícil | +1,3 (GOL) |
| penalty_saves | DP defesa de pênalti | +7,0 (GOL) |
| goals_conceded | GS gol sofrido | −1,0 (GOL) |
| penalties_committed | PC pênalti cometido | −1,0 |
| fouls_drawn | FS falta sofrida | +0,5 |
| passes_completed | PC passe completo | +0,1 |
| passes_failed | PE passe incompleto | −0,1 |
| assists | A assistência | +4,0 |
| shots_on_woodwork | FT finalização na trave | +3,0 |
| shots_on_target | FD finalização defendida | +1,2 |
| shots_off_target | FF finalização para fora | +0,8 |
| goals | G gol | +8,0 |
| offsides | I impedimento | −0,1 |
| penalties_missed | PP pênalti perdido | −4,0 |
| penalties_won | PS pênalti sofrido | +1,0 |
| computed_points | — | Pontos calculados e armazenados |

> **`passes_completed`:** adicionado na migration `20261002000000_add_passes_completed.sql`. Backfill via `scripts/backfill-passes-completed.ts`.

> **`clean_sheet`:** calculado localmente via `fix-clean-sheets.ts` (base: placar final do fixture + regra de ≥ 60 min) porque a API-Football tem inconsistências nesse campo.

---

### Tabelas de liga e jogo

#### `profiles`
Extensão de `auth.users`. Criada automaticamente via trigger `on_auth_user_created`.
- `phone_number` (TEXT) — para notificações WhatsApp.

> Na migração do Auth, `profiles` deixa de referenciar `auth.users` e passa a ter `password_hash` ou similar.

#### `leagues`
| Coluna | Tipo |
|---|---|
| scoring_mode | TOTAL \| H2H |
| draft_mode | MANUAL \| AUTO \| HYBRID |
| team_cap | INT (2–20) |
| status | open → drafting → active → closed |
| pick_timer_seconds | INT (default 90) |
| current_pick | INT |
| total_picks | INT (N×22) |
| banner_url | TEXT (→ migrar para Cloudflare R2) |

#### `fantasy_teams`
- `draft_order` — atribuído no start do draft (Fisher-Yates shuffle).
- `auto_complete` — se true, auto-pick para todos os picks restantes.

#### `draft_picks`
- `UNIQUE(league_id, player_id)` — garante unicidade do jogador na liga.
- `UNIQUE(league_id, pick_number)` — garante ordem do draft.
- `is_auto_pick` — distingue picks automáticos.

#### `lineups` + `lineup_slots`
- `lineups` — um por time por rodada; `is_locked` após o kickoff.
- `lineup_slots` — 11 starters + banco; `is_captain` marca o capitão.
- Formações: 4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 5-3-2, 5-4-1, 3-4-3.

#### `round_scores`
- `total_points` — soma dos 11 titulares (com bônus de capitão).
- `captain_bonus` — pontos extras do capitão (para desempate).

#### `league_standings`
- Um registro por time por rodada, atualizado pelo round processor.
- `h2h_points`, `h2h_wins`, `h2h_draws`, `h2h_losses` — para modo H2H.

#### `h2h_matchups`
- Gerados no start do draft (método Berger).
- `result` — home / away / draw (calculado após fechar a rodada).

---

## 3. RLS (Row Level Security) — estado atual

> **Transitório.** Com a migração para o NestJS, a autorização sairá do banco e irá para os Guards do NestJS. Isso torna as políticas testáveis, explícitas e sem vendor lock-in.

| Tabela | Leitura | Escrita |
|---|---|---|
| seasons, real_clubs, real_players, fixtures, player_fixture_stats | Pública | Service role |
| profiles | Pública | Próprio user |
| leagues | Pública | commissioner_id = auth.uid() |
| fantasy_teams | Pública | user_id = auth.uid() |
| draft_picks | Pública | user_id owner do fantasy_team |
| lineups / lineup_slots | Pública | user_id owner do fantasy_team |
| round_scores, league_standings, h2h_matchups | Pública | Service role |

**Equivalentes no NestJS:**
- `auth.uid()` → `@CurrentUser()` no decorator, injetado pelo `AuthGuard`
- `commissioner_id = auth.uid()` → verificação explícita no `LeagueService`
- Service role → `ServiceKeyGuard` com `SERVICE_API_KEY` no header

---

## 4. Realtime — estado atual e migração

**Atual (Supabase Realtime):**
- Tabela `draft_picks` — subscribers recebem novos picks em tempo real.
- Tabela `leagues` — subscribers recebem mudança de `current_pick` e `status`.
- Habilitado via migration `20261005000001_enable_realtime_draft.sql`.

**Destino (WebSocket NestJS):**
```typescript
// draft/draft.gateway.ts
@WebSocketGateway({ namespace: '/draft' })
export class DraftGateway {
  @WebSocketServer() server: Server

  emitPickMade(leagueId: string, payload: PickMadeEvent) {
    this.server.to(`league:${leagueId}`).emit('pick_made', payload)
  }

  emitDraftDone(leagueId: string) {
    this.server.to(`league:${leagueId}`).emit('draft_done', { leagueId })
  }
}
```

Next.js substitui `supabase.channel()` por `socket.on('pick_made', ...)`.

---

## 5. Módulos core do Next.js (`src/lib/`)

> Estes módulos serão **migrados para o NestJS** progressivamente. O código já está isolado — a migração é mover + adaptar para injeção de dependência.

### `draft/engine.ts` → `DraftModule`
- `startDraftEngine(leagueId)` — shuffles teams, seta `total_picks`, muda status para `drafting`, gera matchups H2H se necessário, cria lineups iniciais.
- `makePick(leagueId, playerId, fantasyTeamId)` — valida turno, insere `draft_picks`, insere `roster_players`, avança `current_pick`, dispara notificação WhatsApp.
- `autoPickForTeam(leagueId, fantasyTeamId)` — seleciona melhor jogador disponível por posição em déficit.
- `finalizeDraft(leagueId)` — muda status para `active`.

### `draft/snake-order.ts` → utilitário puro
- `generateSnakeOrder(n, rounds)` → array de `{round, teamIndex}` na ordem snake.

### `draft/auto-pick.ts` → `AutoPickService`
- Algoritmo: posição com maior déficit relativo aos mínimos → jogador com maior `avg_points` → desempate por `total_minutes` → nome.

### `round/round-processor.ts` → `RoundService`
- `ensureRoundScouts(seasonId, round)` — sincroniza stats da API se ainda não persistidas.
- `closeAndAdvanceRound(leagueId, round)` — fluxo completo: lock lineups → auto-sub → calcular pontos → H2H results → standings → avançar rodada.
- `recalculatePostponedRound(leagueId, round)` — reprocessa rodada com jogos adiados.
- `generateRoundPartials(leagueId, round)` — pontos parciais antes de fechar.

### `round/sync-api-round.ts` → `SyncApiService`
- `syncRoundFromApiFootball(seasonId, round)` — baixa `fixtures/players` da API e persiste em `player_fixture_stats`.
- `syncRoundSchedule(seasonId)` — atualiza `kickoff_at` e `status` dos fixtures.

### `scoring/scoring-engine.ts` → `fantasy/scoring.ts` (já no NestJS ✅)
- `calculatePlayerPoints(stats, position)` — aplica a tabela de scouts e retorna pontos.
- Lógica de `clean_sheet`: só conta para GOL/LAT/ZAG se o time não sofreu gols E o jogador jogou ≥ 60 minutos.

### `lineup/lock.ts` → `LockService`
- `lockLineupsForRound(seasonId, round)` — identifica o menor `kickoff_at` da rodada e bloqueia todas as ligas ativas.
- `ensureLockedRoundLineups(leagueId, round)` — se manager não escalou, copia última escalação ou auto-escala.

### `lineup/auto-sub.ts` → `AutoSubService`
- `processAutoSubstitutions(teamId, round)` — substitui titular com 0 minutos pelo melhor banco da mesma posição que jogou.

### `h2h/berger-generator.ts` → utilitário puro
- `generateBergerMatchups(teams, startRound)` — gera chave completa do turno único pelo método do círculo.

### `h2h/h2h-processor.ts` → `H2HService`
- `processH2HRound(leagueId, round)` — calcula resultado do duelo e atualiza `h2h_matchups` e `league_standings`.

### `standings/total-standings.ts` → `StandingsService`
- `recalculateTotalStandings(leagueId)` — recalcula standings TOTAL a partir de `round_scores`.

### `league/h2h-validation.ts` → utilitário compartilhado
- `h2hRoundsNeeded(n)` — fórmula: par = N-1, ímpar = N.
- `validateH2HStart(n, remainingRounds)` — trava dura antes de iniciar draft H2H.

### `whatsapp/client.ts` → `WhatsAppService`
- `sendTemplateMessage({to, templateName, bodyParameters})` — Meta Graph API v22.

---

## 6. Scripts de manutenção (`scripts/`)

| Script | Quando usar |
|---|---|
| `seed-catalog.ts` | Setup inicial local sem API |
| `seed-from-api.ts` | Seed via API-Football |
| `seed-demo-league.ts` | Liga demo para testes |
| `sync-all-fixtures.ts` | Sincronizar todos os fixtures da season |
| `fetch-batch-rounds-stats.ts` | Baixar stats de múltiplas rodadas em batch |
| `fetch-r27-stats.ts` | Fetch específico da rodada 27 (script pontual) |
| `backfill-passes-completed.ts` | Preencher passes_completed retroativamente |
| `fix-clean-sheets.ts` | Recalcular clean sheets com base no placar |
| `update-player-position.ts` | Corrigir posições de jogadores manualmente |
| `cross_check_squads_v2.ts` | Validar elencos vs API-Football |
| `create-coach-account.ts` | Criar conta de comissário admin |
| `setup-demo-passwords.ts` | Configurar senhas na liga demo |
| `clean-database-for-production.ts` | Remover dados de teste antes do go-live |
| `migrate.ts` | Aplicar migrations via pg direto |

---

## 7. Variáveis de ambiente

### Next.js (frontend — estado atual)
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

API_FOOTBALL_KEY=
API_FOOTBALL_LEAGUE_ID=71

WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=

CRON_SECRET=
```

### NestJS backend (`api-cartola-mvp`)
```env
DATABASE_URL=postgresql://...   # Neon ou Railway (não Supabase)
REDIS_URL=redis://...

SUPABASE_URL=                   # apenas para JWKS na fase de transição
API_FOOTBALL_KEY=
API_FOOTBALL_LEAGUE_ID=71

WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=

R2_ACCOUNT_ID=                  # Cloudflare R2 (Storage)
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

SERVICE_API_KEY=                # endpoints de admin/cron
```

---

## 8. Decisões técnicas

### Saída do Supabase — justificativa
O Supabase foi a escolha certa para o MVP: entrega rápida, auth e realtime prontos. O trade-off — vendor lock-in em Auth, RLS e Realtime — era aceitável em 2026. Com o backend NestJS, o lock-in deixa de ser necessário e cria mais custo do que valor.

### Por que Drizzle e não Prisma?
Drizzle é mais próximo do SQL, sem camada de abstração que esconde o que está sendo executado. O schema como código TypeScript facilita a migração entre bancos. Prisma tem mais magia (lazy loading, N+1 automático) que pode surpreender negativamente em produção.

### Por que `clean_sheet` é calculado localmente?
A API-Football tem inconsistências no campo de clean sheet (especialmente para substitutos). O script `fix-clean-sheets.ts` recalcula com base no placar final do fixture, aplicando a regra dos 60 minutos.

### Por que `passes_completed` foi adicionado depois?
A migration inicial não incluía esse scout. Após análise dos dados da API-Football, foi adicionado em `20261002000000_add_passes_completed.sql` com backfill dos dados históricos.

### Custo de API-Football
Plano Free: 100 req/dia. Plano Basic: 7.500 req/dia. Para o piloto com 1–3 ligas e ~38 rodadas, o plano Basic é suficiente. O batch de fixtures evita chamadas desnecessárias.

### Realtime no draft — por que sair do Supabase Realtime?
Supabase Realtime funciona via `postgres_changes` (CDC). Com o banco saindo do Supabase, o Realtime para de funcionar automaticamente. WebSocket nativo no NestJS é a substituição natural — mais performático, sem polling e sem taxa de mensagens limitada pelo plano.
