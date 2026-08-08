import { MongoClient, type Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error(
    'MONGODB_URI fehlt. Kopiere server/.env.example zu server/.env und trage deinen Atlas Connection String ein.'
  );
}

const client = new MongoClient(uri);
let connectPromise: Promise<MongoClient> | null = null;

function getClient(): Promise<MongoClient> {
  if (!connectPromise) connectPromise = client.connect();
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

export async function orgDbBySlug(slug: string): Promise<Db> {
  const c = await getClient();
  return c.db(dbNameForOrg(slug));
}

export async function closeDb(): Promise<void> {
  await client.close();
}
