# PRD — Fantasy Draft (MVP 2026)

**Produto:** liga fantasy fechada com draft snake, elenco único por liga e pontuação estilo Cartola FC a partir do desempenho real no Brasileirão Série A.

**Objetivo do MVP:** colocar 1–N ligas reais na reta final do campeonato, medir retenção (draft + escalação + rodada) e validar as duas formas de pontuação antes de comercializar em 2027.

**Não-objetivo do MVP:** ser um clone do Cartola (sem preço, sem mercado, sem técnico, sem múltiplos campeonatos).

---

## 1. Problema

No Cartola todo mundo disputa os mesmos jogadores. Aqui o ativo é **exclusivo na liga**: se o Time A draftou o centroavante do Palmeiras, nenhum outro time daquela liga o usa. Isso cria draft, rivalidade e um elenco para o resto do recorte do campeonato.

## 2. Usuários

| Persona | Precisa |
|---|---|
| Comissário | Criar liga, definir teto de vagas, convidar, escolher modo de pontuação e de draft, iniciar o draft |
| Manager | Entrar, draftar 22 jogadores, escalar 11 por rodada, ver tabela e duelos |
| Admin do produto | Sync de clubes/jogadores/jogos, reprocessar rodada, ver falhas da API |

**Tamanho da liga (N)** não é fixo. 10 times no texto anterior era só exemplo.

- **Mínimo:** 2 times fantasy (comissário + 1).
- **Máximo:** número de **clubes reais** do campeonato que alimenta a liga.
  - Brasileirão Série A (MVP): **20**.
  - No futuro, se o universo for uma liga de 14 clubes, o teto da liga fantasy é **14**.
- Comissário escolhe `teamCap` em `[2, maxClubesReais]` na criação.
- Draft começa quando o comissário dispara **iniciar**, com `N = times já inscritos`, `2 ≤ N ≤ teamCap`. Não é obrigatório encher o teto.
- Join recusado quando `inscritos === teamCap`.
- Teto duro extra: `N × 22 ≤ jogadores ativos` no catálogo (unicidade). Se o pool não cabe, recusar join / start com mensagem clara.

## 3. Regras de produto

### 3.1 Liga

1. Usuário autenticado cria a liga e vira comissário.
2. Sistema gera `inviteCode` (8 chars). Link `/join/{code}`.
3. Cada participante cria **um** time fantasy naquela liga.
4. Comissário define `teamCap` (2–20 no Brasileirão). Convites até encher o teto. Draft inicia **por ação do comissário** com pelo menos 2 times; `N` daí em diante é imutável.
5. Na criação, o comissário escolhe (imutável depois do primeiro pick):
   - **Modo de pontuação:** `TOTAL` ou `H2H`
   - **Modo de draft:** `MANUAL` | `AUTO` | `HYBRID`
   - **Teto de times** `teamCap`
   - Tempo por pick (default 90s no draft ao vivo; até 3h se assíncrono)
6. Campeonato real no MVP: **Brasileirão Série A**, season configurável (`API_FOOTBALL_LEAGUE_ID=71`). `maxClubesReais` vem do catálogo da season (`COUNT(real_clubs)`), não de constante mágica — assim outras ligas no futuro só mudam o universo.

### 3.2 Elenco e unicidade

- Draft até **22 jogadores** por time (`N × 22` picks no total; ex.: 10 times → 220, 20 times → 440).
- Jogador **único por liga**. Depois de pickado, some do board.
- Sem preço, sem venda, sem compra. Trocas entre managers: **fora do MVP**.
- Posições Cartola: `GOL`, `LAT`, `ZAG`, `MEI`, `ATA`.
- Mínimos no elenco de 22 (validados no draft; auto-pick respeita):

| Posição | Mínimo | Máximo sugerido |
|---|---|---|
| GOL | 2 | 3 |
| LAT | 3 | 5 |
| ZAG | 3 | 5 |
| MEI | 5 | 8 |
| ATA | 3 | 6 |

Se o máximo não for atingido, o restante preenche qualquer posição ainda legal.

### 3.3 Draft

Ordem **snake** (1→N, N→1, …) por 22 voltas = `N × 22` escolhas.

