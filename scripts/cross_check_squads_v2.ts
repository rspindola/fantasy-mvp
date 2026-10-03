import { Client } from 'pg';
import fs from 'fs';
import readline from 'readline';

function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

async function extractUserClubs(): Promise<Record<string, any[]>> {
  const fileStream = fs.createReadStream(
    '/Users/renatocastro/.gemini/antigravity-ide/brain/41594645-30c7-44a7-960a-1a4805f02540/.system_generated/logs/transcript_full.jsonl'
  );
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const clubData: Record<string, any[]> = {};

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
        const content =
          typeof obj.content === 'string'
            ? obj.content
            : JSON.stringify(obj.content);
        const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (!jsonMatch) continue;

        let players: any[];
        try {
          players = JSON.parse(jsonMatch[0]);
        } catch {
          continue;
        }

        const before = content
          .slice(0, content.indexOf(jsonMatch[0]))
          .toLowerCase();

        let clubKey = '';
        if (before.includes('athletico') || before.includes('preciso validar 100%')) {
          clubKey = 'Atletico Paranaense';
        } else if (before.includes('atletico mg')) {
          clubKey = 'Atletico-MG';
        } else if (before.includes('bahia')) {
          clubKey = 'Bahia';
        } else if (before.includes('botafogo')) {
          clubKey = 'Botafogo';
        } else if (before.includes('chapecoense')) {
          clubKey = 'Chapecoense-sc';
        } else if (before.includes('corinthians')) {
          clubKey = 'Corinthians';
        } else if (before.includes('coritiba')) {
          clubKey = 'Coritiba';
        } else if (before.includes('cruzeiro')) {
          clubKey = 'Cruzeiro';
        } else if (before.includes('flamengo')) {
          clubKey = 'Flamengo';
        } else if (before.includes('fluminense')) {
          clubKey = 'Fluminense';
        } else if (before.includes('gremio')) {
          clubKey = 'Gremio';
        } else if (before.includes('mirassol') || before.includes('pular o internacional')) {
          clubKey = 'Mirassol';
        } else if (before.includes('palmeiras')) {
          clubKey = 'Palmeiras';
        } else if (before.includes('bragantino')) {
          clubKey = 'RB Bragantino';
        } else if (before.includes('agora sim, internacional')) {
          clubKey = 'Internacional';
        } else if (before.includes('vasco')) {
          clubKey = 'Vasco DA Gama';
        } else if (before.includes('remo')) {
          clubKey = 'Remo';
        } else if (before.includes('santos')) {
          clubKey = 'Santos';
        } else if (before.includes('são paulo') || before.includes('sao paulo')) {
          clubKey = 'Sao Paulo';
        } else if (before.includes('vitoria')) {
          clubKey = 'Vitoria';
        }

        if (clubKey) {
          clubData[clubKey] = players;
        }
      }
    } catch (e) {}
  }

  return clubData;
}

function wordsMatch(nameA: string, nameB: string): boolean {
  const normA = normalize(nameA);
  const normB = normalize(nameB);
  if (normA === normB) return true;

  const wordsA = normA.split(/\s+/).filter(Boolean);
  const wordsB = normB.split(/\s+/).filter(Boolean);

  // Exact set match (e.g. 'osorio luis' vs 'luis osorio')
  if (wordsA.length === wordsB.length && wordsA.length > 1) {
    const setA = new Set(wordsA);
    if (wordsB.every((w) => setA.has(w))) return true;
  }

  // Initial + word: e.g. 'e diaz' vs 'enzo diaz', 'r tolói' vs 'rafael tolói'
  if (wordsA.length === 2 && wordsA[0].length === 1) {
    if (wordsB[0].startsWith(wordsA[0]) && wordsB[wordsB.length - 1] === wordsA[1]) return true;
  }
  if (wordsB.length === 2 && wordsB[0].length === 1) {
    if (wordsA[0].startsWith(wordsB[0]) && wordsA[wordsA.length - 1] === wordsB[1]) return true;
  }

  // Compound initial: 'n de la cruz' vs 'nicolas de la cruz'
  if (wordsA[0].length === 1 && wordsB[0].startsWith(wordsA[0])) {
    const restA = wordsA.slice(1).join(' ');
    const restB = wordsB.slice(1).join(' ');
    if (restA === restB || restB.endsWith(restA)) return true;
  }
  if (wordsB[0].length === 1 && wordsA[0].startsWith(wordsB[0])) {
    const restA = wordsA.slice(1).join(' ');
    const restB = wordsB.slice(1).join(' ');
    if (restB === restA || restA.endsWith(restB)) return true;
  }

  // Full name containment if >= 4 chars
  if (normA.length >= 4 && normB.includes(normA)) return true;
  if (normB.length >= 4 && normA.includes(normB)) return true;

  // Single last name match if >= 5 characters and unique/matching initials
  if (
    wordsA[wordsA.length - 1] === wordsB[wordsB.length - 1] &&
    wordsA[wordsA.length - 1].length >= 5 &&
    wordsA[0][0] === wordsB[0][0]
  ) {
    return true;
  }

  return false;
}

