#!/usr/bin/env node
/**
 * Prüft die Gutschein-Einlösung gegen einen laufenden Server: entwerten, die
 * Ausgabe eintragen — und dass die Punkte dabei genau einmal wandern.
 *
 * Der Wisch entwertet endgültig: es gibt weder Abbrechen noch Verfall. Was
 * diese Suite dazu geprüft hat, ist mit den Abläufen selbst entfallen; geblieben
 * ist die Prüfung, dass der Rückweg auch wirklich zu ist.
 *
 *   node scripts/verify-redemptions.mjs
 *   API_BASE=http://localhost:4000 ORG_SLUG=sakura-sushi node scripts/verify-redemptions.mjs
 *
 * Voraussetzung: der Server läuft (npm run server:dev) und wurde geseedet.
 *
 * ACHTUNG: Das Skript schreibt in die Datenbank, auf die der Server zeigt.
 * Es legt ein eigenes Gastkonto und eigene Gutscheine (Präfix unten) an und
 * löscht beides am Ende wieder.
 * Drei davon werden dabei wirklich entwertet — die Punkte sind danach
 * verbraucht, wie bei jeder echten Einlösung auch. Reichen die Punkte des
 * Gastprofils nicht, verdient das Skript sie über den regulären
 * Bewertungsablauf; das erhöht die Sternezähler der verwendeten Gerichte.
 * Die Einlösungen selbst bleiben als Verlauf stehen — dafür gibt es bewusst
 * keine Löschroute; sie tragen den Präfix im Titel.
 */

const API_BASE = (process.env.API_BASE ?? 'http://localhost:4000').replace(/\/$/, '');
const ORG_SLUG = process.env.ORG_SLUG ?? 'sakura-sushi';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@sakura.at';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'bitely123';
// Kellner der ersten Filiale — die Ausgabe eintragen soll die Servicekraft
// können, nicht nur der Admin.
const WAITER_EMAIL = process.env.WAITER_EMAIL ?? 'kellner@sakura.at';
// Filialleitung der ZWEITEN Filiale, für die Filialtrennung.
const MANAGER2_EMAIL = process.env.MANAGER2_EMAIL ?? 'manager2@sakura.at';
// Frisch geseedete Konten teilen ein Passwort, gewachsene nicht — deshalb je
// Konto überschreibbar.
const WAITER_PASSWORD = process.env.WAITER_PASSWORD ?? ADMIN_PASSWORD;
const MANAGER2_PASSWORD = process.env.MANAGER2_PASSWORD ?? ADMIN_PASSWORD;

// Kennzeichnet die Testdatensätze, damit sie beim Aufräumen wiedererkannt
// werden — auch wenn das Skript vorher abgebrochen ist.
const MARK = 'ZZ-Prüflauf';

// Eigenes Gastkonto: Punkte gehören seit den Gastkonten einem Konto, und
// einlösen kann nur, wer angemeldet ist.
const GUEST = { email: 'zz-pruef-einloesung@example.com', name: 'Prüf Einlöser', password: 'geheim12345' };

let token = null;
let guestToken = null;
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