| Modo | Comportamento |
|---|---|
| `MANUAL` | Só pick humano. Timer; se expirar, **não** auto-completa (comissário pode forçar skip/autopick de emergência). |
| `AUTO` | Assim que o draft começa, o sistema preenche os `N × 22` picks pela fila de ranking (média de pontos / minutos). |
| `HYBRID` | Pick humano até o timer. Expira → auto-pick do melhor elegível. Manager pode marcar `autoComplete` para o resto do draft. |

**Auto-pick:** maior `avgPoints` entre jogadores ativos, da posição mais “em déficit” vs. mínimos; desempate: mais minutos, depois nome.

**Board:** filtros por posição, clube, busca; mostra se já foi draftado (e por quem, na própria liga).

Status da liga: `open` → `drafting` → `active` → `closed`.

### 3.4 Escalação (por rodada real)

Elenco de 22 **não pontua inteiro**. Cada rodada do Brasileirão o manager escala:

- 11 titulares (formação 4-3-3, 4-4-2 ou 3-5-2)
- 1 capitão (pontos × 1,5) — opcional no MVP, default ligado
- Banco não pontua

Lock: **primeiro apito da rodada real** (menor `kickoffAt` dos jogos daquela rodada do campeonato; no Brasileirão, 10 partidas). Independente de N da liga fantasy. Depois disso a escalação congela. Se o manager não escalou, copia a última escalação válida; se não houver, auto-escala os 11 de maior média respeitando a formação.

Só titulares com `minutes > 0` no jogo da rodada pontuam. Jogador sem jogo / no banco real / 0 min = 0.

### 3.5 Pontuação do jogador (espelho Cartola 2026)

Tabela oficial usada no MVP. Scouts sem equivalente fiel na API ficam documentados em `docs/ARCHITECTURE.md` (aproximações).

**Defesa**

| Scout | Pontos | Quem |
|---|---|---|
| DS desarme | +1,5 | todos |
| FC falta cometida | −0,3 | todos |
| GC gol contra | −3 | todos |
| CA amarelo | −1 | todos |
| CV vermelho | −3 | todos |
| SG sem sofrer gol | +5 | GOL, LAT, ZAG |
| DE defesa difícil | +1,3 | GOL |
| DP defesa de pênalti | +7 | GOL |
| GS gol sofrido | −1 | GOL |
| PC pênalti cometido | −1 | todos |

**Ataque**

| Scout | Pontos | Quem |
|---|---|---|
| FS falta sofrida | +0,5 | todos |
| PE passe incompleto | −0,1 | todos |
| A assistência | +4 | todos |
| FT finalização na trave | +3 | todos |
| FD finalização defendida | +1,2 | todos |
| FF finalização para fora | +0,8 | todos |
| G gol | +8 | todos |
| I impedimento | −0,1 | todos |
| PP pênalti perdido | −4 | todos |
| PS pênalti sofrido | +1 | todos |

Pontos do time na rodada = soma dos 11 titulares (capitão com multiplicador).

### 3.6 Modo TOTAL

- Cada rodada o time soma `roundPoints`.
- Classificação: `SUM(roundPoints)` desc; desempate: mais rodadas vencidas (maior pontuação na rodada), depois saldo de capitão, depois nome.
- Vale para o recorte restante do Brasileirão (MVP não exige 38 rodadas).

### 3.7 Modo H2H (teste 2026)

Cada rodada real = **uma rodada da liga**. Número de duelos = `floor(N / 2)`. Se N ímpar, 1 time folga na rodada.

Resultado do duelo (pelos `roundPoints` daquela rodada):

- maior pontuação → **3** pontos na tabela
- empate → **1** cada
- menor → **0**
- folga (N ímpar) → **0** na tabela naquela rodada (não joga; não é vitória)

Classificação H2H: pontos de tabela → confronto direto (se já jogaram) → saldo de pontos fantasy no recorte → total de pontos fantasy.

**Teto de rodadas da liga = rodadas reais restantes.** A chave é **turno único** no piloto (ida e volta só se o calendário real couber — em geral não, na reta final).

Rodadas necessárias no turno único:

| N (times fantasy) | Fórmula | Exemplo |
|---|---|---|
| Par | `N − 1` | 2→1, 8→7, 10→9, 20→19 |
| Ímpar | `N` (1 folga por rodada) | 3→3, 5→5, 9→9 |

