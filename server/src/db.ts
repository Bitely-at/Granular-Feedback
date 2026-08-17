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

  // Der Tisch kennt nur noch zwei Zustände. 'abgeschlossen' hieß "bewertet und
  // abgeräumt" — ein Tisch ohne Positionen, also dasselbe wie 'frei', nur mit
  // einer Beschriftung, die im Personalbildschirm stehen blieb, bis jemand ihn
  // ausdrücklich schloss.
  await db.collection('tables').updateMany(
    { status: 'abgeschlossen' },
    { $set: { status: 'frei', items: [], orderId: null, openedAt: null } }
  );

  await resolveTableNumberConflicts(db);
  await splitDishRatingsPerBranch(db);

  // Gerichte und Gutscheine aus der Zeit vor der Filial-Verfügbarkeit gelten
  // überall — null ist genau das und braucht keine Pflege.
  for (const name of ['dishes', 'vouchers']) {
    await db.collection(name).updateMany(
      { branchIds: { $exists: false } },
      { $set: { branchIds: null } }
    );
  }

  // Erst NACH dem Auflösen etwaiger Dubletten — sonst scheitert die Anlage.
  await db.collection('tables').createIndex(
    { branchId: 1, number: 1 },
    { unique: true, name: 'uniq_branch_number' }
  );

  // Einlösungen: die Kellner-App fragt laufend die offenen ihrer Filiale ab,
  // das Admin-Reporting die jüngsten.
  await db.collection('redemptions').createIndex(
    { branchId: 1, status: 1, expiresAt: 1 },
    { name: 'branch_status_expiry' }
  );
  await db.collection('redemptions').createIndex(
    { createdAt: -1 },
    { name: 'newest_first' }
  );
}

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

/**
 * Bereitet die Tischnummern auf den eindeutigen Index {branchId, number} vor.
 *
 * **Bestehende Nummern bleiben, wie sie sind.** Vorher waren sie
 * organisationsweit eindeutig — damit sind sie je Filiale erst recht eindeutig,
 * eine Umnummerierung ist für den Index also gar nicht nötig. Sie wäre sogar
 * schädlich: an den Tischen im Lokal klebt eine Nummer, und aus Tisch 25
 * kommentarlos Tisch 23 zu machen, lässt App und Wirklichkeit auseinanderlaufen.
 * Lücken (1–13, 16–25) sind unbedenklich und bleiben erhalten.
 *
 * Angefasst wird nur, was den Index tatsächlich verletzen würde: dieselbe
 * Nummer zweimal in derselben Filiale. Der jüngere Tisch bekommt dann die
 * nächste freie Nummer.
 */
export async function resolveTableNumberConflicts(db: Db): Promise<void> {
  const tables = await db.collection('tables').find().sort({ _id: 1 }).toArray();

  const perBranch = new Map<string, { _id: ObjectId; number: number }[]>();
  for (const t of tables) {
    const key = String(t.branchId);
    if (!perBranch.has(key)) perBranch.set(key, []);
    perBranch.get(key)!.push({ _id: t._id as ObjectId, number: t.number as number });
  }

  const changes: { _id: ObjectId; number: number }[] = [];
  for (const list of perBranch.values()) {
    const used = new Set(list.map(t => t.number));
    const seen = new Set<number>();
    for (const t of list) {
      if (!seen.has(t.number)) { seen.add(t.number); continue; }
      // Dublette: nächste freie Nummer dieser Filiale suchen.
      let free = 1;
      while (used.has(free)) free++;
      used.add(free);
      seen.add(free);
      changes.push({ _id: t._id, number: free });
    }
  }
  if (changes.length === 0) return;

  // Nur freie Nummern werden vergeben, also kann unterwegs keine Kollision
  // entstehen — ein Durchgang genügt.
  for (const c of changes) {
    await db.collection('tables').updateOne({ _id: c._id }, { $set: { number: c.number } });
  }
  console.log(`Doppelte Tischnummern aufgelöst (${changes.length} Tische).`);
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
