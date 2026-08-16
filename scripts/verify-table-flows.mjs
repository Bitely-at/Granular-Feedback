#!/usr/bin/env node
/**
 * Prüft die drei Tisch-Zustandsübergänge gegen einen laufenden Server.
 *
 *   node scripts/verify-table-flows.mjs
 *   API_BASE=http://localhost:4000 ORG_SLUG=sakura-sushi node scripts/verify-table-flows.mjs
 *
 * Voraussetzung: der Server läuft (npm run server:dev).
 *
 * ACHTUNG: Das Skript schreibt in die Datenbank, auf die der Server zeigt.
 * Es legt dafür einen eigenen Tisch an und löscht ihn am Ende wieder. Die
 * Bewertungs-Testfälle erhöhen jedoch die Sternezähler der verwendeten
 * Gerichte und den Punktestand des Gastprofils — das lässt sich ohne
 * separate Test-Datenbank nicht vermeiden. Für einen echten Datenbestand
 * besser ORG_SLUG auf eine Wegwerf-Organisation setzen.
 */

const API_BASE = (process.env.API_BASE ?? 'http://localhost:4000').replace(/\/$/, '');
const ORG_SLUG = process.env.ORG_SLUG ?? 'sakura-sushi';

// Tische anlegen/buchen/schließen ist seit T-1 angemeldet-pflichtig; das
// Bewerten bleibt öffentlich (der Gast hat kein Konto).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@sakura.at';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'bitely123';

let token = null;
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