Geração: método do círculo / Berger, alinhada 1:1 com as próximas `h2hRoundsNeeded(N)` rodadas reais.

**Quando validar**

1. **Criação:** H2H sempre pode ser escolhido se `remainingRealRounds >= 1` (cabe N=2). Se `remaining < h2hRoundsNeeded(teamCap)`, avisar: “se a liga encher até {teamCap}, o turno único não cabe; dá para iniciar com menos times ou usar TOTAL”.
2. **Início do draft (trava dura):** `N = inscritos`. Se `remainingRealRounds < h2hRoundsNeeded(N)`, **não inicia** em H2H. Mensagem: “faltam X rodadas; H2H com N times precisa de Y. Reduza o grupo, espere (não vai aumentar), ou mude para TOTAL”.
3. Ida e volta (`2 × h2hRoundsNeeded` para o mesmo N): **não oferecer** se não couber; no piloto 2026, não oferecer ida e volta.

Exemplos com ~10 rodadas reais restantes: H2H ok para N=2..10 (par) ou N=3,5,7,9; N=12 precisa 11; N=20 precisa 19 — recusar o start, não a existência da regra.

### 3.8 Sincronizar catálogo

Botão admin **Sincronizar**:

1. Busca squads atuais dos 20 clubes na API.
2. Jogadores que saíram: `isActive = false` (permanecem no histórico e em elencos já draftados).
3. Jogadores novos: insert, `isActive = true`, disponíveis no board de ligas ainda em draft.
4. Ligas `active`: jogador inativo no elenco **continua no roster** (já foi draftado) mas não pode ser escalado; manager usa o banco. Sem waiver no MVP.
5. Atualiza jogos da season e, para fixtures `FT` ainda sem scout persistido, baixa `fixtures/players` e grava histórico.

### 3.9 Histórico

Toda estatística usada para pontuar é **persistida** (`player_fixture_stats`). Reprocessar uma rodada não depende da API além do gap. UI de jogador: pontos por rodada, scouts, clube.

---

## 4. Escopo do MVP (in / out)

**In**

- Auth e-mail (magic link ou senha)
- CRUD de liga + convite
- Draft snake 22, 3 modos
- Board + unicidade
- Escalação 11 + lock
- Scoring TOTAL e H2H (com trava de rodadas)
- Tabela, rodada, time, ficha do jogador
- Sync catálogo + ingestão de scouts + cron pós-rodada
- Seed local sem API key (para desenvolver offline)
- Admin: sync, reprocessar rodada, ligas demo

**Out (2027+)**

- Mercado, orçamento, valorização
- Waiver / free agency / trades
- Técnico (TEC)
- Ao vivo intra-jogo
- App nativo
- Outros campeonatos reais (o teto N já nasce genérico: `max = clubes do universo`)
- Streaming / chat no draft (texto simples ok)
- Pagamento / premium

## 5. Métricas de sucesso do piloto

- Draft completo em < 48h (HYBRID) ou < 10 min (AUTO)
- ≥ 70% dos times com escalação manual antes do lock em cada rodada
- Zero drafts H2H iniciados sem `remaining >= h2hRoundsNeeded(N)`
- Latência percebida do board < 200ms após o catálogo em cache
- Custo API no piloto previsível (ver arquitetura: orçamento de requests)

## 6. Fluxos principais

```
Criar liga (teamCap 2..maxClubes) → convites até N ≤ cap
  → comissário inicia (≥2) → (embaralhar ordem) → draft N×22 picks
  → liga active → a cada rodada: escalar até lock → jogos reais
  → ingest scouts → pontuar titulares → atualizar TOTAL ou H2H → tabela
```

## 7. Decisões explícitas (não reabrir no MVP)

1. N ∈ [2, clubes reais do universo]; 22 no elenco; 11 pontuam. 10 era exemplo, não regra.
2. Snake draft em função de N, não linear.
3. API-Football como fonte; api-futebol.com.br e Highlightly só se a cobertura de scout falhar.
4. Capitão ×1,5 no MVP (desligar por feature flag se o piloto achar barulho).
5. Jogador transferido: inativo para nova escalação, permanece no histórico.
6. H2H 2026 = turno único se o calendário real couber para o N efetivo; senão TOTAL.
