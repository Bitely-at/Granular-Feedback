#!/usr/bin/env node
/**
 * Prüft die Gastkonten gegen einen laufenden Server: registrieren, anmelden,
 * Punkte sammeln, einlösen — und vor allem, dass zwei Gäste einander nicht
 * sehen. Vorher teilten sich ALLE Gäste ein Profil.
 *
 *   node scripts/verify-guests.mjs
 *   API_BASE=http://localhost:4000 ORG_SLUG=sakura-sushi node scripts/verify-guests.mjs
 *
 * Voraussetzung: der Server läuft (npm run server:dev).
 *
 * ACHTUNG: Das Skript schreibt in die Datenbank, auf die der Server zeigt. Es
 * legt zwei Gastkonten und einen Tisch an und räumt beides am Ende wieder ab.
 * Die abgegebenen Testbewertungen bleiben — sie erhöhen die Sternezähler der
 * verwendeten Gerichte, wie bei verify:tables auch.
 */

const API_BASE = (process.env.API_BASE ?? 'http://localhost:4000').replace(/\/$/, '');
const ORG_SLUG = process.env.ORG_SLUG ?? 'sakura-sushi';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@sakura.at';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'bitely123';

const MARK = 'zz-pruef';
const GUEST_A = { email: `${MARK}-a@example.com`, name: 'Prüf Gast A', password: 'geheim12345' };
const GUEST_B = { email: `${MARK}-b@example.com`, name: 'Prüf Gast B', password: 'geheim54321' };

