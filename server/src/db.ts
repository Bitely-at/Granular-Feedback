import { MongoClient, ObjectId, type Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error(
    'MONGODB_URI fehlt. Kopiere server/.env.example zu server/.env und trage deinen Atlas Connection String ein.'
  );
}

const client = new MongoClient(uri);
let connectPromise: Promise<MongoClient> | null = null;

function getClient(): Promise<MongoClient> {
  if (!connectPromise) {
    // Ein fehlgeschlagener Verbindungsversuch darf NICHT dauerhaft zwischengespeichert
    // werden — sonst antwortet der Server für immer mit 500, auch wenn die Datenbank
    // längst wieder erreichbar ist, und ein manueller Neustart wäre nötig.
    connectPromise = client.connect().catch(err => {
      connectPromise = null;
      throw err;
    });
  }
  return connectPromise;
}

// Registry aller Organisationen (Mandanten) — eine Zeile pro Kunde.
const PLATFORM_DB = 'bitely_platform';

export async function platformDb(): Promise<Db> {
  const c = await getClient();
  return c.db(PLATFORM_DB);
}

// Jede Organisation bekommt ihre eigene Datenbank im selben Cluster.
// Das trennt die Daten der Kunden vollständig, ohne dass wir mehrere
// Verbindungen/Cluster verwalten müssen.
function dbNameForOrg(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `bitely_org_${safe}`;
}

// Pro Prozess einmal je Organisation: Indizes anlegen und Altbestand nachziehen.
const preparedOrgs = new Set<string>();

/**
 * Legt den eindeutigen Index an, der verhindert, dass dieselbe Bestellung
 * zweimal bewertet wird, und rüstet Tische ohne orderId nach.
 *
 * Der Index ist partiell (nur Dokumente MIT orderId), damit Bewertungen aus der
 * Zeit vor diesem Feld — die kein orderId tragen — ihn nicht verletzen.
 */
async function ensureOrgSchema(db: Db): Promise<void> {
  await db.collection('reviews').createIndex(
    { orderId: 1 },
    { unique: true, partialFilterExpression: { orderId: { $exists: true } }, name: 'uniq_orderId' }
  );

  // Tische, auf denen noch eine Bestellung liegt, haben nach einem Update aus
  // der Zeit davor keine orderId. Ohne sie wären sie nicht bewertbar.
  const legacy = await db.collection('tables')
    .find({ orderId: { $exists: false }, 'items.0': { $exists: true } })
    .project({ _id: 1 })
    .toArray();
  for (const { _id } of legacy) {
    await db.collection('tables').updateOne({ _id }, { $set: { orderId: new ObjectId() } });
  }

  // Tische ohne Bestellung bekommen explizit null, damit "keine offene
  // Bestellung" überall gleich aussieht.
  await db.collection('tables').updateMany(
    { orderId: { $exists: false } },
    { $set: { orderId: null } }
  );

  // Benutzer aus der Zeit vor dem Login (T-1) haben kein passwordHash-Feld.
  // null heißt: kein Passwort gesetzt, kann sich nicht anmelden — bis ein
  // Admin eines vergibt oder das Seed-Skript erneut läuft.
  await db.collection('users').updateMany(
    { passwordHash: { $exists: false } },
    { $set: { passwordHash: null } }
  );

  await renumberTablesPerBranch(db);
  await splitDishRatingsPerBranch(db);

  // Erst NACH der Umnummerierung: vorher trägt der Altbestand noch
  // organisationsweite Nummern, die den Index verletzen würden.
  await db.collection('tables').createIndex(
    { branchId: 1, number: 1 },
    { unique: true, name: 'uniq_branch_number' }
  );
}

/**
 * Tischnummern waren organisationsweit vergeben — Tisch 5 gab es genau einmal
 * pro Organisation. Sie gehören aber pro Filiale eindeutig, damit Tisch 5 in
 * Filiale A ein anderer Tisch ist als Tisch 5 in Filiale B (jede Filiale hat
 * ihre eigenen QR-Codes).
 *
 * Nummeriert je Filiale auf 1…n durch, in der bisherigen Reihenfolge. Läuft
 * idempotent: passt alles schon, wird nichts geschrieben.
 */
/**
 * Bewertungen am Gericht waren kettenweit aufsummiert (ratingsSum/ratingsCount).
 * Die Qualität unterscheidet sich aber je Filiale — deshalb wandern die Zähler
 * nach ratingsByBranch.
 *
 * Der Altbestand kann nicht rückwirkend aufgeteilt werden: vor der Trennung
 * stand nirgends, aus welcher Filiale eine Bewertung stammt. Er wird deshalb
 * der ältesten Filiale zugeschlagen — dort standen bis dahin alle Tische.
 */
