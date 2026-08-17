import 'dotenv/config';
import { orgDbBySlug, closeDb } from './db.js';
import type { GuestDoc } from './types.js';

/**
 * Setzt den Punktestand eines Gastkontos.
 *
 *   npm run guest-points --prefix server -- <e-mail> <punkte> [orgSlug]
 *
 * Gedacht für Vorführungen und Support: Punkte entstehen sonst ausschließlich
 * durch Bewertungen, und für eine Demo des Einlöse-Ablaufs braucht es welche.
 * Bewusst ein Kommandozeilen-Werkzeug und KEINE Route — ein Endpunkt, der
 * Punkte vergibt, wäre genau die Hintertür, gegen die der ganze Ablauf
 * abgesichert ist.
 *
 * Ohne Argumente aufgerufen, listet es die Gastkonten auf.
 */

async function main() {
  const [email, pointsArg, orgArg] = process.argv.slice(2);
  const orgSlug = orgArg ?? process.env.ORG_SLUG ?? 'sakura-sushi';
  const db = await orgDbBySlug(orgSlug);
  const guests = db.collection<GuestDoc>('guests');

  if (!email) {
    const all = await guests.find().sort({ createdAt: -1 }).toArray();
    console.log(`\nGastkonten in '${orgSlug}' (${all.length}):\n`);
    for (const g of all) {
      const wege = [g.passwordHash ? 'Passwort' : null, g.googleSub ? 'Google' : null]
        .filter(Boolean).join(' + ') || 'kein Anmeldeweg';
      console.log(`  ${g.email.padEnd(32)} ${String(g.points).padStart(6)} Pkt.   ${wege}`);
    }
    console.log('\nPunkte setzen:');
    console.log('  npm run guest-points --prefix server -- <e-mail> <punkte>\n');
    await closeDb();
    return;
  }

  const points = Number(pointsArg);
  if (!Number.isInteger(points) || points < 0 || points > 100000) {
    console.error('Punkte müssen eine ganze Zahl von 0 bis 100000 sein.');
    console.error('Aufruf: npm run guest-points --prefix server -- <e-mail> <punkte> [orgSlug]');
    await closeDb();
    process.exit(1);
  }

  const target = email.toLowerCase();
  const result = await guests.findOneAndUpdate(
    { email: target },
    { $set: { points } },
    { returnDocument: 'after' }
  );
  if (!result) {
    console.error(`Kein Gastkonto mit der E-Mail '${target}' in '${orgSlug}'.`);
    console.error('Ohne Argumente aufrufen, um alle Gastkonten zu sehen.');
    await closeDb();
    process.exit(1);
  }

  console.log(`\n${result.name} <${target}> steht jetzt bei ${result.points} Punkten.\n`);
  await closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