let adminToken = null;
let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    passed++;
  } else {
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `\n        ${detail}` : ''}`);
    failed++;
  }
}

async function req(method, path, body, { as = null } = {}) {
  const res = await fetch(`${API_BASE}/api/${ORG_SLUG}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(as ? { Authorization: `Bearer ${as}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* Antwort ohne Body */ }
  return { status: res.status, json };
}

const pointsOf = async token =>
  (await req('GET', `/state?branch=${branchSlug}`, undefined, { as: token })).json?.guest?.points ?? null;

let branchSlug = null;

async function main() {
  console.log(`\nZiel: ${API_BASE}/api/${ORG_SLUG}\n`);

  const login = await req('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (login.status !== 200) {
    console.error(`Anmeldung als ${ADMIN_EMAIL} fehlgeschlagen (HTTP ${login.status}).`);
    console.error('Läuft der Server? Konten anzeigen: npm run set-password --prefix server');
    console.error('Abweichende Zugänge: ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/verify-guests.mjs');
    process.exit(1);
  }
  adminToken = login.json.token;

  const all = await req('GET', '/state', undefined, { as: adminToken });
  const branch = all.json?.branches?.[0];
  const dish = all.json?.dishes?.[0];
  if (!branch || !dish) {
    console.error('Filiale oder Gericht fehlt — bitte zuerst seeden.');
    process.exit(1);
  }
  branchSlug = branch.slug;

  // Eigener Tisch, damit die Bewertungen dieses Laufs niemandem dazwischenfunken.
  const before = new Set((await req('GET', `/state?branch=${branchSlug}`, undefined, { as: adminToken })).json.tables.map(t => t.id));
  const made = await req('POST', `/branches/${branchSlug}/tables`, { count: 1 }, { as: adminToken });
  const table = made.json?.tables?.find(t => t.branchId === branch.id && !before.has(t.id));
  if (!table) {
    console.error('Testtisch konnte nicht angelegt werden.');
    process.exit(1);
  }

  const created = { tableId: table.id, tokens: [] };
  const review = () => ({
    dishRatings: [{ dishId: dish.id, stars: 5 }],
    overall: { service: 5, ambience: 4, speed: 5 },
  });
  const order = () => req('POST', `/branches/${branchSlug}/tables/${table.number}/order`,
    { cart: { [dish.id]: 1 } }, { as: adminToken });

  try {
    // ── 1) Konto anlegen ──────────────────────────────────────────
    console.log('1) Registrieren');
    let tokenA = null;
    {
      const reg = await req('POST', '/guest/register', GUEST_A);
      check('Registrieren liefert 200', reg.status === 200, `HTTP ${reg.status} — ${reg.json?.error ?? ''}`);
      check('… mit Token', typeof reg.json?.token === 'string' && reg.json.token.length > 0);
      check('… und ohne Passwort-Hash in der Antwort',
        reg.json?.guest?.passwordHash === undefined && reg.json?.guest?.password === undefined);
      check('… das Konto startet bei 0 Punkten', reg.json?.guest?.points === 0, `ist: ${reg.json?.guest?.points}`);
      tokenA = reg.json?.token ?? null;
      if (tokenA) created.tokens.push(tokenA);

      const again = await req('POST', '/guest/register', GUEST_A);
      check('Dieselbe E-Mail ein zweites Mal wird mit 409 abgelehnt', again.status === 409, `HTTP ${again.status}`);

      const short = await req('POST', '/guest/register', { ...GUEST_B, password: 'kurz' });
      check('Zu kurzes Passwort wird mit 400 abgelehnt', short.status === 400, `HTTP ${short.status}`);

      const noMail = await req('POST', '/guest/register', { ...GUEST_B, email: 'ohne-at-zeichen' });
      check('E-Mail ohne @ wird mit 400 abgelehnt', noMail.status === 400, `HTTP ${noMail.status}`);
    }

    // ── 2) Anmelden ───────────────────────────────────────────────
    console.log('\n2) Anmelden und Sitzung');
    {
      const wrong = await req('POST', '/guest/login', { email: GUEST_A.email, password: 'falsch-aber-lang' });
      check('Falsches Passwort wird mit 401 abgelehnt', wrong.status === 401, `HTTP ${wrong.status}`);

      const unknown = await req('POST', '/guest/login', { email: 'gibt-es-nicht@example.com', password: 'egal-egal' });
      check('Unbekannte E-Mail liefert dieselbe 401', unknown.status === 401, `HTTP ${unknown.status}`);
      check('… mit derselben Meldung (verrät nicht, wer ein Konto hat)',
        unknown.json?.error === wrong.json?.error, `"${unknown.json?.error}" vs "${wrong.json?.error}"`);

      const ok = await req('POST', '/guest/login', { email: GUEST_A.email, password: GUEST_A.password });
      check('Richtiges Passwort liefert 200', ok.status === 200, `HTTP ${ok.status}`);
      tokenA = ok.json?.token ?? tokenA;

      const me = await req('GET', '/guest/me', undefined, { as: tokenA });
      check('/guest/me kennt das Konto', me.json?.guest?.email === GUEST_A.email, `ist: ${me.json?.guest?.email}`);

      const anon = await req('GET', '/guest/me');
      check('/guest/me ohne Token wird mit 401 abgelehnt', anon.status === 401, `HTTP ${anon.status}`);
    }

    // ── 3) Die beiden Token-Arten sind getrennt ───────────────────
    // Ohne diese Trennung wäre ein Gastkonto eine Hintertür ins Personal.
    console.log('\n3) Gast-Token und Personal-Token sind nicht dasselbe');
    {
      const asGuest = await req('POST', '/dishes', { name: 'ZZ Gasttest', price: 5, cat: 'Speisen' }, { as: tokenA });
      check('Gast-Token an einer Admin-Route: 401', asGuest.status === 401, `HTTP ${asGuest.status}`);

      const closeTable = await req('POST', `/branches/${branchSlug}/tables/${table.number}/close`, undefined, { as: tokenA });
      check('Gast-Token an einer Kellner-Route: 401', closeTable.status === 401, `HTTP ${closeTable.status}`);

      const staffAsGuest = await req('GET', '/guest/me', undefined, { as: adminToken });
      check('Personal-Token an /guest/me: 401', staffAsGuest.status === 401, `HTTP ${staffAsGuest.status}`);
    }

    // ── 4) Punkte gehören einem Konto ─────────────────────────────
    console.log('\n4) Punkte hängen am Konto, nicht am Gerät');
    let tokenB = null;
    {
      const anonState = await req('GET', `/state?branch=${branchSlug}`);
      check('Ohne Anmeldung: 0 Punkte und nichts eingelöst',
        anonState.json?.guest?.points === 0 && (anonState.json?.guest?.redeemed ?? []).length === 0
        && anonState.json?.guest?.loggedIn === false,
        JSON.stringify(anonState.json?.guest));

      await order();
      const anonReview = await req('POST', `/branches/${branchSlug}/tables/${table.number}/review`, review());
      check('Bewerten ohne Konto liefert 200 (der QR-Code muss ohne Anmeldung gehen)',
        anonReview.status === 200, `HTTP ${anonReview.status} — ${anonReview.json?.error ?? ''}`);
      check('… bringt aber keine Punkte', anonReview.json?.pointsEarned === 0,
        `ist: ${anonReview.json?.pointsEarned}`);
      check('… und sagt, was zu holen gewesen wäre', anonReview.json?.pointsPossible > 0,
        `ist: ${anonReview.json?.pointsPossible}`);

      const beforeA = await pointsOf(tokenA);
      await order();
      const withAccount = await req('POST', `/branches/${branchSlug}/tables/${table.number}/review`, review(), { as: tokenA });
      check('Bewerten mit Konto bringt Punkte', withAccount.json?.pointsEarned > 0,
        `ist: ${withAccount.json?.pointsEarned}`);
      const afterA = await pointsOf(tokenA);
      check('… und sie stehen auf dem Konto', afterA === beforeA + withAccount.json.pointsEarned,
        `${beforeA} → ${afterA}, erwartet ${beforeA + (withAccount.json?.pointsEarned ?? 0)}`);

      // Der eigentliche Punkt der Umstellung: ein zweiter Gast sieht davon nichts.
      const regB = await req('POST', '/guest/register', GUEST_B);
      tokenB = regB.json?.token ?? null;
      if (tokenB) created.tokens.push(tokenB);
      check('Ein zweites Konto startet wieder bei 0', await pointsOf(tokenB) === 0);
      check('… und der erste Gast behält seine Punkte', await pointsOf(tokenA) === afterA);
    }

    // ── 4b) Punkte nachträglich sichern ───────────────────────────
    // Wer erst bewertet und sich dann anmeldet, soll seine Punkte bekommen —
    // sonst ist "Anmelden und Punkte sichern" eine leere Zusage.
    console.log('\n4b) Erst bewerten, dann anmelden');
    {
      await order();
      const anon = await req('POST', `/branches/${branchSlug}/tables/${table.number}/review`, review());
      check('Bewertung ohne Konto liefert einen Punkte-Gutschein',
        typeof anon.json?.pointsTicket === 'string' && anon.json.pointsTicket.length > 0);
      const ticket = anon.json?.pointsTicket;
      const wert = anon.json?.pointsPossible ?? 0;

      const vorher = await pointsOf(tokenB);
      const claim = await req('POST', '/guest/claim-points', { ticket }, { as: tokenB });
      check('Einlösen schreibt die Punkte gut', claim.json?.pointsClaimed === wert,
        `${claim.json?.pointsClaimed} statt ${wert}`);
      check('… und sie stehen auf dem Konto', await pointsOf(tokenB) === vorher + wert,
        `${vorher} → ${await pointsOf(tokenB)}`);

      const nochmal = await req('POST', '/guest/claim-points', { ticket }, { as: tokenB });
      check('Derselbe Gutschein ein zweites Mal bringt nichts', nochmal.json?.pointsClaimed === 0,
        `ist: ${nochmal.json?.pointsClaimed}`);
      check('… und der Kontostand bleibt', await pointsOf(tokenB) === vorher + wert);

      const fremd = await req('POST', '/guest/claim-points', { ticket }, { as: tokenA });
      check('Ein anderes Konto bekommt dieselben Punkte nicht', fremd.json?.pointsClaimed === 0,
        `ist: ${fremd.json?.pointsClaimed}`);

      const ohneKonto = await req('POST', '/guest/claim-points', { ticket });
      check('Einlösen ohne Anmeldung wird mit 401 abgelehnt', ohneKonto.status === 401,
        `HTTP ${ohneKonto.status}`);

      const erfunden = await req('POST', '/guest/claim-points', { ticket: 'aaa.bbb' }, { as: tokenB });
      check('Ein erfundener Gutschein wird mit 400 abgelehnt', erfunden.status === 400,
        `HTTP ${erfunden.status}`);
    }

    // ── 5) Einlösen setzt ein Konto voraus ────────────────────────
    console.log('\n5) Einlösen');
    {
      const voucher = (await req('GET', `/state?branch=${branchSlug}`, undefined, { as: adminToken }))
        .json?.vouchers?.[0];
      if (!voucher) {
        console.log('  \x1b[33mSKIP\x1b[0m  kein Gutschein vorhanden');
      } else {
        const anon = await req('POST', `/branches/${branchSlug}/vouchers/${voucher.id}/redeem`, {});
        check('Einlösen ohne Anmeldung wird mit 401 abgelehnt', anon.status === 401, `HTTP ${anon.status}`);

        // Gast B hat 0 Punkte — der Gutschein ist damit außer Reichweite.
        const broke = await req('POST', `/branches/${branchSlug}/vouchers/${voucher.id}/redeem`, {}, { as: tokenB });
        check('Ohne Deckung wird mit 400 abgelehnt', broke.status === 400, `HTTP ${broke.status}`);
      }
    }

    // ── 6) Anmeldewege ────────────────────────────────────────────
    console.log('\n6) Anmeldewege');
    {
      const opts = await req('GET', '/guest/auth-options');
      check('Die Anmeldewege sind abfragbar', opts.status === 200, `HTTP ${opts.status}`);
      check('… E-Mail und Passwort gehen immer', opts.json?.password === true);
      check('… Google nur mit gesetzter Client-ID',
        opts.json?.google === (typeof opts.json?.googleClientId === 'string' && opts.json.googleClientId.length > 0),
        `google: ${opts.json?.google}, clientId: ${opts.json?.googleClientId ?? 'nicht gesetzt'}`);
      if (!opts.json?.google) {
        console.log('  \x1b[33mHINWEIS\x1b[0m  GOOGLE_CLIENT_ID ist auf dem Server nicht gesetzt — der Google-Weg ist aus.');
      }

      const noCredential = await req('POST', '/guest/google', {});
      check('Google-Anmeldung ohne Token wird abgewiesen',
        noCredential.status === 400 || noCredential.status === 503, `HTTP ${noCredential.status}`);

      const junk = await req('POST', '/guest/google', { credential: 'kein.echtes.token' });
      check('Erfundenes Google-Token wird abgewiesen',
        junk.status === 401 || junk.status === 503, `HTTP ${junk.status}`);
    }
  } finally {
    // ── Aufräumen ────────────────────────────────────────────────
    for (const t of created.tokens) await req('DELETE', '/guest/me', undefined, { as: t });
    if (created.tableId) await req('DELETE', `/branches/${branchSlug}/tables/${created.tableId}`, undefined, { as: adminToken });
    console.log('\nTestkonten und Testtisch entfernt.');
  }

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('\nSkript abgebrochen:', err);
  process.exit(1);
});