const KNOWN_ALIASES: Record<string, string[]> = {
  // Vitória
  'edu': ['edu ribeiro'],
  'mateusinho': ['mateus silva'],
  'fabricio': ['fabri'],
  'aitor cantalapiedra': ['aitor'],
  // Vasco
  'caique goncalves': ['caique'],
  'tche tche': ['tche tche'],
  'euder galdino da silva': ['euder'],
  // São Paulo
  'robert arboleda': ['arboleda', 'r arboleda'],
  'jonathan calleri': ['calleri', 'j calleri'],
  'nahuel ferraresi': ['ferraresi', 'n ferraresi'],
  'wellington rato': ['rato', 'w rato', 'wellington'],
  'damiao bobadilla': ['bobadilla', 'd bobadilla'],
  'e diaz': ['enzo diaz'],
  'osorio luis': ['luis osorio'],
  // Santos
  'gabriel brazao': ['brazao', 'g brazao'],
  // Fluminense
  'jhon arias': ['arias', 'j arias'],
  'facundo bernal': ['bernal', 'f bernal'],
  // Palmeiras
  'anibal moreno': ['moreno', 'a moreno'],
  'flaco lopez': ['lopez', 'f lopez', 'jose lopez', 'jose manuel lopez'],
  // Internacional
  'rafael borre': ['rafael santos borre', 'borre'],
  // Coritiba
  'matheus felipe': ['m felipe'],
  // Flamengo
  'n de la cruz': ['nicolas de la cruz'],
  // Cruzeiro
  'n villareal': ['neiser villarreal', 'neiser villareal'],
};

async function check() {
  const clubData = await extractUserClubs();

  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres.ilinrgasbkhvzujltbhp:pQXA9LMIwHZdqBfK@aws-0-ca-central-1.pooler.supabase.com:6543/postgres';
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const clubsRes = await client.query(
    'SELECT id, name, short_name, api_football_id FROM real_clubs ORDER BY name'
  );

  const results: any[] = [];
  const allOnlyInDb: any[] = [];

  for (const club of clubsRes.rows) {
    const tmSquad = clubData[club.name] || [];
    const dbPlayersRes = await client.query(
      'SELECT id, name, position, api_football_id, avg_points, total_minutes, is_active FROM real_players WHERE club_id = $1 ORDER BY position, name',
      [club.id]
    );
    const dbPlayers = dbPlayersRes.rows;

    const onlyInDb: any[] = [];
    let matchedCount = 0;

    for (const dbp of dbPlayers) {
      const dbNorm = normalize(dbp.name);

      let found = tmSquad.some((tm: any) => wordsMatch(dbp.name, tm.name));

      if (!found) {
        for (const [k, aliases] of Object.entries(KNOWN_ALIASES)) {
          if (dbNorm === normalize(k) || aliases.includes(dbNorm)) {
            const aliasFound = tmSquad.some((tm: any) => {
              const tmNorm = normalize(tm.name);
              return tmNorm === normalize(k) || aliases.includes(tmNorm);
            });
            if (aliasFound) {
              found = true;
              break;
            }
          }
        }
      }

      if (found) {
        matchedCount++;
      } else {
        const item = {
          clubName: club.name,
          shortName: club.short_name,
          name: dbp.name,
          position: dbp.position,
          minutes: Number(dbp.total_minutes || 0),
          avg: Number(dbp.avg_points || 0),
          apiId: dbp.api_football_id,
        };
        onlyInDb.push(item);
        allOnlyInDb.push(item);
      }
    }

    results.push({
      clubName: club.name,
      shortName: club.short_name,
      totalDb: dbPlayers.length,
      totalTm: tmSquad.length,
      matched: matchedCount,
      onlyInDbCount: onlyInDb.length,
      onlyInDb,
    });
  }

  await client.end();

  fs.writeFileSync(
    'scripts/data/players_only_in_db.json',
    JSON.stringify({ results, allOnlyInDb }, null, 2),
    'utf-8'
  );

  console.log('Finished! Saved to scripts/data/players_only_in_db.json');
  console.log(`Total clubs: ${results.length}`);
  console.log(`Total players only in DB: ${allOnlyInDb.length}`);
  for (const r of results) {
    console.log(
      `${r.clubName}: DB=${r.totalDb}, TM=${r.totalTm}, Matched=${r.matched}, OnlyInDB=${r.onlyInDbCount}`
    );
  }
}

check().catch(console.error);
