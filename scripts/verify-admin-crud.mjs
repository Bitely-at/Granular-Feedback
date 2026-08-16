#!/usr/bin/env node
/**
 * Prüft die Verwaltungsrouten für Menü, Gutscheine und Filialen gegen einen
 * laufenden Server.
 *
 *   node scripts/verify-admin-crud.mjs
 *   API_BASE=http://localhost:4000 ORG_SLUG=sakura-sushi node scripts/verify-admin-crud.mjs
 *
 * Voraussetzung: der Server läuft (npm run server:dev).
 *
 * ACHTUNG: Das Skript schreibt in die Datenbank, auf die der Server zeigt.
 * Es legt ausschließlich eigene Testdatensätze an und räumt sie am Ende wieder
 * ab — bestehende Gerichte, Gutscheine und Filialen bleiben unberührt.
 */

const API_BASE = (process.env.API_BASE ?? 'http://localhost:4000').replace(/\/$/, '');
const ORG_SLUG = process.env.ORG_SLUG ?? 'sakura-sushi';

// Die Verwaltungsrouten sind seit T-1 angemeldet-pflichtig. Zugang aus dem
// Seed-Skript; abweichende Zugänge über die Umgebung setzbar.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@sakura.at';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'bitely123';

// Kennzeichnet die Testdatensätze, damit sie beim Aufräumen wiedererkannt
// werden — auch wenn das Skript vorher abgebrochen ist.
const MARK = 'ZZ-Prüflauf';

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

const findDish = (state, name) => state?.dishes?.find(d => d.name === name);
const findVoucher = (state, title) => state?.vouchers?.find(v => v.title === title);
const findBranch = (state, name) => state?.branches?.find(b => b.name === name);

