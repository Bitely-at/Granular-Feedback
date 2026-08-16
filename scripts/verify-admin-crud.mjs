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
// Filialleitung — darf nur ihre eigene Filiale, nichts Kettenweites.
const MANAGER_EMAIL = process.env.MANAGER_EMAIL ?? 'manager@sakura.at';

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

  // Als Ketten-Admin (ohne feste Filiale) liefert /state ohne Parameter den
  // Blick über alle Filialen.
  const initial = await req('GET', '/state');
  if (initial.status !== 200) {
    console.error(`Zustand konnte nicht geladen werden (HTTP ${initial.status}).`);
    console.error(initial.json?.error ?? 'Läuft der Server? npm run server:dev');
    process.exit(1);
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
      const mainBranch = initial.json.branches[0];
      const beforeIds = new Set(initial.json.tables.map(t => t.id));
      const table = await req('POST', `/branches/${mainBranch.slug}/tables`, { count: 1 });
      // Über die ID finden, nicht über die höchste Nummer: die kann seit der
      // filialweisen Zählung in einer anderen Filiale liegen.
      const testTable = table.json.tables.find(t => !beforeIds.has(t.id));
      created.tableId = testTable.id;
      await req('POST', `/branches/${mainBranch.slug}/tables/${testTable.number}/order`, { cart: { [created.dishId]: 2 } });

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
      const newBranchSlug = branch.slug;
      const withTable = await req('POST', `/branches/${newBranchSlug}/tables`, { count: 1 });
      const branchTable = withTable.json.tables.find(t => t.branchId === created.branchId);
      check('Neuer Tisch landet in der gewählten Filiale', branchTable?.branchId === created.branchId,
        `ist: ${branchTable?.branchId}`);
      // Eine frische Filiale fängt bei 1 an, unabhängig davon, wie weit die
      // Nummern in den anderen Filialen schon gelaufen sind.
      check('… und trägt die Nummer 1 (Zählung beginnt pro Filiale neu)', branchTable?.number === 1,
        `ist: ${branchTable?.number}`);

      const blocked = await req('DELETE', `/branches/${created.branchId}`);
      check('Filiale mit Tischen wird mit 409 abgelehnt', blocked.status === 409, `HTTP ${blocked.status}`);

      await req('DELETE', `/branches/${newBranchSlug}/tables/${branchTable.id}`);
      const del = await req('DELETE', `/branches/${created.branchId}`);
      check('Nach Löschen der Tische geht die Filiale weg', del.status === 200, `HTTP ${del.status}`);
      check('… und sie ist verschwunden', !findBranch(del.json, `${MARK} Filiale`));
      created.branchId = null;
    }

    // ── 4) Filialleitung darf nichts Kettenweites ────────────────
    console.log('\n4) Rechte der Filialleitung');
    {
      const mgr = await req('POST', '/auth/login',
        { email: MANAGER_EMAIL, password: ADMIN_PASSWORD }, { auth: false });
      if (mgr.status !== 200) {
        console.log(`  \x1b[33mSKIP\x1b[0m  kein Filialleitungs-Konto (${MANAGER_EMAIL}) — Seed aktuell?`);
      } else {
        const adminToken = token;
        token = mgr.json.token;

        const dish = await req('POST', '/dishes', { name: `${MARK} Von Manager`, price: 5, cat: 'Speisen' });
        check('Gericht anlegen: 403', dish.status === 403, `HTTP ${dish.status}`);

        const voucher = await req('POST', '/vouchers', { title: `${MARK} Von Manager`, points: 10, expiry: '31.12.2026' });
        check('Gutschein anlegen: 403', voucher.status === 403, `HTTP ${voucher.status}`);

        const newBranch = await req('POST', '/branches', { name: `${MARK} Von Manager`, address: 'Teststraße 9' });
        check('Filiale anlegen: 403', newBranch.status === 403, `HTTP ${newBranch.status}`);

        const brand = await req('PATCH', '/settings/brand', { name: 'Umbenannt' });
        check('Branding ändern: 403', brand.status === 403, `HTTP ${brand.status}`);

        // Erlaubt: Servicekraft in der eigenen Filiale einladen.
        const ownBranch = mgr.json.user.branchId;
        const invite = await req('POST', '/users', {
          name: `${MARK} Servicekraft`, email: `zz-pruef-kellner@example.com`, role: 'Kellner',
        });
        check('Servicekraft einladen: 200', invite.status === 200,
          `HTTP ${invite.status} — ${invite.json?.error ?? ''}`);
        const invited = invite.json?.users?.find(u => u.email === 'zz-pruef-kellner@example.com');
        check('… landet in der eigenen Filiale', invited?.branchId === ownBranch,
          `ist: ${invited?.branchId}, erwartet: ${ownBranch}`);

        // Verboten: jemanden mit mehr Rechten anlegen.
        const escalate = await req('POST', '/users', {
          name: `${MARK} Zweitadmin`, email: 'zz-pruef-admin@example.com', role: 'Admin',
        });
        check('Admin anlegen: 403 (keine Rechteausweitung)', escalate.status === 403,
          `HTTP ${escalate.status}`);

        token = adminToken;
        if (invited) await req('DELETE', `/users/${invited.id}`);
      }
    }

    // ── 5) Menü pro Filiale ──────────────────────────────────────
    console.log('\n5) Gerichte lassen sich pro Filiale führen');
    {
      const state = await req('GET', '/state');
      const [b1, b2] = state.json.branches;
      if (!b2) {
        console.log('  \x1b[33mSKIP\x1b[0m  nur eine Filiale vorhanden');
      } else {
        // Ein Gericht nur für Filiale 1 anlegen.
        const add = await req('POST', '/dishes', {
          name: `${MARK} Nur B1`, price: 7.5, cat: 'Speisen', branchIds: [b1.id],
        });
        const only1 = findDish(add.json, `${MARK} Nur B1`);
        created.dishId = only1?.id ?? null;
        check('Gericht mit Filial-Einschränkung anlegen: 200', add.status === 200, `HTTP ${add.status}`);
        check('… trägt genau diese Filiale', JSON.stringify(only1?.branchIds) === JSON.stringify([b1.id]),
          `ist: ${JSON.stringify(only1?.branchIds)}`);

        const in1 = await req('GET', `/state?branch=${b1.slug}`);
        check('… erscheint in Filiale 1', Boolean(findDish(in1.json, `${MARK} Nur B1`)));
        const in2 = await req('GET', `/state?branch=${b2.slug}`);
        // Der Admin sieht die ganze Karte (er verwaltet sie) — der Gast nicht.
        const guest2 = await req('GET', `/state?branch=${b2.slug}`, undefined, { auth: false });
        check('… erscheint für den Gast in Filiale 2 NICHT',
          !findDish(guest2.json, `${MARK} Nur B1`));
        check('… der Admin sieht es trotzdem (sonst nicht mehr einschaltbar)',
          Boolean(findDish(in2.json, `${MARK} Nur B1`)));

        // Alle Filialen ausgewählt = "überall", als null gespeichert.
        const toAll = await req('PATCH', `/dishes/${created.dishId}`, { branchIds: [b1.id, b2.id] });
        check('Alle Filialen ausgewählt wird zu "überall" (null)',
          findDish(toAll.json, `${MARK} Nur B1`)?.branchIds === null,
          `ist: ${JSON.stringify(findDish(toAll.json, `${MARK} Nur B1`)?.branchIds)}`);

        // Verfügbarkeits-Schalter der Filialleitung.
        const off = await req('PATCH', `/branches/${b2.slug}/dishes/${created.dishId}/availability`, { active: false });
        check('In einer Filiale abschalten: 200', off.status === 200, `HTTP ${off.status}`);
        const afterOff = findDish(off.json, `${MARK} Nur B1`);
        check('… "überall" wird zur ausdrücklichen Liste ohne diese Filiale',
          Array.isArray(afterOff?.branchIds) && !afterOff.branchIds.includes(b2.id),
          `ist: ${JSON.stringify(afterOff?.branchIds)}`);

        const on = await req('PATCH', `/branches/${b2.slug}/dishes/${created.dishId}/availability`, { active: true });
        check('Wieder anschalten macht daraus erneut "überall"',
          findDish(on.json, `${MARK} Nur B1`)?.branchIds === null,
          `ist: ${JSON.stringify(findDish(on.json, `${MARK} Nur B1`)?.branchIds)}`);

        // Ein Gericht, das die Filiale nicht führt, darf dort nicht buchbar sein.
        await req('PATCH', `/branches/${b2.slug}/dishes/${created.dishId}/availability`, { active: false });
        const tablesB2 = (await req('GET', `/state?branch=${b2.slug}`)).json.tables;
        if (tablesB2.length > 0) {
          const t = tablesB2[0];
          const book = await req('POST', `/branches/${b2.slug}/tables/${t.number}/order`,
            { cart: { [created.dishId]: 1 } });
          check('Nicht geführtes Gericht buchen wird mit 400 abgelehnt', book.status === 400,
            `HTTP ${book.status}`);
        }

        await req('DELETE', `/dishes/${created.dishId}`);
        created.dishId = null;

        const badBranch = await req('POST', '/dishes', {
          name: `${MARK} Ungültig`, price: 5, cat: 'Speisen', branchIds: ['000000000000000000000000'],
        });
        check('Unbekannte Filial-ID wird mit 400 abgelehnt', badBranch.status === 400, `HTTP ${badBranch.status}`);

        const emptyList = await req('POST', '/dishes', {
          name: `${MARK} Ungültig`, price: 5, cat: 'Speisen', branchIds: [],
        });
        check('Leere Filial-Liste wird mit 400 abgelehnt', emptyList.status === 400, `HTTP ${emptyList.status}`);
      }
    }
  } finally {
    // ── Aufräumen ────────────────────────────────────────────────
    // Läuft auch nach einem Abbruch mitten im Test, damit nichts liegenbleibt.
    if (created.tableId) await req('DELETE', `/branches/${initial.json.branches[0].slug}/tables/${created.tableId}`);
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
