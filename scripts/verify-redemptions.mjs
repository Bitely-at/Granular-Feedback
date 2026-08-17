#!/usr/bin/env node
/**
 * Prüft die Gutschein-Einlösung gegen einen laufenden Server: eröffnen,
 * quittieren, abbrechen, verfallen — und dass die Punkte dabei immer genau
 * einmal wandern.
 *
 *   node scripts/verify-redemptions.mjs
 *   SKIP_EXPIRY=1 node scripts/verify-redemptions.mjs      # ohne die 60-Sekunden-Wartezeit
 *   API_BASE=http://localhost:4000 ORG_SLUG=sakura-sushi node scripts/verify-redemptions.mjs
 *
 * Voraussetzung: der Server läuft (npm run server:dev) und wurde geseedet.
 *
 * ACHTUNG: Das Skript schreibt in die Datenbank, auf die der Server zeigt.
 * Es legt eigene Gutscheine (Präfix unten) an und löscht sie am Ende wieder.
 * Zwei davon werden dabei aber wirklich eingelöst — die Punkte sind danach
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
// Kellner der ersten Filiale — quittieren soll die Servicekraft können, nicht
// nur der Admin.
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

// Muss zu REDEMPTION_TTL_MS in server/src/index.ts passen.
const TTL_MS = 60_000;

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

async function req(method, path, body, { auth = true, as = null } = {}) {
  const bearer = as ?? token;
  const res = await fetch(`${API_BASE}/api/${ORG_SLUG}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && bearer ? { Authorization: `Bearer ${bearer}` } : {}),
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  // Quittieren soll die Servicekraft können. Fehlt der Zugang, läuft der Rest
  // mit dem Admin weiter — dann prüft dieser Teil nur weniger, statt zu scheitern.
  const waiterToken = (await login(WAITER_EMAIL, WAITER_PASSWORD)) ?? token;
  if (waiterToken === token) {
    console.log(`Hinweis: kein Kellner-Zugang (${WAITER_EMAIL}) — quittiert wird als Admin.\n`);
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

  const created = { vouchers: [], tableId: null };
  const guestPoints = async () => (await req('GET', `/state?branch=${B}`)).json?.guest?.points ?? 0;
  const guestRedeemed = async () => (await req('GET', `/state?branch=${B}`)).json?.guest?.redeemed ?? [];

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
      await req('POST', `/branches/${B}/tables/${table.number}/review`, {
        dishRatings: [{ dishId: dish.id, stars: 5 }],
        overall: { service: 5, ambience: 5, speed: 5 },
      });
    }
    return await guestPoints() >= min;
  }

  try {
    // Zwei Einlösungen gehen wirklich durch (Quittieren und Wettlauf), der Rest
    // kommt zurück. Etwas Luft für den Fall, dass ein früherer Lauf abgebrochen ist.
    if (!await ensurePoints(4)) {
      console.error('Der Gast hat zu wenige Punkte und es ließen sich keine verdienen — Abbruch.');
      process.exit(1);
    }

    const vQuittung = await addVoucher('Quittung', 1);
    const vAbbruch = await addVoucher('Abbruch', 1);
    const vWettlauf = await addVoucher('Wettlauf', 1);
    const vTeuer = await addVoucher('Zu teuer', 100000);
    const vVerfall = await addVoucher('Verfall', 1);
    const vFremd = branch2 ? await addVoucher('Nur Filiale 2', 1, [branch2.id]) : null;

    // ── 1) Eröffnen ───────────────────────────────────────────────
    console.log('1) Der Gast eröffnet die Einlösung');
    let offen = null;
    {
      const pointsBefore = await guestPoints();
      // Ohne Anmeldung: der Gast hat kein Konto, sonst wäre der QR-Code am Tisch wertlos.
      const open = await req('POST', `/branches/${B}/vouchers/${vQuittung.id}/redeem`, {}, { auth: false });
      check('Eröffnen ohne Anmeldung liefert 200', open.status === 200,
        `HTTP ${open.status} — ${open.json?.error ?? ''}`);
      offen = open.json?.redemption ?? null;

      check('… mit vierstelligem Code', /^\d{4}$/.test(offen?.code ?? ''), `Code: ${offen?.code}`);
      check('… im Zustand "offen"', offen?.status === 'offen', `ist: ${offen?.status}`);
      check('… und einer Frist von rund 60 Sekunden',
        offen && offen.expiresAt - offen.createdAt === TTL_MS,
        `Frist: ${offen ? offen.expiresAt - offen.createdAt : '?'} ms`);

      check('Die Punkte sind sofort reserviert', await guestPoints() === pointsBefore - vQuittung.points,
        `${pointsBefore} → ${await guestPoints()}, erwartet ${pointsBefore - vQuittung.points}`);
      check('… und der Gutschein gilt als vergeben',
        (await guestRedeemed()).includes(vQuittung.id));

      const again = await req('POST', `/branches/${B}/vouchers/${vQuittung.id}/redeem`, {}, { auth: false });
      check('Zweites Eröffnen desselben Gutscheins wird mit 409 abgelehnt', again.status === 409,
        `HTTP ${again.status}`);

      // Die Servicekraft sieht den Eintrag in IHRER App — dort wird quittiert.
      const inBranch = (await req('GET', `/state?branch=${B}`, undefined, { as: waiterToken }))
        .json?.redemptions?.find(r => r.id === offen?.id);
      check('Die Servicekraft sieht die Einlösung in ihrer Filiale', !!inBranch);
      if (branch2) {
        const inOther = (await req('GET', `/state?branch=${branch2.slug}`))
          .json?.redemptions?.find(r => r.id === offen?.id);
        check('… und die andere Filiale sieht sie nicht', !inOther);
      }
    }

    // ── 2) Quittieren ─────────────────────────────────────────────
    console.log('\n2) Die Servicekraft quittiert in ihrer eigenen App');
    {
      const anon = await req('POST', `/branches/${B}/redemptions/${offen.id}/confirm`, undefined, { auth: false });
      check('Quittieren ohne Anmeldung wird mit 401 abgelehnt', anon.status === 401, `HTTP ${anon.status}`);

      if (branch2) {
        // Mit der Filialleitung der zweiten Filiale, wenn es sie gibt: dann greift
        // schon die Filialbindung (403). Sonst als Admin — der darf überall hin und
        // fällt erst über die Filiale IM Update-Filter (409).
        const foreign = await req('POST', `/branches/${branch2.slug}/redemptions/${offen.id}/confirm`,
          undefined, { as: manager2Token ?? token });
        check('Die andere Filiale kann sie nicht quittieren', foreign.status === 409 || foreign.status === 403,
          `HTTP ${foreign.status}`);
        const stillOpen = (await req('GET', `/state?branch=${B}`)).json?.redemptions?.find(r => r.id === offen.id);
        check('… und sie läuft danach unverändert weiter', stillOpen?.status === 'offen',
          `ist: ${stillOpen?.status}`);
      }

      const pointsBefore = await guestPoints();
      const ok = await req('POST', `/branches/${B}/redemptions/${offen.id}/confirm`, undefined, { as: waiterToken });
      check('Der Kellner quittiert mit 200', ok.status === 200, `HTTP ${ok.status} — ${ok.json?.error ?? ''}`);

      const done = ok.json?.redemptions?.find(r => r.id === offen.id);
      check('… der Eintrag steht danach auf "eingelöst"', done?.status === 'eingelöst', `ist: ${done?.status}`);
      check('… mit Zeitpunkt', typeof done?.redeemedAt === 'number');
      check('… und dem Namen der Servicekraft', typeof done?.confirmedByName === 'string' && done.confirmedByName.length > 0,
        `ist: ${done?.confirmedByName}`);

      const twice = await req('POST', `/branches/${B}/redemptions/${offen.id}/confirm`, undefined, { as: waiterToken });
      check('Zweites Quittieren wird mit 409 abgelehnt', twice.status === 409, `HTTP ${twice.status}`);
      check('Die Punkte bleiben verbraucht', await guestPoints() === pointsBefore,
        `${pointsBefore} → ${await guestPoints()}`);
    }

    // ── 3) Abbrechen ──────────────────────────────────────────────
    console.log('\n3) Der Gast bricht einen Fehltipp ab');
    {
      const pointsBefore = await guestPoints();
      const open = await req('POST', `/branches/${B}/vouchers/${vAbbruch.id}/redeem`, {}, { auth: false });
      const r = open.json?.redemption;
      check('Eröffnen liefert 200', open.status === 200, `HTTP ${open.status} — ${open.json?.error ?? ''}`);

      const falscherCode = r.code === '0000' ? '1111' : '0000';
      const wrong = await req('POST', `/branches/${B}/redemptions/${r.id}/cancel`, { code: falscherCode }, { auth: false });
      check('Abbrechen mit falschem Code wird mit 409 abgelehnt', wrong.status === 409, `HTTP ${wrong.status}`);
      const afterWrong = (await req('GET', `/state?branch=${B}`)).json?.redemptions?.find(x => x.id === r.id);
      check('… die Einlösung läuft weiter', afterWrong?.status === 'offen', `ist: ${afterWrong?.status}`);
      check('… und die Punkte bleiben reserviert', await guestPoints() === pointsBefore - vAbbruch.points);

      const cancel = await req('POST', `/branches/${B}/redemptions/${r.id}/cancel`, { code: r.code }, { auth: false });
      check('Abbrechen mit richtigem Code liefert 200', cancel.status === 200,
        `HTTP ${cancel.status} — ${cancel.json?.error ?? ''}`);
      check('… der Eintrag steht auf "abgebrochen"',
        cancel.json?.redemptions?.find(x => x.id === r.id)?.status === 'abgebrochen');
      check('… die Punkte sind zurück', await guestPoints() === pointsBefore,
        `${pointsBefore} → ${await guestPoints()}`);
      check('… und der Gutschein ist wieder frei', !(await guestRedeemed()).includes(vAbbruch.id));

      const twice = await req('POST', `/branches/${B}/redemptions/${r.id}/cancel`, { code: r.code }, { auth: false });
      check('Zweites Abbrechen wird mit 409 abgelehnt', twice.status === 409, `HTTP ${twice.status}`);
      check('… und bucht die Punkte nicht ein zweites Mal zurück', await guestPoints() === pointsBefore,
        `ist: ${await guestPoints()}, erwartet ${pointsBefore}`);
    }

    // ── 4) Gleichzeitigkeit ───────────────────────────────────────
    // Zwei Handys am selben Tisch, zwei Servicekräfte am selben Eintrag: der
    // Schutz liegt im Update-Filter, nicht in einer vorgelagerten Prüfung.
    console.log('\n4) Zwei gleichzeitige Anfragen');
    {
      const pointsBefore = await guestPoints();
      const [o1, o2] = await Promise.all([
        req('POST', `/branches/${B}/vouchers/${vWettlauf.id}/redeem`, {}, { auth: false }),
        req('POST', `/branches/${B}/vouchers/${vWettlauf.id}/redeem`, {}, { auth: false }),
      ]);
      const openCodes = [o1.status, o2.status].sort();
      check('Zwei gleichzeitige Eröffnungen: genau eine wird angenommen',
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
        check('Zwei gleichzeitige Quittungen: genau eine wird angenommen',
          codes[0] === 200 && codes[1] === 409, `Antworten: ${codes.join(' und ')}`);
      }
    }

    // ── 5) Was gar nicht erst eröffnet werden darf ────────────────
    console.log('\n5) Abgewiesene Eröffnungen');
    {
      const broke = await req('POST', `/branches/${B}/vouchers/${vTeuer.id}/redeem`, {}, { auth: false });
      check('Ohne Deckung wird mit 400 abgelehnt', broke.status === 400, `HTTP ${broke.status}`);
      check('… ohne einen Eintrag zu hinterlassen',
        !(await req('GET', `/state?branch=${B}`)).json?.redemptions
          ?.some(r => r.voucherId === vTeuer.id && r.status === 'offen'));

      if (vFremd) {
        const wrongBranch = await req('POST', `/branches/${B}/vouchers/${vFremd.id}/redeem`, {}, { auth: false });
        check('Ein Gutschein der anderen Filiale wird mit 400 abgelehnt', wrongBranch.status === 400,
          `HTTP ${wrongBranch.status}`);
      }

      const missing = await req('POST', `/branches/${B}/vouchers/000000000000000000000000/redeem`, {}, { auth: false });
      check('Unbekannter Gutschein wird mit 404 abgelehnt', missing.status === 404, `HTTP ${missing.status}`);

      const broken = await req('POST', `/branches/${B}/vouchers/keine-id/redeem`, {}, { auth: false });
      check('Kaputte Gutschein-ID wird mit 400 abgelehnt', broken.status === 400, `HTTP ${broken.status}`);

      const badTable = await req('POST', `/branches/${B}/vouchers/${vVerfall.id}/redeem`,
        { tableNumber: 0 }, { auth: false });
      check('Ungültige Tischnummer wird mit 400 abgelehnt', badTable.status === 400, `HTTP ${badTable.status}`);

      const badId = await req('POST', `/branches/${B}/redemptions/keine-id/confirm`, undefined, { as: waiterToken });
      check('Kaputte Einlösungs-ID beim Quittieren wird mit 400 abgelehnt', badId.status === 400,
        `HTTP ${badId.status}`);
    }

    // ── 6) Verfall ────────────────────────────────────────────────
    if (process.env.SKIP_EXPIRY) {
      console.log('\n6) Verfall — übersprungen (SKIP_EXPIRY gesetzt)');
    } else {
      console.log(`\n6) Verfall nach ${TTL_MS / 1000} Sekunden (Wartezeit — mit SKIP_EXPIRY=1 überspringbar)`);
      const pointsBefore = await guestPoints();
      const open = await req('POST', `/branches/${B}/vouchers/${vVerfall.id}/redeem`, {}, { auth: false });
      const r = open.json?.redemption;
      check('Eröffnen liefert 200', open.status === 200, `HTTP ${open.status} — ${open.json?.error ?? ''}`);

      await sleep(Math.max(0, r.expiresAt - Date.now()) + 1500);
      // Es gibt keinen Hintergrundjob: wer als Erster den Zustand lädt, räumt ab.
      const after = (await req('GET', `/state?branch=${B}`)).json?.redemptions?.find(x => x.id === r.id);
      check('Nach Ablauf steht der Eintrag auf "verfallen"', after?.status === 'verfallen',
        `ist: ${after?.status}`);
      check('… die Punkte sind zurück', await guestPoints() === pointsBefore,
        `${pointsBefore} → ${await guestPoints()}`);
      check('… der Gutschein ist wieder frei', !(await guestRedeemed()).includes(vVerfall.id));
      check('… und die Punkte kommen auch beim zweiten Laden nicht doppelt zurück',
        await guestPoints() === pointsBefore, `ist: ${await guestPoints()}`);

      const late = await req('POST', `/branches/${B}/redemptions/${r.id}/confirm`, undefined, { as: waiterToken });
      check('Ein abgelaufener Code lässt sich nicht mehr quittieren', late.status === 409, `HTTP ${late.status}`);
    }
  } finally {
    // ── Aufräumen ────────────────────────────────────────────────
    // Läuft auch nach einem Abbruch mitten im Test. Das Löschen eines
    // Gutscheins zieht ihn auch aus dem Gastprofil.
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
