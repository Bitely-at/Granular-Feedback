import 'dotenv/config';
import { orgDbBySlug, closeDb } from './db.js';
import { hashPassword } from './auth.js';
import type { UserDoc } from './types.js';

/**
 * Setzt das Passwort eines Mitarbeiterkontos — und schaltet es damit frei.
 *
 *   npm run set-password --prefix server -- <e-mail> <passwort> [orgSlug]
 *
 * Gedacht für zwei Fälle, für die es in der Oberfläche (noch) keinen Weg gibt:
 * einem eingeladenen Benutzer sein erstes Passwort geben, und ein vergessenes
 * zurücksetzen. Ohne Passwort kann sich ein Konto nicht anmelden — genau das
 * bedeutet `passwordHash: null`.
 *
 * Wird OHNE Argumente aufgerufen, listet es die Konten der Organisation auf,
 * statt etwas zu ändern.
 */

const MIN_LENGTH = 8;

async function main() {
  const [email, password, orgArg] = process.argv.slice(2);
  const orgSlug = orgArg ?? process.env.ORG_SLUG ?? 'sakura-sushi';
  const db = await orgDbBySlug(orgSlug);
  const users = db.collection<UserDoc>('users');

  // Ohne Argumente: nur zeigen, wer da ist und wer sich anmelden kann.
  if (!email) {
    const all = await users.find().sort({ role: 1 }).toArray();
    console.log(`\nKonten in '${orgSlug}' (${all.length}):\n`);
    for (const u of all) {
      const state = u.passwordHash ? 'kann sich anmelden' : 'KEIN PASSWORT';
      console.log(`  ${u.email.padEnd(28)} ${u.role.padEnd(8)} ${u.status.padEnd(11)} ${state}`);
    }
    console.log('\nPasswort setzen:');
    console.log('  npm run set-password --prefix server -- <e-mail> <passwort>\n');
    await closeDb();
    return;
  }

  if (!password || password.length < MIN_LENGTH) {
    console.error(`Das Passwort muss mindestens ${MIN_LENGTH} Zeichen haben.`);
    console.error('Aufruf: npm run set-password --prefix server -- <e-mail> <passwort> [orgSlug]');
    await closeDb();
    process.exit(1);
  }

  const target = email.toLowerCase();
  const user = await users.findOne({ email: target });
  if (!user) {
    console.error(`Kein Konto mit der E-Mail '${target}' in '${orgSlug}'.`);
    console.error('Ohne Argumente aufrufen, um alle Konten zu sehen.');
    await closeDb();
    process.exit(1);
  }

  // 'aktiv' mitsetzen: ein eingeladenes Konto mit Passwort, das sich trotzdem
  // nicht anmelden darf, wäre für den Aufrufer nicht nachvollziehbar.
  await users.updateOne(
    { _id: user._id },
    { $set: { passwordHash: hashPassword(password), status: 'aktiv' } }
  );

  console.log(`\nPasswort für ${user.name} <${target}> gesetzt (Rolle: ${user.role}).`);
  if (user.status !== 'aktiv') console.log(`Status von '${user.status}' auf 'aktiv' gesetzt.`);
  console.log('');
  await closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
