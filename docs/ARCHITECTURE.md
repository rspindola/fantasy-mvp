# Arquitetura Técnica — Fantasy Draft MVP

> Documento de referência para o sistema atual (Next.js + Supabase).
> Para o plano do backend Node.js separado, ver [`BACKEND_PLAN.md`](./BACKEND_PLAN.md).

---

## 1. Visão geral

```
Browser (React 19)
    │
    ├─ Server Components / Server Actions (Next.js 16 App Router)
    │       │
    │       ├─ lib/supabase/server.ts   ← Supabase SSR client
    │       ├─ lib/draft/engine.ts      ← lógica de draft
    │       ├─ lib/round/              ← processamento de rodada
    │       ├─ lib/scoring/            ← motor de pontuação
    │       └─ lib/whatsapp/           ← notificações
    │
    ├─ Client Components (Realtime)
    │       └─ Supabase Realtime (draft board ao vivo)
    │
    └─ API Routes
            └─ /api/cron/market-alert  ← cron protegido por CRON_SECRET

Supabase (PostgreSQL + Auth + RLS + Storage + Realtime)

API-Football (fonte de dados externa — league_id=71)

WhatsApp Cloud API (Meta Graph API v22)
```

---

## 2. Schema do banco de dados

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

> **Nota sobre passes_completed:** a coluna foi adicionada na migration `20261002000000_add_passes_completed.sql`. O script `backfill-passes-completed.ts` preenche dados históricos.

> **Nota sobre clean_sheet:** calculado via `fix-clean-sheets.ts` com base no placar final do fixture, não diretamente da API (que pode ter inconsistências).

---

### Tabelas de liga e jogo

#### `profiles`
Extensão de `auth.users`. Criada automaticamente via trigger `on_auth_user_created`.
- `phone_number` (TEXT) — para notificações WhatsApp.

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
| banner_url | TEXT (Supabase Storage) |

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

## 3. RLS (Row Level Security)

| Tabela | Leitura | Escrita |
|---|---|---|
| seasons, real_clubs, real_players, fixtures, player_fixture_stats | Pública | Service role |
| profiles | Pública | Próprio user |
| leagues | Pública | commissioner_id = auth.uid() |
| fantasy_teams | Pública | user_id = auth.uid() |
| draft_picks | Pública | user_id owner do fantasy_team |
| lineups / lineup_slots | Pública | user_id owner do fantasy_team |
| round_scores, league_standings, h2h_matchups | Pública | Service role |

> Operações de admin (fechar rodada, sync, reprocessar) usam `SUPABASE_SERVICE_ROLE_KEY` via Server Actions.

---

## 4. Realtime

Habilitado para o draft:
- Tabela `draft_picks` — subscribers recebem novos picks em tempo real.
- Tabela `leagues` — subscribers recebem mudança de `current_pick` e `status`.

Habilitado via migration `20261005000001_enable_realtime_draft.sql`.

---

## 5. Módulos core (`src/lib/`)

### `draft/engine.ts`
- `startDraftEngine(leagueId)` — shuffles teams, seta `total_picks`, muda status para `drafting`, gera matchups H2H se necessário, cria lineups iniciais.
- `makePick(leagueId, playerId, fantasyTeamId)` — valida turno, insere `draft_picks`, insere `roster_players`, avança `current_pick`, dispara notificação WhatsApp.
- `autoPickForTeam(leagueId, fantasyTeamId)` — seleciona melhor jogador disponível por posição em déficit.
- `finalizeDraft(leagueId)` — muda status para `active`.

### `draft/snake-order.ts`
- `generateSnakeOrder(n, rounds)` → array de `{round, teamIndex}` na ordem snake.

### `draft/auto-pick.ts`
- Algoritmo: posição com maior déficit relativo aos mínimos → jogador com maior `avg_points` → desempate por `total_minutes` → nome.

