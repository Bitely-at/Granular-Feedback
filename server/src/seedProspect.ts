import 'dotenv/config';
import { closeDb } from './db.js';
import { seedProspect, type Prospect } from './prospects/engine.js';
import { haoHan } from './prospects/haoHan.js';
import { kungFuBao } from './prospects/kungFuBao.js';
import { sette } from './prospects/sette.js';
import { kaoo } from './prospects/kaoo.js';
import { kendang } from './prospects/kendang.js';

// ═══════════════════════════════════════════════════════════
// Pitch-Demos für einzelne Lokale anlegen
//
//   npm run seed:prospect --prefix server -- <slug>   ein Lokal
//   npm run seed:prospect --prefix server -- all      alle
//   npm run seed:prospect --prefix server             Liste
//
// Jedes Lokal ist eine Beschreibung in `prospects/<name>.ts` (echte Karte,
// echte Fotos, an echten Google-Rezensionen orientierte Bewertungen); den
// Aufbau übernimmt `prospects/engine.ts`. Wieder entfernen: drop-org.
// ═══════════════════════════════════════════════════════════

const PROSPECTS: Prospect[] = [haoHan, kungFuBao, sette, kaoo, kendang];

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log('Verfügbar:', PROSPECTS.map(p => p.slug).join(', '), '| all');
    return;
  }
  const chosen = arg === 'all' ? PROSPECTS : PROSPECTS.filter(p => p.slug === arg);
  if (chosen.length === 0) {
    console.error(`Unbekannt: '${arg}'. Verfügbar: ${PROSPECTS.map(p => p.slug).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  for (const p of chosen) await seedProspect(p);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => closeDb());
