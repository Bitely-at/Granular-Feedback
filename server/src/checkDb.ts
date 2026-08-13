import 'dotenv/config';
import { platformDb, closeDb, connectionSummary, explainDbError } from './db.js';

// Prüft die Datenbankverbindung ohne den Server zu starten:
//   npm run check-db --prefix server
// Nutzt dieselbe MONGODB_URI wie der Server, gibt aber Klartext statt 500 zurück.

async function main() {
  const { user, host, scheme } = connectionSummary();
  console.log(`Verbinde als Benutzer '${user}' mit ${host} (${scheme})…\n`);

  try {
    const db = await platformDb();
    await db.command({ ping: 1 });
    const orgs = await db.collection('organizations').find().toArray();

    console.log('✓ Verbindung steht.');
    if (orgs.length === 0) {
      console.log('\n⚠ Es ist noch keine Organisation angelegt.');
      console.log('  Führe aus: npm run seed --prefix server');
    } else {
      console.log(`\nGefundene Organisationen (${orgs.length}):`);
      for (const o of orgs) console.log(`  - ${o.slug}  (${o.name})`);
    }
  } catch (err) {
    const e = err as { message?: string; code?: unknown; codeName?: string };
    console.error('✗ Verbindung fehlgeschlagen.\n');
    console.error(`Meldung: ${e?.message ?? String(err)}`);
    if (e?.code != null) console.error(`Code:    ${e.code}${e.codeName ? ` (${e.codeName})` : ''}`);
    console.error(`\nWas zu tun ist:\n${explainDbError(err)}`);
    process.exitCode = 1;
  } finally {
    await closeDb().catch(() => {});
  }
}

main();