async function main() {
  console.log(`\nZiel: ${API_BASE}/api/${ORG_SLUG}\n`);

  const initial = await req('GET', '/state');
  if (initial.status !== 200) {
    console.error(`Server nicht erreichbar oder Organisation unbekannt (HTTP ${initial.status}).`);
    console.error(initial.json?.error ?? 'Läuft der Server? npm run server:dev');
    process.exit(1);
  }

  // ── 0) Rechteprüfung ──────────────────────────────────────────
  // Zuerst OHNE Token: die Verwaltungsrouten müssen abweisen. Erst danach
  // anmelden — sonst prüfte der Rest des Skripts nur den angemeldeten Fall.
  console.log('0) Anmeldung und Rechteprüfung');
  {
    const anon = await req('POST', '/dishes', { name: `${MARK} Ohne Anmeldung`, price: 5, cat: 'Speisen' }, { auth: false });
    check('Gericht anlegen ohne Anmeldung wird mit 401 abgelehnt', anon.status === 401, `HTTP ${anon.status}`);

    const anonBranch = await req('DELETE', '/branches/000000000000000000000000', undefined, { auth: false });
    check('Filiale löschen ohne Anmeldung wird mit 401 abgelehnt', anonBranch.status === 401, `HTTP ${anonBranch.status}`);

    const badToken = await fetch(`${API_BASE}/api/${ORG_SLUG}/dishes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer erfunden.abcdef' },
      body: JSON.stringify({ name: `${MARK} Falsches Token`, price: 5, cat: 'Speisen' }),
    });
    check('Erfundenes Token wird mit 401 abgelehnt', badToken.status === 401, `HTTP ${badToken.status}`);

    const wrongPw = await req('POST', '/auth/login', { email: ADMIN_EMAIL, password: 'falsch' }, { auth: false });
    check('Login mit falschem Passwort wird mit 401 abgelehnt', wrongPw.status === 401, `HTTP ${wrongPw.status}`);

    const login = await req('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { auth: false });
    check('Login als Admin liefert 200', login.status === 200,
      `HTTP ${login.status} — ${login.json?.error ?? ''} (Seed aktuell? npm run server:seed)`);
    check('… mit Token', typeof login.json?.token === 'string' && login.json.token.length > 0);
    check('… und ohne passwordHash in der Antwort', login.json?.user?.passwordHash === undefined);
    token = login.json?.token ?? null;

    if (!token) {
      console.error('\nOhne Token können die Verwaltungsrouten nicht geprüft werden — Abbruch.');
      console.error('Läuft "npm run server:seed" gegen dieselbe Datenbank?');
      process.exit(1);
    }

    const state = await req('GET', '/state');
    check('Gesamtzustand enthält keine Passwort-Hashes',
      (state.json?.users ?? []).every(u => u.passwordHash === undefined));
  }

  const created = { dishId: null, voucherId: null, branchId: null, tableId: null };

  try {
    // ── 1) Gerichte ───────────────────────────────────────────────
    console.log('1) Menüverwaltung');
    {
      const add = await req('POST', '/dishes', { name: `${MARK} Gericht`, price: 9.9, cat: 'Speisen' });
      check('Gericht anlegen liefert 200', add.status === 200, `HTTP ${add.status} — ${add.json?.error ?? ''}`);
      const dish = findDish(add.json, `${MARK} Gericht`);
      created.dishId = dish?.id ?? null;
      check('… und erscheint im Zustand', Boolean(dish));
      check('… ohne Bewertungen', dish?.ratingsCount === 0 && dish?.ratingsSum === 0);
      check('… mit Platzhalterbild statt leerem src', typeof dish?.img === 'string' && dish.img.startsWith('data:image/'));

      const patch = await req('PATCH', `/dishes/${created.dishId}`, { price: 12.5, cat: 'Getränke' });
      const edited = findDish(patch.json, `${MARK} Gericht`);
      check('Bearbeiten übernimmt Preis und Kategorie', edited?.price === 12.5 && edited?.cat === 'Getränke',
        `ist: ${edited?.price} / ${edited?.cat}`);

      const badPrice = await req('POST', '/dishes', { name: `${MARK} Ungültig`, price: -5, cat: 'Speisen' });
      check('Negativer Preis wird mit 400 abgelehnt', badPrice.status === 400, `HTTP ${badPrice.status}`);

      const badCat = await req('POST', '/dishes', { name: `${MARK} Ungültig`, price: 5, cat: 'Nachspeise' });
      check('Unbekannte Kategorie wird mit 400 abgelehnt', badCat.status === 400, `HTTP ${badCat.status}`);

      const noName = await req('POST', '/dishes', { name: '   ', price: 5, cat: 'Speisen' });
      check('Leerer Name wird mit 400 abgelehnt', noName.status === 400, `HTTP ${noName.status}`);

      // Ein gelöschtes Gericht darf nicht auf einem Tisch zurückbleiben.
      const table = await req('POST', '/tables', { count: 1 });
      const testTable = [...table.json.tables].sort((a, b) => b.number - a.number)[0];
      created.tableId = testTable.id;
      await req('POST', `/tables/${testTable.number}/order`, { cart: { [created.dishId]: 2 } });

      const del = await req('DELETE', `/dishes/${created.dishId}`);
      check('Gericht löschen liefert 200', del.status === 200, `HTTP ${del.status}`);
      check('… und es ist aus dem Menü verschwunden', !findDish(del.json, `${MARK} Gericht`));
      const t = del.json.tables.find(x => x.id === testTable.id);
      check('… und auch von der laufenden Bestellung', t?.items?.some(i => i.dishId === created.dishId) !== true);
      check('… der dadurch leere Tisch steht wieder auf "frei"', t?.status === 'frei', `ist: ${t?.status}`);
      created.dishId = null;
    }

    // ── 2) Gutscheine ─────────────────────────────────────────────
    console.log('\n2) Gutscheinverwaltung');
    {
      const add = await req('POST', '/vouchers', { title: `${MARK} Gutschein`, points: 150, expiry: '31.12.2026' });
      check('Gutschein anlegen liefert 200', add.status === 200, `HTTP ${add.status} — ${add.json?.error ?? ''}`);
      const voucher = findVoucher(add.json, `${MARK} Gutschein`);
      created.voucherId = voucher?.id ?? null;
      check('… und erscheint im Zustand', Boolean(voucher));
      check('… mit den übergebenen Punkten', voucher?.points === 150, `ist: ${voucher?.points}`);

      const patch = await req('PATCH', `/vouchers/${created.voucherId}`, { points: 200 });
      check('Bearbeiten übernimmt die Punkte', findVoucher(patch.json, `${MARK} Gutschein`)?.points === 200);

      const badPoints = await req('POST', '/vouchers', { title: `${MARK} Ungültig`, points: 1.5, expiry: '31.12.2026' });
      check('Nicht-ganzzahlige Punkte werden mit 400 abgelehnt', badPoints.status === 400, `HTTP ${badPoints.status}`);

      const badImg = await req('POST', '/vouchers', { title: `${MARK} Ungültig`, points: 10, expiry: '31.12.2026', img: 'javascript:alert(1)' });
      check('Bild ohne data:/http(s): wird mit 400 abgelehnt', badImg.status === 400, `HTTP ${badImg.status}`);

      const del = await req('DELETE', `/vouchers/${created.voucherId}`);
      check('Gutschein löschen liefert 200', del.status === 200, `HTTP ${del.status}`);
      check('… und er ist verschwunden', !findVoucher(del.json, `${MARK} Gutschein`));
      created.voucherId = null;
    }

    // ── 3) Filialen ───────────────────────────────────────────────
    console.log('\n3) Filialverwaltung');
    {
      const add = await req('POST', '/branches', { name: `${MARK} Filiale`, address: 'Teststraße 1, 8010 Graz' });
      check('Filiale anlegen liefert 200', add.status === 200, `HTTP ${add.status} — ${add.json?.error ?? ''}`);
      const branch = findBranch(add.json, `${MARK} Filiale`);
      created.branchId = branch?.id ?? null;
      check('… und erscheint im Zustand', Boolean(branch));
      check('… mit erzeugtem slug', typeof branch?.slug === 'string' && branch.slug.length > 0, `ist: ${branch?.slug}`);

      const patch = await req('PATCH', `/branches/${created.branchId}`, { address: 'Teststraße 2, 8010 Graz' });
      check('Bearbeiten übernimmt die Adresse',
        findBranch(patch.json, `${MARK} Filiale`)?.address === 'Teststraße 2, 8010 Graz');
      check('… und lässt den slug unverändert',
        findBranch(patch.json, `${MARK} Filiale`)?.slug === branch?.slug);

      const noAddress = await req('POST', '/branches', { name: `${MARK} Ungültig` });
      check('Fehlende Adresse wird mit 400 abgelehnt', noAddress.status === 400, `HTTP ${noAddress.status}`);

      // Eine Filiale mit Tischen zu löschen würde gedruckte QR-Codes ins Leere zeigen lassen.
      const withTable = await req('POST', '/tables', { count: 1, branchId: created.branchId });
      const branchTable = [...withTable.json.tables].sort((a, b) => b.number - a.number)[0];
      check('Neuer Tisch landet in der gewählten Filiale', branchTable?.branchId === created.branchId,
        `ist: ${branchTable?.branchId}`);

      const blocked = await req('DELETE', `/branches/${created.branchId}`);
      check('Filiale mit Tischen wird mit 409 abgelehnt', blocked.status === 409, `HTTP ${blocked.status}`);

      await req('DELETE', `/tables/${branchTable.id}`);
      const del = await req('DELETE', `/branches/${created.branchId}`);
      check('Nach Löschen der Tische geht die Filiale weg', del.status === 200, `HTTP ${del.status}`);
      check('… und sie ist verschwunden', !findBranch(del.json, `${MARK} Filiale`));
      created.branchId = null;
    }
  } finally {
    // ── Aufräumen ────────────────────────────────────────────────
    // Läuft auch nach einem Abbruch mitten im Test, damit nichts liegenbleibt.
    if (created.tableId) await req('DELETE', `/tables/${created.tableId}`);
    if (created.dishId) await req('DELETE', `/dishes/${created.dishId}`);
    if (created.voucherId) await req('DELETE', `/vouchers/${created.voucherId}`);
    if (created.branchId) await req('DELETE', `/branches/${created.branchId}`);

    const rest = await req('GET', '/state');
    const leftovers = [
      ...(rest.json?.dishes ?? []).filter(d => d.name.startsWith(MARK)).map(d => ['dishes', d.id]),
      ...(rest.json?.vouchers ?? []).filter(v => v.title.startsWith(MARK)).map(v => ['vouchers', v.id]),
      ...(rest.json?.branches ?? []).filter(b => b.name.startsWith(MARK)).map(b => ['branches', b.id]),
    ];
    for (const [collection, id] of leftovers) await req('DELETE', `/${collection}/${id}`);
    console.log(`\nTestdaten entfernt${leftovers.length > 0 ? ` (${leftovers.length} Reste)` : ''}.`);
  }

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('\nSkript abgebrochen:', err);
  process.exit(1);
});