async function req(method, path, body, { auth = true } = {}) {
  const res = await fetch(`${API_BASE}/api/${ORG_SLUG}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* Antwort ohne Body */ }
  return { status: res.status, json };
}

const tableIn = (state, number) => state?.tables?.find(t => t.number === number);

async function main() {
  console.log(`\nZiel: ${API_BASE}/api/${ORG_SLUG}\n`);

  // ── Vorbereitung ────────────────────────────────────────────────
  const initial = await req('GET', '/state');
  if (initial.status !== 200) {
    console.error(`Server nicht erreichbar oder Organisation unbekannt (HTTP ${initial.status}).`);
    console.error(initial.json?.error ?? 'Läuft der Server? npm run server:dev');
    process.exit(1);
  }
  const dish = initial.json.dishes[0];
  if (!dish) {
    console.error('Keine Gerichte vorhanden — bitte zuerst seeden: npm run seed --prefix server');
    process.exit(1);
  }

  const login = await req('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { auth: false });
  if (login.status !== 200) {
    console.error(`Anmeldung fehlgeschlagen (HTTP ${login.status}): ${login.json?.error ?? ''}`);
    console.error('Läuft "npm run server:seed" gegen dieselbe Datenbank?');
    process.exit(1);
  }
  token = login.json.token;

  const created = await req('POST', '/tables', { count: 1 });
  if (created.status !== 200) {
    console.error(`Testtisch konnte nicht angelegt werden (HTTP ${created.status}).`);
    process.exit(1);
  }
  const testTable = [...created.json.tables].sort((a, b) => b.number - a.number)[0];
  const n = testTable.number;
  console.log(`Testtisch: Nr. ${n} (wird am Ende gelöscht)\n`);

  try {
    // ── Fall 1: Schließen persistiert ─────────────────────────────
    console.log('1) Tisch schließen persistiert');
    {
      const afterOrder = await req('POST', `/tables/${n}/order`, { cart: { [dish.id]: 2 } });
      check('Bestellung buchen liefert 200', afterOrder.status === 200, `HTTP ${afterOrder.status}`);
      check('Tisch steht danach auf "offen"', tableIn(afterOrder.json, n)?.status === 'offen',
        `ist: ${tableIn(afterOrder.json, n)?.status}`);

      const afterClose = await req('POST', `/tables/${n}/close`);
      check('Schließen liefert 200', afterClose.status === 200, `HTTP ${afterClose.status}`);
      check('Tisch steht danach auf "frei"', tableIn(afterClose.json, n)?.status === 'frei',
        `ist: ${tableIn(afterClose.json, n)?.status}`);

      // Der entscheidende Teil: frisch aus der Datenbank nachlesen.
      const reread = await req('GET', '/state');
      const t = tableIn(reread.json, n);
      check('Nach erneutem Laden weiterhin "frei"', t?.status === 'frei', `ist: ${t?.status}`);
      check('Nach erneutem Laden keine Positionen mehr', t?.items?.length === 0,
        `ist: ${t?.items?.length} Positionen`);
    }

    // ── Fall 2: Antwort trägt den neuen Zustand ───────────────────
    console.log('\n2) Server-Antwort enthält den neuen Zustand (Oberfläche muss nicht raten)');
    {
      const afterOrder = await req('POST', `/tables/${n}/order`, { cart: { [dish.id]: 1 } });
      const t = tableIn(afterOrder.json, n);
      check('Antwort auf "Bestellung buchen" enthält den Tisch', Boolean(t));
      check('… mit aktualisiertem Status', t?.status === 'offen', `ist: ${t?.status}`);
      check('… mit der gebuchten Position', t?.items?.some(i => i.dishId === dish.id) === true);

      const afterClose = await req('POST', `/tables/${n}/close`);
      const t2 = tableIn(afterClose.json, n);
      check('Antwort auf "Tisch schließen" enthält den neuen Status', t2?.status === 'frei',
        `ist: ${t2?.status}`);
      check('… und die geleerte Bestellung', t2?.items?.length === 0);
    }

    // ── Fall 3: Bewertete Bestellung taucht nicht wieder auf ──────
    console.log('\n3) Bewertete Bestellung verschwindet und ist nicht doppelt bewertbar');
    {
      await req('POST', `/tables/${n}/order`, { cart: { [dish.id]: 1 } });

      const review = {
        dishRatings: [{ dishId: dish.id, stars: 5 }],
        overall: { service: 5, ambience: 4, speed: 5 },
      };
      const first = await req('POST', `/tables/${n}/review`, review);
      check('Erste Bewertung liefert 200', first.status === 200,
        `HTTP ${first.status} — ${first.json?.error ?? ''}`);
      check('… und meldet Punkte zurück', typeof first.json?.pointsEarned === 'number');

      const table = await req('GET', `/tables/${n}`);
      check('Tisch hat danach keine Positionen mehr', table.json?.items?.length === 0,
        `ist: ${table.json?.items?.length} Positionen`);
      check('Tisch ist als "abgeschlossen" markiert', table.json?.status === 'abgeschlossen',
        `ist: ${table.json?.status}`);

      const second = await req('POST', `/tables/${n}/review`, review);
      check('Zweite Bewertung wird mit 409 abgelehnt', second.status === 409,
        `HTTP ${second.status}`);

      // Der eigentliche Härtefall: zwei Handys gleichzeitig auf demselben Tisch.
      await req('POST', `/tables/${n}/order`, { cart: { [dish.id]: 1 } });
      const [a, b] = await Promise.all([
        req('POST', `/tables/${n}/review`, review),
        req('POST', `/tables/${n}/review`, review),
      ]);
      const codes = [a.status, b.status].sort();
      check('Zwei gleichzeitige Bewertungen: genau eine wird angenommen',
        codes[0] === 200 && codes[1] === 409, `Antworten: ${codes.join(' und ')}`);
    }

    // ── Fall 4: Rechte am Tisch ───────────────────────────────────
    console.log('\n4) Kellner-Routen verlangen Anmeldung, Gast-Routen nicht');
    {
      const anonOrder = await req('POST', `/tables/${n}/order`, { cart: { [dish.id]: 1 } }, { auth: false });
      check('Bestellung buchen ohne Anmeldung wird mit 401 abgelehnt', anonOrder.status === 401,
        `HTTP ${anonOrder.status}`);

      const anonClose = await req('POST', `/tables/${n}/close`, undefined, { auth: false });
      check('Tisch schließen ohne Anmeldung wird mit 401 abgelehnt', anonClose.status === 401,
        `HTTP ${anonClose.status}`);

      // Der Gast hat kein Konto — Nachtragen und Bewerten müssen offen bleiben,
      // sonst funktioniert der QR-Code am Tisch nicht mehr.
      await req('POST', `/tables/${n}/order`, { cart: { [dish.id]: 1 } });
      const anonItem = await req('POST', `/tables/${n}/items`, { dishId: dish.id, qty: 1 }, { auth: false });
      check('Gast darf ohne Anmeldung nachtragen', anonItem.status === 200, `HTTP ${anonItem.status}`);

      const anonReview = await req('POST', `/tables/${n}/review`, {
        dishRatings: [{ dishId: dish.id, stars: 4 }],
        overall: { service: 4, ambience: 4, speed: 4 },
      }, { auth: false });
      check('Gast darf ohne Anmeldung bewerten', anonReview.status === 200, `HTTP ${anonReview.status}`);
    }
  } finally {
    // ── Aufräumen ────────────────────────────────────────────────
    const del = await req('DELETE', `/tables/${testTable.id}`);
    console.log(`\nTesttisch ${n} gelöscht (HTTP ${del.status}).`);
  }

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('\nSkript abgebrochen:', err);
  process.exit(1);
});