// auth: false = nicht als Personal. Wenn ein Gast angemeldet ist, geht dessen
// Token mit — das ist der Normalfall in der Gastansicht. `as: null` erzwingt
// gar kein Token (echte Anonymität).
async function req(method, path, body, { auth = true, as = null, anonymous = false } = {}) {
  const bearer = anonymous ? null : (as ?? (auth ? token : guestToken));
  const res = await fetch(`${API_BASE}/api/${ORG_SLUG}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* Antwort ohne Body */ }
  return { status: res.status, json };
}

async function login(email, password = ADMIN_PASSWORD) {
  const res = await req('POST', '/auth/login', { email, password }, { auth: false });
  return res.status === 200 ? res.json.token : null;
}

async function main() {
  console.log(`\nZiel: ${API_BASE}/api/${ORG_SLUG}\n`);

  // ── Vorbereitung ────────────────────────────────────────────────
  token = await login(ADMIN_EMAIL);
  if (!token) {
    console.error(`Anmeldung als ${ADMIN_EMAIL} fehlgeschlagen.`);
    console.error('Läuft der Server (npm run server:dev)?');
    console.error('Eine gewachsene Datenbank kennt womöglich andere Konten als das Seed-Skript:');
    console.error('  npm run set-password --prefix server            zeigt alle Konten');
    console.error('  ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/verify-redemptions.mjs');
    process.exit(1);
  }
  // Eintragen soll die Servicekraft können. Fehlt der Zugang, läuft der Rest
  // mit dem Admin weiter — dann prüft dieser Teil nur weniger, statt zu scheitern.
  const waiterToken = (await login(WAITER_EMAIL, WAITER_PASSWORD)) ?? token;
  if (waiterToken === token) {
    console.log(`Hinweis: kein Kellner-Zugang (${WAITER_EMAIL}) — eingetragen wird als Admin.\n`);
  }
  const manager2Token = await login(MANAGER2_EMAIL, MANAGER2_PASSWORD);

  const all = await req('GET', '/state');
  if (all.status !== 200) {
    console.error(`Zustand konnte nicht geladen werden (HTTP ${all.status}).`);
    console.error(all.json?.error ?? 'Läuft der Server? npm run server:dev');
    process.exit(1);
  }
  const branch = all.json.branches?.[0];
  const branch2 = all.json.branches?.[1];
  const dish = all.json.dishes?.[0];
  if (!branch || !dish) {
    console.error('Filiale oder Gericht fehlt — bitte zuerst seeden: npm run server:seed');
    process.exit(1);
  }
  const B = branch.slug;

  // Gastkonto anlegen — oder anmelden, falls ein früherer Lauf abgebrochen ist.
  const reg = await req('POST', '/guest/register', GUEST, { anonymous: true });
  guestToken = reg.status === 200
    ? reg.json.token
    : (await req('POST', '/guest/login', { email: GUEST.email, password: GUEST.password }, { anonymous: true })).json?.token;
  if (!guestToken) {
    console.error('Prüf-Gastkonto konnte weder angelegt noch angemeldet werden.');
    process.exit(1);
  }

  const created = { vouchers: [], tableId: null };
  // Der Punktestand des GASTES — also mit dessen Token gelesen, nicht mit dem
  // des Personals.
  const guestPoints = async () => (await req('GET', `/state?branch=${B}`, undefined, { auth: false })).json?.guest?.points ?? 0;
  const guestRedeemed = async () => (await req('GET', `/state?branch=${B}`, undefined, { auth: false })).json?.guest?.redeemed ?? [];

  async function addVoucher(title, points, branchIds = undefined) {
    const res = await req('POST', '/vouchers', {
      title: `${MARK} ${title}`, points, expiry: '31.12.2099',
      ...(branchIds ? { branchIds } : {}),
    });
    const v = res.json?.vouchers?.find(x => x.title === `${MARK} ${title}`);
    if (!v) {
      console.error(`Test-Gutschein "${title}" konnte nicht angelegt werden (HTTP ${res.status}).`);
      process.exit(1);
    }
    created.vouchers.push(v.id);
    return v;
  }

  // Eine Einlösung braucht Deckung. Fehlt sie, verdient das Skript die Punkte
  // über den regulären Ablauf — buchen und bewerten — statt am Profil zu drehen.
  async function ensurePoints(min) {
    if (await guestPoints() >= min) return true;
    const before = new Set((await req('GET', `/state?branch=${B}`)).json.tables.map(t => t.id));
    const madeTable = await req('POST', `/branches/${B}/tables`, { count: 1 });
    const table = madeTable.json?.tables?.find(t => t.branchId === branch.id && !before.has(t.id));
    if (!table) return false;
    created.tableId = table.id;

    for (let i = 0; i < 5 && await guestPoints() < min; i++) {
      await req('POST', `/branches/${B}/tables/${table.number}/order`, { cart: { [dish.id]: 1 } });
      // Bewerten als GAST — nur so landen die Punkte auf seinem Konto.
      await req('POST', `/branches/${B}/tables/${table.number}/review`, {
        dishRatings: [{ dishId: dish.id, stars: 5 }],
        overall: { service: 5, ambience: 5, speed: 5 },
      }, { auth: false });
    }
    return await guestPoints() >= min;
  }

  try {
    // Drei Entwertungen gehen wirklich durch (Ausgabe, Sichtbar, Wettlauf) —
    // zurück kommt seit dem endgültigen Wisch nichts mehr. Etwas Luft für den
    // Fall, dass ein früherer Lauf abgebrochen ist.
    if (!await ensurePoints(4)) {
      console.error('Der Gast hat zu wenige Punkte und es ließen sich keine verdienen — Abbruch.');
      process.exit(1);
    }

    const vAusgabe = await addVoucher('Ausgabe', 1);
    const vSichtbar = await addVoucher('Sichtbar', 1);
    const vWettlauf = await addVoucher('Wettlauf', 1);
    const vTeuer = await addVoucher('Zu teuer', 100000);
    const vRest = await addVoucher('Rest', 1);
    const vFremd = branch2 ? await addVoucher('Nur Filiale 2', 1, [branch2.id]) : null;

    // ── 1) Entwerten ──────────────────────────────────────────────
    console.log('1) Der Gast entwertet den Gutschein');
    let entwertet = null;
    {
      const pointsBefore = await guestPoints();
      // Nicht als Personal, sondern mit dem Token des Gastes — so wie in der
      // Gastansicht am Tisch.
      const open = await req('POST', `/branches/${B}/vouchers/${vAusgabe.id}/redeem`, {}, { auth: false });
      check('Entwerten liefert 200', open.status === 200,
        `HTTP ${open.status} — ${open.json?.error ?? ''}`);
      entwertet = open.json?.redemption ?? null;

      check('… mit vierstelligem Code', /^\d{4}$/.test(entwertet?.code ?? ''), `Code: ${entwertet?.code}`);
      check('… im Zustand "entwertet"', entwertet?.status === 'entwertet', `ist: ${entwertet?.status}`);
      check('… und ohne Frist', entwertet?.expiresAt === null, `Frist: ${entwertet?.expiresAt}`);

      check('Die Punkte sind sofort weg', await guestPoints() === pointsBefore - vAusgabe.points,
        `${pointsBefore} → ${await guestPoints()}, erwartet ${pointsBefore - vAusgabe.points}`);
      check('… und der Gutschein gilt als vergeben',
        (await guestRedeemed()).includes(vAusgabe.id));

      const again = await req('POST', `/branches/${B}/vouchers/${vAusgabe.id}/redeem`, {}, { auth: false });
      check('Zweites Entwerten desselben Gutscheins wird mit 409 abgelehnt', again.status === 409,
        `HTTP ${again.status}`);

      // Die Servicekraft sieht den Eintrag in IHRER App — dort wird die Ausgabe
      // eingetragen.
      const inBranch = (await req('GET', `/state?branch=${B}`, undefined, { as: waiterToken }))
        .json?.redemptions?.find(r => r.id === entwertet?.id);
      check('Die Servicekraft sieht die Einlösung in ihrer Filiale', !!inBranch);
      check('… mitsamt dem Code, den sie abgleichen muss', inBranch?.code === entwertet?.code,
        `ist: ${inBranch?.code}`);
      if (branch2) {
        const inOther = (await req('GET', `/state?branch=${branch2.slug}`))
          .json?.redemptions?.find(r => r.id === entwertet?.id);
        check('… und die andere Filiale sieht sie nicht', !inOther);
      }

      // Wer gar nicht angemeldet ist, soll nicht mitlesen können, welche Zahl
      // gerade am Nebentisch auf dem Handy steht.
      const anonState = (await req('GET', `/state?branch=${B}`, undefined, { anonymous: true }))
        .json?.redemptions ?? [];
      check('Im Zustand ohne Anmeldung steht kein einziger Code',
        anonState.every(r => r.code === undefined),
        `${anonState.filter(r => r.code !== undefined).length} von ${anonState.length} mit Code`);
      check('… der Eintrag selbst ist aber sichtbar (der Gast sieht seinen Stand)',
        anonState.some(r => r.id === entwertet?.id));
    }

    // ── 2) Ausgabe eintragen ──────────────────────────────────────
    console.log('\n2) Die Servicekraft trägt die Ausgabe in ihrer eigenen App ein');
    {
      const anon = await req('POST', `/branches/${B}/redemptions/${entwertet.id}/confirm`, undefined, { anonymous: true });
      check('Eintragen ohne Anmeldung wird mit 401 abgelehnt', anon.status === 401, `HTTP ${anon.status}`);

      if (branch2) {
        // Mit der Filialleitung der zweiten Filiale, wenn es sie gibt: dann greift
        // schon die Filialbindung (403). Sonst als Admin — der darf überall hin und
        // fällt erst über die Filiale IM Update-Filter (409).
        const foreign = await req('POST', `/branches/${branch2.slug}/redemptions/${entwertet.id}/confirm`,
          undefined, { as: manager2Token ?? token });
        check('Die andere Filiale kann sie nicht eintragen', foreign.status === 409 || foreign.status === 403,
          `HTTP ${foreign.status}`);
        const stillOpen = (await req('GET', `/state?branch=${B}`)).json?.redemptions?.find(r => r.id === entwertet.id);
        check('… und sie steht danach unverändert auf "entwertet"', stillOpen?.status === 'entwertet',
          `ist: ${stillOpen?.status}`);
      }

      const pointsBefore = await guestPoints();
      const ok = await req('POST', `/branches/${B}/redemptions/${entwertet.id}/confirm`, undefined, { as: waiterToken });
      check('Der Kellner trägt die Ausgabe mit 200 ein', ok.status === 200, `HTTP ${ok.status} — ${ok.json?.error ?? ''}`);

      const done = ok.json?.redemptions?.find(r => r.id === entwertet.id);
      check('… der Eintrag steht danach auf "eingelöst"', done?.status === 'eingelöst', `ist: ${done?.status}`);
      check('… mit Zeitpunkt', typeof done?.redeemedAt === 'number');
      check('… und dem Namen der Servicekraft', typeof done?.confirmedByName === 'string' && done.confirmedByName.length > 0,
        `ist: ${done?.confirmedByName}`);

      const twice = await req('POST', `/branches/${B}/redemptions/${entwertet.id}/confirm`, undefined, { as: waiterToken });
      check('Zweites Eintragen wird mit 409 abgelehnt', twice.status === 409, `HTTP ${twice.status}`);
      check('Die Punkte bleiben verbraucht', await guestPoints() === pointsBefore,
        `${pointsBefore} → ${await guestPoints()}`);
    }

    // ── 3) Der Gast schließt den Bildschirm ───────────────────────
    // Er darf ihn wieder aufmachen: die Entwertung steht in dem Zustand, den
    // sein Token lädt. Der Code steht dort NICHT — angezeigt wird er nirgends
    // mehr, und was niemand sieht, muss auch nicht herausgegeben werden.
    console.log('\n3) Die Entwertung bleibt sichtbar, der Code nicht');
    {
      const pointsBefore = await guestPoints();
      const open = await req('POST', `/branches/${B}/vouchers/${vSichtbar.id}/redeem`, {}, { auth: false });
      const r = open.json?.redemption;
      check('Entwerten liefert 200', open.status === 200, `HTTP ${open.status} — ${open.json?.error ?? ''}`);

      const eigene = (await req('GET', `/state?branch=${B}`, undefined, { auth: false }))
        .json?.redemptions?.find(x => x.id === r.id);
      check('Der Gast findet seine Entwertung im Zustand wieder', !!eigene);
      check('… ohne den Code, den niemand mehr vorzeigt', eigene?.code === undefined, `ist: ${eigene?.code}`);
      check('… und sie steht weiter auf "entwertet"', eigene?.status === 'entwertet', `ist: ${eigene?.status}`);

      // Der Rückweg ist zu — die Route selbst ist weg, nicht nur der Knopf.
      const cancel = await req('POST', `/branches/${B}/redemptions/${r.id}/cancel`, { code: r.code }, { auth: false });
      check('Abbrechen gibt es nicht mehr', cancel.status === 404 || cancel.status === 405,
        `HTTP ${cancel.status}`);
      check('… die Punkte bleiben weg', await guestPoints() === pointsBefore - vSichtbar.points,
        `${pointsBefore} → ${await guestPoints()}`);
      check('… und der Gutschein bleibt vergeben', (await guestRedeemed()).includes(vSichtbar.id));
    }

    // ── 4) Gleichzeitigkeit ───────────────────────────────────────
    // Zwei Handys am selben Konto, zwei Servicekräfte am selben Eintrag: der
    // Schutz liegt im Update-Filter, nicht in einer vorgelagerten Prüfung.
    console.log('\n4) Zwei gleichzeitige Anfragen');
    {
      const pointsBefore = await guestPoints();
      const [o1, o2] = await Promise.all([
        req('POST', `/branches/${B}/vouchers/${vWettlauf.id}/redeem`, {}, { auth: false }),
        req('POST', `/branches/${B}/vouchers/${vWettlauf.id}/redeem`, {}, { auth: false }),
      ]);
      const openCodes = [o1.status, o2.status].sort();
      check('Zwei gleichzeitige Entwertungen: genau eine wird angenommen',
        openCodes[0] === 200 && openCodes[1] === 409, `Antworten: ${openCodes.join(' und ')}`);
      check('… und die Punkte werden nur einmal abgebucht',
        await guestPoints() === pointsBefore - vWettlauf.points,
        `${pointsBefore} → ${await guestPoints()}, erwartet ${pointsBefore - vWettlauf.points}`);

      const r = (o1.json?.redemption ?? o2.json?.redemption);
      if (r) {
        const [c1, c2] = await Promise.all([
          req('POST', `/branches/${B}/redemptions/${r.id}/confirm`, undefined, { as: waiterToken }),
          req('POST', `/branches/${B}/redemptions/${r.id}/confirm`, undefined, { as: waiterToken }),
        ]);
        const codes = [c1.status, c2.status].sort();
        check('Zwei gleichzeitige Eintragungen: genau eine wird angenommen',
          codes[0] === 200 && codes[1] === 409, `Antworten: ${codes.join(' und ')}`);
      }
    }

    // ── 5) Was gar nicht erst entwertet werden darf ───────────────
    console.log('\n5) Abgewiesene Entwertungen');
    {
      const ohneKonto = await req('POST', `/branches/${B}/vouchers/${vRest.id}/redeem`, {}, { anonymous: true });
      check('Einlösen ohne Gastkonto wird mit 401 abgelehnt', ohneKonto.status === 401, `HTTP ${ohneKonto.status}`);

      const broke = await req('POST', `/branches/${B}/vouchers/${vTeuer.id}/redeem`, {}, { auth: false });
      check('Ohne Deckung wird mit 400 abgelehnt', broke.status === 400, `HTTP ${broke.status}`);
      check('… ohne einen Eintrag zu hinterlassen',
        !(await req('GET', `/state?branch=${B}`)).json?.redemptions
          ?.some(r => r.voucherId === vTeuer.id));

      if (vFremd) {
        const wrongBranch = await req('POST', `/branches/${B}/vouchers/${vFremd.id}/redeem`, {}, { auth: false });
        check('Ein Gutschein der anderen Filiale wird mit 400 abgelehnt', wrongBranch.status === 400,
          `HTTP ${wrongBranch.status}`);
      }

      const missing = await req('POST', `/branches/${B}/vouchers/000000000000000000000000/redeem`, {}, { auth: false });
      check('Unbekannter Gutschein wird mit 404 abgelehnt', missing.status === 404, `HTTP ${missing.status}`);

      const broken = await req('POST', `/branches/${B}/vouchers/keine-id/redeem`, {}, { auth: false });
      check('Kaputte Gutschein-ID wird mit 400 abgelehnt', broken.status === 400, `HTTP ${broken.status}`);

      const badTable = await req('POST', `/branches/${B}/vouchers/${vRest.id}/redeem`,
        { tableNumber: 0 }, { auth: false });
      check('Ungültige Tischnummer wird mit 400 abgelehnt', badTable.status === 400, `HTTP ${badTable.status}`);

      const badId = await req('POST', `/branches/${B}/redemptions/keine-id/confirm`, undefined, { as: waiterToken });
      check('Kaputte Einlösungs-ID beim Eintragen wird mit 400 abgelehnt', badId.status === 400,
        `HTTP ${badId.status}`);
    }

  } finally {
    // ── Aufräumen ────────────────────────────────────────────────
    // Läuft auch nach einem Abbruch mitten im Test. Das Löschen eines
    // Gutscheins zieht ihn auch aus dem Gastprofil.
    if (guestToken) await req('DELETE', '/guest/me', undefined, { auth: false });
    for (const id of created.vouchers) await req('DELETE', `/vouchers/${id}`);
    if (created.tableId) await req('DELETE', `/branches/${branch.slug}/tables/${created.tableId}`);

    const rest = await req('GET', '/state');
    const leftovers = (rest.json?.vouchers ?? []).filter(v => v.title.startsWith(MARK));
    for (const v of leftovers) await req('DELETE', `/vouchers/${v.id}`);
    console.log(`\nTestdaten entfernt${leftovers.length > 0 ? ` (${leftovers.length} Reste)` : ''}.`);
  }

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('\nSkript abgebrochen:', err);
  process.exit(1);
});
