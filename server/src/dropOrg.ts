import 'dotenv/config';
import { platformDb, orgDbBySlug, closeDb } from './db.js';

// ═══════════════════════════════════════════════════════════
// Eine Organisation restlos entfernen: Registry-Eintrag UND die eigene
// Datenbank. Gegenstück zu new-org — für verunglückte Anläufe.
//
//   npm run drop-org --prefix server -- <slug> --yes
//
// Ohne --yes passiert nichts, es wird nur gezeigt, was gelöscht würde.
// ═══════════════════════════════════════════════════════════

async function main() {
  const [slug, ...flags] = process.argv.slice(2);
  if (!slug) {
    console.error('Aufruf: npm run drop-org --prefix server -- <slug> --yes');
    process.exit(1);
  }
  const confirmed = flags.includes('--yes');

  const platform = await platformDb();
  const org = await platform.collection('organizations').findOne({ slug });
  const db = await orgDbBySlug(slug);
  const collections = await db.listCollections().toArray();

  console.log(`\nOrganisation "${slug}"`);
  console.log(`  Registry-Eintrag: ${org ? 'vorhanden' : 'fehlt'}`);
  console.log(`  Datenbank ${db.databaseName}: ${collections.length} Collections`);

  if (!confirmed) {
    console.log('\nNichts gelöscht. Mit --yes wiederholen, um es wirklich zu entfernen.\n');
    await closeDb();
    return;
  }

  // Atlas erlaubt dem App-Benutzer kein dropDatabase. Deshalb Collections
  // einzeln leeren (und, wenn erlaubt, verwerfen) und den Registry-Eintrag
  // löschen — ohne den ist die Organisation nicht mehr auflösbar.
  for (const c of collections) {
    try { await db.collection(c.name).drop(); }
    catch { await db.collection(c.name).deleteMany({}); }
  }
  await platform.collection('organizations').deleteOne({ slug });
  console.log(`\n"${slug}" entfernt: ${collections.length} Collections geleert, Registry-Eintrag gelöscht.\n`);
  await closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