### `round/round-processor.ts`
- `ensureRoundScouts(seasonId, round)` — sincroniza stats da API se ainda não persistidas.
- `closeAndAdvanceRound(leagueId, round)` — fluxo completo: lock lineups → auto-sub → calcular pontos → H2H results → standings → avançar rodada.
- `recalculatePostponedRound(leagueId, round)` — reprocessa rodada com jogos adiados.
- `generateRoundPartials(leagueId, round)` — pontos parciais antes de fechar.

### `round/sync-api-round.ts`
- `syncRoundFromApiFootball(seasonId, round)` — baixa `fixtures/players` da API e persiste em `player_fixture_stats`.
- `syncRoundSchedule(seasonId)` — atualiza `kickoff_at` e `status` dos fixtures.

### `scoring/scoring-engine.ts`
- `calculatePlayerPoints(stats, position)` — aplica a tabela de scouts e retorna pontos.
- Lógica de `clean_sheet`: só conta para GOL/LAT/ZAG se o time não sofreu gols E o jogador jogou ≥ 60 minutos.

### `lineup/lock.ts`
- `lockLineupsForRound(seasonId, round)` — identifica o menor `kickoff_at` da rodada e bloqueia todas as ligas ativas.
- `ensureLockedRoundLineups(leagueId, round)` — se manager não escalou, copia última escalação ou auto-escala.

### `lineup/auto-sub.ts`
- `processAutoSubstitutions(teamId, round)` — substitui titular com 0 minutos pelo melhor banco da mesma posição que jogou.

### `h2h/berger-generator.ts`
- `generateBergerMatchups(teams, startRound)` — gera chave completa do turno único pelo método do círculo.

### `h2h/h2h-processor.ts`
- `processH2HRound(leagueId, round)` — calcula resultado do duelo e atualiza `h2h_matchups` e `league_standings`.

### `standings/total-standings.ts`
- `recalculateTotalStandings(leagueId)` — recalcula standings TOTAL a partir de `round_scores`.

### `league/h2h-validation.ts`
- `h2hRoundsNeeded(n)` — fórmula: par = N-1, ímpar = N.
- `validateH2HStart(n, remainingRounds)` — trava dura antes de iniciar draft H2H.

### `whatsapp/client.ts`
- `sendTemplateMessage({to, templateName, bodyParameters})` — Meta Graph API v22.

### `whatsapp/draft-notification.ts`
- `notifyDraftTurn(leagueId, pickNumber)` — busca o manager da vez e manda WhatsApp.

### `whatsapp/market-notification.ts`
- `sendMarketClosingAlert(leagueId, round)` — avisa managers sem escalação.

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

---

## 8. Decisões técnicas e trade-offs

### Por que Supabase e não um backend próprio?
O MVP precisava de velocidade de entrega. Supabase fornece Auth, RLS, Realtime e Storage prontos. O trade-off é que a lógica de negócio ficou misturada com Server Actions do Next.js, o que dificulta testes e escala. O backend Node.js separado resolve isso.

### Por que `passes_completed` foi adicionado depois?
A migration inicial não incluía esse scout. Após análise dos dados da API-Football, foi adicionado em `20261002000000_add_passes_completed.sql` com backfill dos dados históricos.

### Por que `clean_sheet` é calculado localmente?
A API-Football tem inconsistências no campo de clean sheet (especialmente para substitutos). O script `fix-clean-sheets.ts` recalcula com base no placar final do fixture, aplicando a regra dos 60 minutos.

### Custo de API-Football
Plano Free: 100 req/dia. Plano Basic: 7.500 req/dia. Para o piloto com 1–3 ligas e ~38 rodadas, o plano Basic é suficiente. O batch de fixtures evita chamadas desnecessárias.

### Realtime no draft
Usa Supabase Realtime via `REALTIME_LISTEN_EVENTS` nas tabelas `draft_picks` e `leagues`. O cliente React se inscreve no canal e atualiza o board sem polling.
