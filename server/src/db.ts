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