export async function splitDishRatingsPerBranch(db: Db): Promise<void> {
  const legacy = await db.collection('dishes')
    .find({ ratingsByBranch: { $exists: false } })
    .toArray();
  if (legacy.length === 0) return;

  const firstBranch = await db.collection('branches').find().sort({ _id: 1 }).limit(1).next();
  const key = firstBranch ? String(firstBranch._id) : null;

  for (const dish of legacy) {
    const sum = Number(dish.ratingsSum ?? 0);
    const count = Number(dish.ratingsCount ?? 0);
    // Ohne Filiale (frische Organisation) oder ohne Bewertungen: leer starten.
    const byBranch = key && count > 0 ? { [key]: { sum, count } } : {};
    await db.collection('dishes').updateOne(
      { _id: dish._id },
      { $set: { ratingsByBranch: byBranch }, $unset: { ratingsSum: '', ratingsCount: '' } }
    );
  }
  console.log(`Gerichtsbewertungen auf Filialen aufgeteilt (${legacy.length} Gerichte).`);
}

export async function renumberTablesPerBranch(db: Db): Promise<void> {
  const tables = await db.collection('tables').find().sort({ number: 1 }).toArray();

  const perBranch = new Map<string, { _id: ObjectId; number: number }[]>();
  for (const t of tables) {
    const key = String(t.branchId);
    if (!perBranch.has(key)) perBranch.set(key, []);
    perBranch.get(key)!.push({ _id: t._id as ObjectId, number: t.number as number });
  }

  const changes: { _id: ObjectId; number: number }[] = [];
  for (const list of perBranch.values()) {
    list.forEach((t, i) => {
      if (t.number !== i + 1) changes.push({ _id: t._id, number: i + 1 });
    });
  }
  if (changes.length === 0) return;

  // Zwei Durchgänge über negative Zwischennummern: eine direkte Zuweisung
  // würde unterwegs Nummern doppelt vergeben und am eindeutigen Index
  // scheitern (Tisch 7 -> 5, solange 5 noch belegt ist).
  for (const [i, c] of changes.entries()) {
    await db.collection('tables').updateOne({ _id: c._id }, { $set: { number: -(i + 1) } });
  }
  for (const c of changes) {
    await db.collection('tables').updateOne({ _id: c._id }, { $set: { number: c.number } });
  }
  console.log(`Tischnummern pro Filiale vereinheitlicht (${changes.length} Tische umnummeriert).`);
}

export async function orgDbBySlug(slug: string): Promise<Db> {
  const c = await getClient();
  const db = c.db(dbNameForOrg(slug));
  if (!preparedOrgs.has(slug)) {
    await ensureOrgSchema(db);
    preparedOrgs.add(slug);
  }
  return db;
}

export async function closeDb(): Promise<void> {
  await client.close();
}

// ═══════════════════════════════════════════════════════════
// DIAGNOSE (für GET /health)
//
// Zeigt an, WELCHER Zugang tatsächlich verwendet wird und woran
// eine Verbindung scheitert — ohne das Passwort preiszugeben.
// ═══════════════════════════════════════════════════════════

/**
 * Benutzername + Host(s) aus der URI, Passwort maskiert.
 * Bewusst per Regex statt new URL(): die Mehr-Host-Form
 * (mongodb://user:pw@a:27017,b:27017,…) ist keine gültige URL.
 */
export function connectionSummary(): { user: string; host: string; scheme: string } {
  const match = /^(mongodb(?:\+srv)?):\/\/(?:([^:@/]+)(?::[^@/]*)?@)?([^/?]+)/.exec(uri!);
  if (!match) return { user: '(URI nicht lesbar)', host: '(unbekannt)', scheme: '(unbekannt)' };

  const [, scheme, rawUser, hosts] = match;
  let user = '(kein Benutzer in der URI)';
  if (rawUser) {
    try { user = decodeURIComponent(rawUser); } catch { user = rawUser; }
  }
  return { user, host: hosts, scheme };
}

/** Übersetzt einen Verbindungsfehler in einen konkreten nächsten Schritt. */
export function explainDbError(err: unknown): string {
  const e = err as { message?: string; code?: unknown; codeName?: string; name?: string };
  const message = e?.message ?? '';

  if (e?.code === 8000 || /bad auth|authentication failed/i.test(message)) {
    return 'Benutzername oder Passwort in MONGODB_URI stimmen nicht. Prüfe in Atlas unter "Database Access", ob dieser Benutzer existiert, und ob das Passwort passt (Sonderzeichen müssen URL-kodiert sein).';
  }
  if (/querySrv|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return 'Die Cluster-Adresse konnte per DNS nicht aufgelöst werden. Entweder ist der Hostname falsch geschrieben, oder DNS ist in dieser Umgebung blockiert — dann die Shard-Hosts direkt statt "mongodb+srv" verwenden.';
  }
  if (/MongoServerSelectionError|timed out|ECONNREFUSED/i.test(message) || e?.name === 'MongoServerSelectionError') {
    return 'Der Cluster war nicht erreichbar. Prüfe in Atlas unter "Network Access", ob 0.0.0.0/0 freigegeben ist, und ob der Cluster pausiert ist.';
  }
  return 'Unerwarteter Datenbankfehler — vollständige Meldung siehe Feld "error".';
}
