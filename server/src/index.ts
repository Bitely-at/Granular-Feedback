import 'dotenv/config';
import { randomInt } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ObjectId, type Db, type WithId, type Document } from 'mongodb';
import { platformDb, orgDbBySlug, connectionSummary, explainDbError } from './db.js';
import { verifyPassword, signToken, verifyToken, type TokenPayload } from './auth.js';
import type {
  Organization, BrandDoc, GuestProfileDoc, DishRatingInput, UserDoc, Branch, DishDoc, RedemptionDoc,
} from './types.js';

const app = express();
app.use(cors());
// Höheres Limit, da hochgeladene Bilder als komprimiertes Base64 im JSON-Body ankommen.
app.use(express.json({ limit: '8mb' }));

// ═══════════════════════════════════════════════════════════
// Mandanten-Middleware: löst :orgSlug auf die passende
// Organisations-Datenbank auf. Jede Route unter /api/:orgSlug/*
// bekommt req.org und req.db.
// ═══════════════════════════════════════════════════════════

interface OrgRequest extends Request {
  org?: Organization;
  db?: Db;
  user?: TokenPayload;
  branch?: WithId<Branch>;
}

async function resolveOrg(req: OrgRequest, res: Response, next: NextFunction) {
  try {
    const slug = req.params.orgSlug;
    const platform = await platformDb();
    const org = await platform.collection<Organization>('organizations').findOne({ slug });
    if (!org) {
      res.status(404).json({ error: `Organisation '${slug}' wurde nicht gefunden.` });
      return;
    }
    req.org = org;
    req.db = await orgDbBySlug(slug);
    next();
  } catch (err) {
    next(err);
  }
}

// Wie viele Rezensionen der Gesamtzustand mitliefert (neueste zuerst).
const REVIEW_PAGE_SIZE = 100;

// Wie lange eine eröffnete Einlösung gilt. Kurz genug, dass ein Screenshot
// nichts nützt, lang genug, dass die Servicekraft in Ruhe an den Tisch kommt.
const REDEMPTION_TTL_MS = 60_000;

// Wie viele vergangene Einlösungen das Admin-Reporting mitliefert.
const REDEMPTION_PAGE_SIZE = 100;

/**
 * Vierstelliger Code zum Abgleich mit bloßem Auge — die Servicekraft sieht
 * dieselbe Zahl in ihrer eigenen App und vergleicht.
 *
 * Er ist ausdrücklich KEIN Nachweis: quittiert wird in der Kellner-App, nicht
 * auf dem Display des Gastes. Deshalb genügen vier Stellen, und deshalb schadet
 * es auch nicht, wenn zwei Tische zufällig denselben Code haben.
 * randomInt statt Math.random, weil ein ratbarer Code hier nichts zu suchen hat.
 */
function redemptionCode(): string {
  return String(randomInt(1000, 10000));
}

function serialize<T extends WithId<Document>>(doc: T) {
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}

// Wie serialize(), aber ohne passwordHash — der darf niemals in einer
// Antwort landen. users taucht über getFullState() im GEMEINSAMEN
// Zustandsobjekt auf, das auch der Gast lädt (siehe GET /state).
function serializeUser(doc: WithId<UserDoc>) {
  const { _id, passwordHash: _passwordHash, ...rest } = doc;
  return { id: String(_id), ...rest };
}

/**
 * Rechnet die filialweise gespeicherten Bewertungen auf die eine Filiale
 * herunter, die gerade betrachtet wird — oder summiert sie über alle für den
 * Ketten-Blick des Admins (branchId === null).
 *
 * Nach außen heißt das weiterhin ratingsSum/ratingsCount: die Oberfläche
 * rechnet unverändert damit und bekommt automatisch die richtigen Zahlen.
 */
function serializeDish(doc: WithId<DishDoc>, branchId: string | null) {
  const { _id, ratingsByBranch, ...rest } = doc;
  const buckets = branchId ? [ratingsByBranch?.[branchId]] : Object.values(ratingsByBranch ?? {});
  let sum = 0;
  let count = 0;
  for (const b of buckets) {
    if (!b) continue;
    sum += b.sum;
    count += b.count;
  }
  return { id: String(_id), ...rest, ratingsSum: sum, ratingsCount: count };
}

type RouteHandler = (req: OrgRequest, res: Response, next: NextFunction) => unknown;

/**
 * Liest das Token aus dem Authorization-Header, sofern eines mitkam und es zu
 * DIESER Organisation gehört. Gibt null zurück, statt zu antworten — die
 * Aufrufer gehen unterschiedlich damit um (Gastrouten dürfen ohne).
 */
function readUser(req: OrgRequest): TokenPayload | null {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  return payload && payload.orgSlug === req.params.orgSlug ? payload : null;
}

/**
 * Erzwingt Anmeldung + Rolle serverseitig. Verpackt einen bestehenden
 * RouteHandler, statt eine eigene Express-Middleware-Kette zu sein — die
 * zentrale Promise-Fehlerbehandlung unten patcht router.METHOD auf genau
 * EINEN Handler pro Route, ein zweites Argument würde also verworfen.
 *
 * Das Token ist an :orgSlug gebunden (readUser) — eines aus Organisation A
 * kann Organisation B nicht ansprechen.
 */
function requireAuth(...roles: UserDoc['role'][]) {
  return (handler: RouteHandler): RouteHandler => (req, res, next) => {
    if (!req.headers.authorization) {
      res.status(401).json({ error: 'Anmeldung erforderlich.' });
      return;
    }
    const payload = readUser(req);
    if (!payload) {
      res.status(401).json({ error: 'Sitzung ungültig oder abgelaufen. Bitte erneut anmelden.' });
      return;
    }
    if (!roles.includes(payload.role)) {
      res.status(403).json({ error: 'Für diese Aktion fehlt die Berechtigung.' });
      return;
    }
    req.user = payload;
    return handler(req, res, next);
  };
}

/**
 * Löst :branchSlug auf die Filiale auf. Jede Route, die einen Tisch per NUMMER
 * anspricht, läuft darunter — die Nummer allein ist seit T-2 mehrdeutig
 * (Tisch 5 gibt es in jeder Filiale einmal).
 *
 * Setzt zugleich die Filialbindung der Servicekraft durch: wer in seinem Konto
 * eine feste Filiale hat, kommt über eine andere URL nicht in eine fremde.
 * Gastrouten haben kein req.user und sind davon nicht betroffen — dort steckt
 * die Filiale ohnehin im QR-Link.
 */
function withBranch(handler: RouteHandler): RouteHandler {
  return async (req, res, next) => {
    const branch = await req.db!.collection<Branch>('branches').findOne({ slug: req.params.branchSlug });
    if (!branch) {
      res.status(404).json({ error: `Filiale '${req.params.branchSlug}' wurde nicht gefunden.` });
      return;
    }
    if (req.user?.branchId && req.user.branchId !== String(branch._id)) {
      res.status(403).json({ error: 'Diese Filiale gehört nicht zu deinem Konto.' });
      return;
    }
    req.branch = branch;
    return handler(req, res, next);
  };
}

/** Tisch innerhalb der aufgelösten Filiale. Nie ohne withBranch verwenden. */
async function findTableInBranch(req: OrgRequest, number: number) {
  return req.db!.collection('tables').findOne({ branchId: String(req.branch!._id), number });
}

/**
 * Stellt sicher, dass jedes Gericht in DIESER Filiale geführt wird. Ohne diese
 * Prüfung ließe sich ein Gericht auf einen Tisch buchen, das die Filiale gar
 * nicht anbietet — der Gast bekäme es dann zum Bewerten vorgelegt.
 */
async function assertDishesAvailable(req: OrgRequest, dishIds: string[]): Promise<void> {
  const unique = [...new Set(dishIds)];
  if (unique.length === 0) return;
  const branchId = String(req.branch!._id);
  const found = await req.db!.collection('dishes').countDocuments({
    _id: { $in: unique.map(id => new ObjectId(id)) },
    $or: [{ branchIds: null }, { branchIds: branchId }],
  });
  if (found !== unique.length) {
    throw new HttpError(400, 'Mindestens ein Gericht wird in dieser Filiale nicht geführt.');
  }
}

/**
 * Auf welche Filiale die Antwort eingegrenzt wird. Steht eine Filiale im Pfad,
 * gilt sie; sonst entscheidet die Bindung des angemeldeten Kontos. null heißt
 * Ketten-Blick und kommt nur für Konten ohne feste Filiale zustande (Admin).
 *
 * Damit trägt JEDE Antwort automatisch die richtige Reichweite — auch die auf
 * eine schreibende Route, die ja den neuen Gesamtzustand zurückgibt.
 */
function scopeOf(req: OrgRequest): string | null {
  if (req.branch) return String(req.branch._id);
  return req.user?.branchId ?? null;
}

/**
 * Der Zustand, wie ihn genau dieser Aufrufer sehen darf. Jede schreibende Route
 * antwortet damit — so trägt die Antwort automatisch die richtige Reichweite,
 * ohne dass jede Route sie einzeln bestimmen muss.
 */
function stateFor(req: OrgRequest) {
  const managesMenu = req.user?.role === 'Admin' || req.user?.role === 'Manager';
  return getFullState(req.db!, scopeOf(req), managesMenu);
}

// ═══════════════════════════════════════════════════════════
// EINGABEPRÜFUNG
//
// Alles unter /api ist öffentlich erreichbar. Was von dort in die Datenbank
// wandert, muss geprüft sein — insbesondere Zahlen, die per $inc dauerhaft
// aufaddiert werden.
// ═══════════════════════════════════════════════════════════

/** Fehler mit HTTP-Status; wird vom zentralen Fehler-Handler beantwortet. */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function requireObjectId(value: unknown, field: string): ObjectId {
  if (typeof value !== 'string' || !ObjectId.isValid(value)) {
    throw new HttpError(400, `${field} ist ungültig.`);
  }
  return new ObjectId(value);
}

function requireTableNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 9999) {
    throw new HttpError(400, 'Tischnummer ist ungültig.');
  }
  return n;
}

/**
 * Sterne: ganze Zahl von 0 bis 5. Ohne diese Grenze verschiebt ein einziger
 * manipulierter Aufruf (`stars: 1000`) den Durchschnitt eines Gerichts
 * dauerhaft — rückgängig nur per Eingriff in die Datenbank.
 */
function requireStars(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 5) {
    throw new HttpError(400, 'Sterne müssen eine ganze Zahl von 0 bis 5 sein.');
  }
  return n;
}

function requireQty(value: unknown, fallback = 1): number {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new HttpError(400, 'Menge muss eine ganze Zahl von 1 bis 99 sein.');
  }
  return n;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${field} muss Text sein.`);
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} darf höchstens ${max} Zeichen lang sein.`);
  }
  return trimmed === '' ? undefined : trimmed;
}

function requireText(value: unknown, field: string, max: number): string {
  const text = optionalText(value, field, max);
  if (!text) throw new HttpError(400, `${field} darf nicht leer sein.`);
  return text;
}

function requirePrice(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000) {
    throw new HttpError(400, 'Preis muss zwischen 0 und 100000 liegen.');
  }
  return Math.round(n * 100) / 100;
}

function requirePoints(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100000) {
    throw new HttpError(400, 'Punkte müssen eine ganze Zahl von 0 bis 100000 sein.');
  }
  return n;
}

/**
 * Filial-Auswahl für Gerichte und Gutscheine. `null` (oder gar nichts) heißt
 * "gilt überall" — bewusst nicht dasselbe wie eine Liste mit allen Filialen:
 * so gilt eine neu angelegte Filiale automatisch mit, statt jedes Gericht
 * nachpflegen zu müssen.
 */
async function optionalBranchIds(db: Db, value: unknown): Promise<string[] | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) throw new HttpError(400, 'Filialen müssen als Liste übergeben werden.');
  if (value.length === 0) throw new HttpError(400, 'Mindestens eine Filiale muss ausgewählt sein.');
  const ids = value.map(v => String(requireObjectId(v, 'Filial-ID')));
  const known = await db.collection('branches')
    .find({ _id: { $in: ids.map(i => new ObjectId(i)) } }).toArray();
  if (known.length !== new Set(ids).size) {
    throw new HttpError(400, 'Mindestens eine der angegebenen Filialen existiert nicht.');
  }
  // Alle Filialen ausgewählt = überall gültig. Als null speichern, damit
  // später hinzukommende Filialen mitgelten.
  const total = await db.collection('branches').countDocuments();
  return new Set(ids).size === total ? null : [...new Set(ids)];
}

const DISH_CATEGORIES = ['Speisen', 'Getränke'] as const;

function requireCategory(value: unknown): 'Speisen' | 'Getränke' {
  if (value !== 'Speisen' && value !== 'Getränke') {
    throw new HttpError(400, `Kategorie muss ${DISH_CATEGORIES.join(' oder ')} sein.`);
  }
  return value;
}

/**
 * Bilder kommen entweder als hochgeladenes Base64 (data:) oder als Adresse
 * eines fremd gehosteten Fotos (https:) — die Seed-Daten nutzen Unsplash.
 * Alles andere (javascript:, file: …) wird abgewiesen, weil der Wert
 * ungeprüft in ein src-Attribut wandert.
 */
function optionalImage(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') throw new HttpError(400, 'Bild muss Text sein.');
  if (!/^data:image\//.test(value) && !/^https?:\/\//.test(value)) {
    throw new HttpError(400, 'Bild muss ein Upload oder eine http(s)-Adresse sein.');
  }
  return value;
}

// Platzhalter für Gerichte und Gutscheine ohne Foto: ein grauer Kasten. Damit
// bleibt jedes <img src> gültig, statt als kaputtes Bild zu erscheinen.
const IMAGE_PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' fill='%23e5e7eb'/%3E%3Ccircle cx='48' cy='48' r='18' fill='%23d1d5db'/%3E%3C/svg%3E";

/** Aus einem Namen eine URL-taugliche, in der Organisation eindeutige Kennung machen. */
async function uniqueBranchSlug(db: Db, name: string): Promise<string> {
  const base = name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'filiale';
  let slug = base;
  for (let i = 2; await db.collection('branches').countDocuments({ slug }) > 0; i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}

function sanitizeDishRatings(raw: unknown): DishRatingInput[] {
  if (!Array.isArray(raw)) throw new HttpError(400, 'dishRatings muss eine Liste sein.');
  if (raw.length > 100) throw new HttpError(400, 'Eine Bewertung darf höchstens 100 Gerichte umfassen.');
  return raw.map(entry => {
    const e = (entry ?? {}) as Record<string, unknown>;
    requireObjectId(e.dishId, 'dishId');
    return {
      dishId: String(e.dishId),
      stars: requireStars(e.stars),
      note: optionalText(e.note, 'Anmerkung', 500),
    };
  });
}

function sanitizeOverall(raw: unknown): { service: number; ambience: number; speed: number } {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    service: requireStars(o.service ?? 0),
    ambience: requireStars(o.ambience ?? 0),
    speed: requireStars(o.speed ?? 0),
  };
}

/**
 * Zustand EINER Organisation, eingegrenzt auf eine Filiale.
 *
 * `branchId === null` heißt Ketten-Blick (nur für den Admin): alle Filialen,
 * Gerichtsschnitte über alles summiert. Sonst sieht der Aufrufer ausschließlich
 * Tische, Bewertungen und Alarme SEINER Filiale — eine Servicekraft bekommt
 * fremde Filialdaten damit gar nicht erst ins Haus, statt sie nur auszublenden.
 *
 * Filialübergreifend bleiben: Branding (gehört der Marke), Gutscheine und
 * Punkte des Gasts (er sammelt in der ganzen Kette) sowie die Filialliste.
 */
/**
 * Räumt abgelaufene Einlösungen ab und schreibt die reservierten Punkte zurück.
 *
 * Läuft ohne Hintergrundjob: wer als Erster den Zustand lädt, räumt auf. Das
 * `status: 'offen'` in der Bedingung ist der Kern — es kann nur EINE Anfrage
 * gewinnen, und nur die schreibt die Punkte gut. Sonst bekäme der Gast bei zwei
 * gleichzeitigen Aufrufen seine Punkte doppelt zurück.
 */
async function expireStaleRedemptions(db: Db): Promise<void> {
  const now = Date.now();
  const stale = await db.collection<RedemptionDoc>('redemptions')
    .find({ status: 'offen', expiresAt: { $lte: now } })
    .toArray();

  for (const r of stale) {
    const claimed = await db.collection<RedemptionDoc>('redemptions').findOneAndUpdate(
      { _id: r._id, status: 'offen' },
      { $set: { status: 'verfallen' } }
    );
    // Null heißt: eine andere Anfrage war schneller und hat die Punkte bereits
    // zurückgeschrieben. Dann hier nichts tun.
    if (!claimed) continue;
    await db.collection<GuestProfileDoc>('guestProfile').updateOne(
      { _id: r.guestId },
      { $inc: { points: r.points }, $pull: { redeemed: r.voucherId } }
    );
  }
}

async function getFullState(db: Db, branchId: string | null, fullMenu = false) {
  const branchFilter = branchId ? { branchId } : {};
  // Was in DIESER Filiale geführt wird: entweder überall gültig (null) oder
  // ausdrücklich für sie freigegeben. Im Ketten-Blick kommt alles.
  //
  // fullMenu hebt das auf: wer die Verfügbarkeit verwaltet, muss auch die
  // Gerichte sehen, die seine Filiale gerade NICHT führt — sonst könnte er sie
  // nie wieder einschalten.
  const availableHere = branchId && !fullMenu
    ? { $or: [{ branchIds: null }, { branchIds: branchId }] }
    : {};

  // Vor dem Lesen aufräumen, damit niemand eine längst abgelaufene Einlösung
  // als "offen" angezeigt bekommt.
  await expireStaleRedemptions(db);

  const [brandDoc, branches, dishes, tables, vouchers, users, alerts, reviews, redemptions, guestDoc] = await Promise.all([
    db.collection<BrandDoc>('settings').findOne({ _id: 'brand' }),
    db.collection('branches').find().toArray(),
    db.collection('dishes').find(availableHere).toArray(),
    db.collection('tables').find(branchFilter).toArray(),
    db.collection('vouchers').find(availableHere).toArray(),
    db.collection('users').find().toArray(),
    db.collection('alerts').find(branchFilter).sort({ createdAt: -1 }).toArray(),
    // Begrenzt: der Gesamtzustand wird bei jedem Seitenaufruf geladen, und die
    // Rezensionen wachsen als einzige Collection unbegrenzt mit.
    db.collection('reviews').find(branchFilter).sort({ createdAt: -1 }).limit(REVIEW_PAGE_SIZE).toArray(),
    db.collection('redemptions').find(branchFilter).sort({ createdAt: -1 }).limit(REDEMPTION_PAGE_SIZE).toArray(),
    db.collection<GuestProfileDoc>('guestProfile').findOne({ _id: 'default' }),
  ]);

  const guest = guestDoc
    ? { points: guestDoc.points, redeemed: guestDoc.redeemed, loggedIn: !!guestDoc.loggedIn }
    : { points: 0, redeemed: [] as string[], loggedIn: false };

  return {
    brand: brandDoc ? {
      name: brandDoc.name, accent: brandDoc.accent, logo: brandDoc.logo,
      logoImage: brandDoc.logoImage ?? null, coverImage: brandDoc.coverImage ?? null,
      font: brandDoc.font ?? 'Inter', cardStyle: brandDoc.cardStyle ?? 'standard',
    } : null,
    branches: branches.map(serialize),
    dishes: (dishes as WithId<DishDoc>[]).map(d => serializeDish(d, branchId)),
    tables: tables.map(serialize),
    vouchers: vouchers.map(serialize),
    users: (users as WithId<UserDoc>[]).map(serializeUser),
    alerts: alerts.map(serialize),
    reviews: reviews.map(serialize),
    redemptions: redemptions.map(serialize),
    guest,
  };
}

// ── Health-Check: sagt im Klartext, ob die Datenbank steht ──
// Bewusst ohne Mandanten-Kontext, damit er auch dann antwortet,
// wenn noch keine Organisation angelegt ist.
app.get('/health', async (_req, res) => {
  const connection = connectionSummary();
  try {
    const db = await platformDb();
    await db.command({ ping: 1 });
    const orgs = await db.collection('organizations').find().toArray();
    res.json({
      ok: true,
      database: 'verbunden',
      connection,
      organizations: orgs.map(o => o.slug),
      hint: orgs.length === 0
        ? 'Verbindung steht, aber es ist noch keine Organisation angelegt. Führe "npm run seed --prefix server" gegen diese Datenbank aus.'
        : 'Alles bereit.',
    });
  } catch (err) {
    const e = err as { message?: string; code?: unknown; codeName?: string };
    res.status(503).json({
      ok: false,
      database: 'nicht verbunden',
      connection,
      error: e?.message ?? String(err),
      code: e?.code ?? null,
      codeName: e?.codeName ?? null,
      hint: explainDbError(err),
    });
  }
});

const router = express.Router({ mergeParams: true });

// Express 4 leitet abgelehnte Promises aus async-Handlern NICHT an den
// Fehler-Handler weiter: die Anfrage bliebe ohne Antwort hängen und das Handy
// wartet endlos. Statt jede Route einzeln zu umschließen, wird das hier einmal
// zentral nachgerüstet — gilt damit auch für später hinzukommende Routen.
for (const method of ['get', 'post', 'patch', 'delete'] as const) {
  const original = router[method].bind(router) as (path: string, handler: unknown) => unknown;
  (router as unknown as Record<string, unknown>)[method] = (path: string, handler: RouteHandler) =>
    original(path, (req: Request, res: Response, next: NextFunction) =>
      Promise.resolve(handler(req as OrgRequest, res, next)).catch(next)
    );
}

app.use('/api/:orgSlug', resolveOrg, router);

// ── Anmeldung: Admin, Manager, Kellner (Servicekraft) ──
// Der Gast hat bewusst kein echtes Konto hier (siehe POST /guest/login) —
// das Login-Gate für Gäste ist Teil eines eigenen Tickets.
router.post('/auth/login', async (req: OrgRequest, res) => {
  const email = optionalText(req.body?.email, 'E-Mail', 200)?.toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich.' });
    return;
  }
  const user = await req.db!.collection<UserDoc>('users').findOne({ email });
  if (!user || user.status !== 'aktiv' || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'E-Mail oder Passwort ist falsch.' });
    return;
  }
  const token = signToken({
    sub: String(user._id), orgSlug: req.params.orgSlug!, role: user.role, branchId: user.branchId,
  });
  res.json({ token, user: serializeUser(user) });
});

// ── Anmeldung prüfen (z. B. nach Seiten-Reload, bevor der gespeicherte Token verworfen wird) ──
router.get('/auth/me', async (req: OrgRequest, res) => {
  const payload = readUser(req);
  if (!payload) {
    res.status(401).json({ error: 'Sitzung ungültig oder abgelaufen.' });
    return;
  }
  const user = await req.db!.collection<UserDoc>('users').findOne({ _id: requireObjectId(payload.sub, 'Benutzer-ID') });
  if (!user || user.status !== 'aktiv') {
    res.status(401).json({ error: 'Dieses Konto ist nicht mehr aktiv.' });
    return;
  }
  res.json({ user: serializeUser(user) });
});

/**
 * ── Zustand einer Filiale (ein Aufruf pro Seitenladung) ──
 *
 *   /state?branch=<slug>   Daten dieser Filiale
 *   /state?branch=all      alle Filialen — nur für Konten OHNE feste Filiale
 *
 * Ohne Angabe entscheidet die Bindung des Kontos. Ein anonymer Aufruf (der
 * Gast am QR-Code) MUSS eine Filiale nennen: gäbe es hier einen stillen
 * Rückfall auf "alles", wäre die Filialtrennung mit einem weggelassenen
 * Parameter ausgehebelt.
 */
router.get('/state', async (req: OrgRequest, res) => {
  const wanted = typeof req.query.branch === 'string' ? req.query.branch : null;
  const user = readUser(req);
  // stateFor liest die Rolle aus req.user; auf dieser Route ist sie optional.
  req.user = user ?? undefined;

  if (wanted === 'all') {
    if (!user) {
      res.status(401).json({ error: 'Für den Blick über alle Filialen ist eine Anmeldung nötig.' });
      return;
    }
    if (user.branchId) {
      res.status(403).json({ error: 'Dein Konto ist an eine Filiale gebunden.' });
      return;
    }
    res.json(await stateFor(req));
    return;
  }

  if (wanted) {
    const branch = await req.db!.collection<Branch>('branches').findOne({ slug: wanted });
    if (!branch) {
      res.status(404).json({ error: `Filiale '${wanted}' wurde nicht gefunden.` });
      return;
    }
    if (user?.branchId && user.branchId !== String(branch._id)) {
      res.status(403).json({ error: 'Diese Filiale gehört nicht zu deinem Konto.' });
      return;
    }
    req.branch = branch;
    res.json(await stateFor(req));
    return;
  }

  if (!user) {
    res.status(400).json({ error: 'Es muss eine Filiale angegeben werden (?branch=<slug>).' });
    return;
  }
  res.json(await stateFor(req));
});

// ── Tisch per Nummer holen (für QR-Route /:orgSlug/:branchSlug/table/:number) ──
router.get('/branches/:branchSlug/tables/:number', withBranch(async (req: OrgRequest, res) => {
  const table = await findTableInBranch(req, requireTableNumber(req.params.number));
  if (!table) {
    res.status(404).json({ error: `Tisch ${req.params.number} gibt es in dieser Filiale nicht.` });
    return;
  }
  res.json(serialize(table));
}));

// ═══════════════════════════════════════════════════════════
// WER DARF WAS
//
// Admin   — die ganze Kette: Filialen, Branding, Stammkarte, Benutzer.
// Manager — Filialleitung: alles rund um SEINE Filiale, nichts kettenweites.
//           Die Filialbindung erzwingt withBranch bzw. scopeOf; hier steht nur,
//           welche Art von Aktion die Rolle überhaupt ausführen darf.
// Kellner — nur die Tischarbeit in seiner Filiale.
// ═══════════════════════════════════════════════════════════

/** Kettenweite Verwaltung: Filialen, Branding, Stammkarte, Gutscheine, Benutzer. */
const chainAdmin = requireAuth('Admin');
/** Filialverwaltung: Tische, QR-Codes, Verfügbarkeiten der eigenen Filiale. */
const branchAdmin = requireAuth('Admin', 'Manager');
/** Tischarbeit. */
const staffOrAdmin = requireAuth('Admin', 'Manager', 'Kellner');

// ── Tische anlegen (und damit QR-Codes) — Filialleitung genügt ──
// Liegt unter der Filiale, damit withBranch die Bindung des Managers
// durchsetzt: er kann keine Tische in einer fremden Filiale anlegen.
router.post('/branches/:branchSlug/tables', branchAdmin(withBranch(async (req: OrgRequest, res) => {
  const db = req.db!;
  const branchId = String(req.branch!._id);
  const count = Math.max(1, Math.min(50, Number(req.body?.count) || 1));
  // Innerhalb DIESER Filiale weiterzählen: Nummern sind pro Filiale eindeutig,
  // jede Filiale fängt bei 1 an.
  const existing = await db.collection('tables')
    .find({ branchId }).sort({ number: -1 }).limit(1).toArray();
  const nextNumber = (existing[0]?.number ?? 0) + 1;
  await db.collection('tables').insertMany(
    Array.from({ length: count }, (_, i) => ({
      branchId, number: nextNumber + i,
      status: 'frei' as const, items: [], openedAt: null, orderId: null,
    }))
  );
  res.json(await stateFor(req));
})));

// ── Tisch (und damit seinen QR-Code) wieder entfernen ──
router.delete('/branches/:branchSlug/tables/:id', branchAdmin(withBranch(async (req: OrgRequest, res) => {
  // An die Filiale gebunden mitlöschen: sonst könnte eine Filialleitung über
  // eine fremde Tisch-ID doch einen Tisch anderswo entfernen.
  const result = await req.db!.collection('tables').deleteOne({
    _id: requireObjectId(req.params.id, 'Tisch-ID'),
    branchId: String(req.branch!._id),
  });
  if (result.deletedCount === 0) {
    res.status(404).json({ error: 'Tisch wurde in dieser Filiale nicht gefunden.' });
    return;
  }
  res.json(await stateFor(req));
})));

// ── Kellner: Bestellung für einen Tisch speichern ──
router.post('/branches/:branchSlug/tables/:number/order', staffOrAdmin(withBranch(async (req: OrgRequest, res, next) => {
  try {
    const number = requireTableNumber(req.params.number);
    const cartRaw = (req.body?.cart ?? {}) as Record<string, unknown>;
    const cart: Record<string, number> = {};
    for (const [dishId, qty] of Object.entries(cartRaw)) {
      requireObjectId(dishId, 'dishId');
      cart[dishId] = requireQty(qty);
    }
    const table = await findTableInBranch(req, number);
    if (!table) {
      res.status(404).json({ error: `Tisch ${number} gibt es in dieser Filiale nicht.` });
      return;
    }
    await assertDishesAvailable(req, Object.keys(cart));
    const items = [...(table.items as { dishId: string; qty: number }[])];
    for (const [dishId, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const existing = items.find(i => i.dishId === dishId);
      if (existing) existing.qty += qty; else items.push({ dishId, qty });
    }
    await req.db!.collection('tables').updateOne(
      { _id: table._id },
      {
        $set: {
          items,
          status: 'offen',
          openedAt: table.openedAt ?? Date.now(),
          // Erste Buchung auf einen leeren Tisch eröffnet eine neue Bestellung.
          orderId: table.orderId ?? new ObjectId(),
        },
      }
    );
    res.json(await stateFor(req));
  } catch (err) {
    next(err);
  }
})));

// ── Kellner: Tisch schließen und wieder freigeben ──
// Gegenstück zum Buchen: räumt die laufende Bestellung ab und stellt den Tisch
// auf 'frei'. Bewusst idempotent — ein zweiter Aufruf ist kein Fehler.
router.post('/branches/:branchSlug/tables/:number/close', staffOrAdmin(withBranch(async (req: OrgRequest, res, next) => {
  try {
    const number = requireTableNumber(req.params.number);
    const table = await findTableInBranch(req, number);
    if (!table) {
      res.status(404).json({ error: `Tisch ${number} gibt es in dieser Filiale nicht.` });
      return;
    }
    await req.db!.collection('tables').updateOne(
      { _id: table._id },
      { $set: { status: 'frei', items: [], orderId: null, openedAt: null } }
    );
    res.json(await stateFor(req));
  } catch (err) {
    next(err);
  }
})));

// ── Gast: einzelnes Gericht nachträglich zum Tisch hinzufügen ("Etwas vergessen?") ──
router.post('/branches/:branchSlug/tables/:number/items', withBranch(async (req: OrgRequest, res, next) => {
  try {
    const number = requireTableNumber(req.params.number);
    requireObjectId(req.body?.dishId, 'dishId');
    const dishId = String(req.body.dishId);
    const qty = requireQty(req.body?.qty);
    const table = await findTableInBranch(req, number);
    if (!table) {
      res.status(404).json({ error: `Tisch ${number} gibt es in dieser Filiale nicht.` });
      return;
    }
    await assertDishesAvailable(req, [dishId]);
    const items = [...(table.items as { dishId: string; qty: number }[])];
    const existing = items.find(i => i.dishId === dishId);
    if (existing) existing.qty += qty; else items.push({ dishId, qty });
    await req.db!.collection('tables').updateOne(
      { _id: table._id },
      {
        $set: {
          items,
          // Ein Nachtrag macht den Tisch in jedem Fall wieder aktiv — auch wenn
          // er zuvor bewertet war; dann eröffnet er eine neue Bestellung.
          status: 'offen',
          openedAt: table.openedAt ?? Date.now(),
          orderId: table.orderId ?? new ObjectId(),
        },
      }
    );
    res.json(await stateFor(req));
  } catch (err) {
    next(err);
  }
}));

// ── Gast: Bewertung für einen Tisch abschicken ──
router.post('/branches/:branchSlug/tables/:number/review', withBranch(async (req: OrgRequest, res, next) => {
  try {
    const number = requireTableNumber(req.params.number);
    const dishRatings = sanitizeDishRatings(req.body?.dishRatings ?? []);
    const overall = sanitizeOverall(req.body?.overall);
    const db = req.db!;

    const table = await findTableInBranch(req, number);
    if (!table) {
      res.status(404).json({ error: `Tisch ${number} gibt es in dieser Filiale nicht.` });
      return;
    }

    // Ohne offene Bestellung gibt es nichts zu bewerten. Fängt den Normalfall ab:
    // Seite neu geladen oder erneut über den QR-Code geöffnet.
    const orderId = table.orderId as ObjectId | null | undefined;
    if (!orderId || (table.items as unknown[]).length === 0) {
      res.status(409).json({ error: 'Für diesen Tisch liegt aktuell keine offene Bestellung vor.' });
      return;
    }

    // Die Bewertung wird ZUERST geschrieben. Der eindeutige Index auf orderId ist
    // die eigentliche Absicherung — er trägt auch den Fall zweier gleichzeitiger
    // Anfragen, den eine vorgelagerte Prüfung nicht abfangen kann. Erst wenn dieser
    // Schreibvorgang durch ist, folgen die Nebenwirkungen (Sterne, Alarme, Punkte);
    // andernfalls würde eine abgelehnte Doppelabgabe die Statistik verfälschen.
    try {
      await db.collection('reviews').insertOne({
        orderId,
        branchId: table.branchId, tableId: String(table._id), tableNumber: number,
        dishRatings, overall, createdAt: Date.now(),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        res.status(409).json({ error: 'Diese Bestellung wurde bereits bewertet.' });
        return;
      }
      throw err;
    }

    const ratedCount = dishRatings.filter(d => d.stars > 0).length;
    const pointsEarned = ratedCount * 20 + 30;

    // Sterne zählen auf das Konto DIESER Filiale: die Küche der einen sagt
    // nichts über die der anderen. Der Ketten-Schnitt entsteht daraus durch
    // Summieren (serializeDish), nicht durch einen zweiten Zähler.
    const branchKey = String(table.branchId);
    for (const r of dishRatings) {
      if (r.stars <= 0) continue;
      await db.collection('dishes').updateOne(
        { _id: new ObjectId(r.dishId) },
        {
          $inc: {
            [`ratingsByBranch.${branchKey}.sum`]: r.stars,
            [`ratingsByBranch.${branchKey}.count`]: 1,
          },
        }
      );
    }

    const lowRated = dishRatings.filter(d => d.stars > 0 && d.stars < 3);
    if (lowRated.length > 0) {
      const dishDocs = await db.collection('dishes').find({}).toArray();
      const nameOf = (id: string) => dishDocs.find(d => String(d._id) === id)?.name ?? 'Gericht';
      await db.collection('alerts').insertMany(
        lowRated.map(d => ({
          branchId: table.branchId, tableId: String(table._id), tableNumber: number,
          dishName: nameOf(d.dishId), stars: d.stars, note: d.note,
          createdAt: Date.now(), resolved: false,
        }))
      );
    }

    await db.collection<GuestProfileDoc>('guestProfile').updateOne(
      { _id: 'default' },
      { $inc: { points: pointsEarned } },
      { upsert: true }
    );

    // Bestellung abräumen: der Tisch gilt als bewertet, ein erneuter Aufruf des
    // QR-Links zeigt den Leerzustand statt derselben Gerichte.
    await db.collection('tables').updateOne(
      { _id: table._id },
      { $set: { status: 'abgeschlossen', items: [], orderId: null } }
    );

    const state = await stateFor(req);
    res.json({ ...state, pointsEarned });
  } catch (err) {
    next(err);
  }
}));

// ═══════════════════════════════════════════════════════════
// GUTSCHEIN-EINLÖSUNG
//
// Der Gast eröffnet, die Servicekraft quittiert — in IHRER App, nicht auf dem
// Display des Gastes. Ein Screenshot ist damit wertlos: er erzeugt keinen
// Eintrag beim Personal. Der Code dient nur dem Abgleich mit bloßem Auge.
//
// Die Punkte sind ab dem Eröffnen reserviert (abgebucht) und kommen bei
// Verfall oder Abbruch zurück — siehe expireStaleRedemptions.
// ═══════════════════════════════════════════════════════════

/** Gast: Einlösung eröffnen. Liegt unter der Filiale, denn dort wird eingelöst. */
router.post('/branches/:branchSlug/vouchers/:id/redeem', withBranch(async (req: OrgRequest, res) => {
  const db = req.db!;
  const branchId = String(req.branch!._id);
  const voucherId = requireObjectId(req.params.id, 'Gutschein-ID');

  const voucher = await db.collection('vouchers').findOne({ _id: voucherId });
  if (!voucher) {
    res.status(404).json({ error: 'Gutschein wurde nicht gefunden.' });
    return;
  }
  if (voucher.branchIds != null && !(voucher.branchIds as string[]).includes(branchId)) {
    res.status(400).json({ error: `Dieser Gutschein gilt nicht in der Filiale ${req.branch!.name}.` });
    return;
  }

  // Abgelaufenes erst abräumen — sonst blockiert ein verwaister Versuch.
  await expireStaleRedemptions(db);

  const guestId = 'default';
  const guest = await db.collection<GuestProfileDoc>('guestProfile').findOne({ _id: guestId });
  if ((guest?.redeemed ?? []).includes(String(voucherId))) {
    res.status(409).json({ error: 'Dieser Gutschein wurde bereits eingelöst.' });
    return;
  }

  // Zwei offene Einlösungen desselben Gutscheins wären für die Servicekraft
  // nicht auseinanderzuhalten.
  const running = await db.collection<RedemptionDoc>('redemptions')
    .findOne({ voucherId: String(voucherId), guestId, status: 'offen' });
  if (running) {
    res.status(409).json({ error: 'Für diesen Gutschein läuft bereits eine Einlösung.' });
    return;
  }

  // Optionaler Tisch: nur fürs Reporting ("wo wurde eingelöst").
  let table: { _id: unknown; number: number } | null = null;
  if (req.body?.tableNumber != null) {
    const found = await findTableInBranch(req, requireTableNumber(req.body.tableNumber));
    if (found) table = found as { _id: unknown; number: number };
  }

  // Punkte reservieren: die Bedingung `points >= Preis` steckt IM Update, damit
  // zwei gleichzeitige Einlösungen nicht denselben Punktestand ausgeben. Alle
  // Gäste teilen sich (noch) ein Profil — der Fall ist real, nicht theoretisch.
  const reserved = await db.collection<GuestProfileDoc>('guestProfile').updateOne(
    { _id: guestId, points: { $gte: voucher.points } },
    { $inc: { points: -voucher.points }, $push: { redeemed: String(voucherId) } }
  );
  if (reserved.modifiedCount === 0) {
    res.status(400).json({ error: 'Nicht genug Punkte für diesen Gutschein.' });
    return;
  }

  const now = Date.now();
  const doc: Omit<RedemptionDoc, '_id'> = {
    voucherId: String(voucherId),
    voucherTitle: String(voucher.title),
    branchId,
    tableId: table ? String(table._id) : null,
    tableNumber: table ? table.number : null,
    guestId,
    code: redemptionCode(),
    points: Number(voucher.points),
    status: 'offen',
    createdAt: now,
    expiresAt: now + REDEMPTION_TTL_MS,
    redeemedAt: null,
    confirmedBy: null,
    confirmedByName: null,
  };
  const inserted = await db.collection<RedemptionDoc>('redemptions').insertOne(doc as RedemptionDoc);

  const state = await stateFor(req);
  res.json({ ...state, redemption: { id: String(inserted.insertedId), ...doc } });
}));

/**
 * Servicekraft: Einlösung quittieren.
 *
 * Die Einmaligkeit steckt in der Bedingung des Updates, nicht in einer
 * vorgelagerten Prüfung: nur eine von zwei gleichzeitigen Quittungen findet den
 * Datensatz noch mit status 'offen'. Ein abgelaufener Code fällt durch dieselbe
 * Bedingung — deshalb nützt ein Screenshot nichts.
 */
router.post('/branches/:branchSlug/redemptions/:id/confirm',
  staffOrAdmin(withBranch(async (req: OrgRequest, res) => {
    const db = req.db!;
    const now = Date.now();
    // Namen vorher holen: im Token steht nur die ID, und der Datensatz soll
    // nach dem Quittieren sofort vollständig sein.
    const staff = await db.collection<UserDoc>('users')
      .findOne({ _id: requireObjectId(req.user!.sub, 'Benutzer-ID') });

    const claimed = await db.collection<RedemptionDoc>('redemptions').findOneAndUpdate(
      {
        _id: requireObjectId(req.params.id, 'Einlösungs-ID'),
        branchId: String(req.branch!._id),
        status: 'offen',
        expiresAt: { $gt: now },
      },
      {
        $set: {
          status: 'eingelöst',
          redeemedAt: now,
          confirmedBy: req.user!.sub,
          confirmedByName: staff?.name ?? null,
        },
      }
    );

    if (!claimed) {
      res.status(409).json({
        error: 'Diese Einlösung ist abgelaufen oder wurde bereits quittiert.',
      });
      return;
    }
    res.json(await stateFor(req));
  }))
);

/**
 * Gast: eine laufende Einlösung abbrechen (Fehltipp). Der Code muss mit —
 * die ID allein könnte man raten und damit fremde Einlösungen abräumen.
 */
router.post('/branches/:branchSlug/redemptions/:id/cancel', withBranch(async (req: OrgRequest, res) => {
  const db = req.db!;
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const claimed = await db.collection<RedemptionDoc>('redemptions').findOneAndUpdate(
    {
      _id: requireObjectId(req.params.id, 'Einlösungs-ID'),
      branchId: String(req.branch!._id),
      code,
      status: 'offen',
    },
    { $set: { status: 'abgebrochen' } }
  );

  if (!claimed) {
    res.status(409).json({ error: 'Diese Einlösung läuft nicht mehr.' });
    return;
  }
  // Nur wer den Datensatz tatsächlich umgestellt hat, bucht zurück.
  await db.collection<GuestProfileDoc>('guestProfile').updateOne(
    { _id: claimed.guestId },
    { $inc: { points: claimed.points }, $pull: { redeemed: claimed.voucherId } }
  );
  res.json(await stateFor(req));
}));

// ── Gast: Demo-Login (kein echtes Auth-System — bewusst nicht Teil des Produkts) ──
router.post('/guest/login', async (req: OrgRequest, res) => {
  await req.db!.collection<GuestProfileDoc>('guestProfile').updateOne(
    { _id: 'default' }, { $set: { loggedIn: true } }, { upsert: true }
  );
  res.json(await stateFor(req));
});

// ── Kellner: Alarm-Banner (Bewertung < 3 Sterne) als erledigt markieren ──
router.post('/alerts/:id/resolve', staffOrAdmin(async (req: OrgRequest, res) => {
  await req.db!.collection('alerts').updateOne(
    { _id: requireObjectId(req.params.id, 'Alarm-ID') },
    { $set: { resolved: true } }
  );
  res.json(await stateFor(req));
}));

// ── Benutzer verwalten ──
//
// Der Admin verwaltet die ganze Kette. Die Filialleitung darf nur Kellner und
// nur in der eigenen Filiale anlegen — ohne das müsste sie bei jedem neuen
// Mitarbeiter den Ketten-Admin anrufen, und Personalwechsel ist in der Gastro
// der häufigste Vorgang überhaupt.
//
// Eingeladene Benutzer haben noch kein Passwort und können sich deshalb nicht
// anmelden. Das Setzen des Passworts ist noch nicht gebaut; bis dahin vergibt
// es das Seed-Skript.
router.post('/users', branchAdmin(async (req: OrgRequest, res) => {
  const actor = req.user!;
  const email = requireText(req.body?.email, 'E-Mail', 200).toLowerCase();
  const role = req.body?.role;
  if (role !== 'Admin' && role !== 'Manager' && role !== 'Kellner') {
    throw new HttpError(400, 'Rolle muss Admin, Manager oder Kellner sein.');
  }

  // Eine Filialleitung darf niemanden anlegen, der mehr darf als sie selbst —
  // sonst wäre die Rollentrennung mit einer einzigen Einladung ausgehebelt.
  const isChainAdmin = actor.role === 'Admin';
  if (!isChainAdmin && role !== 'Kellner') {
    res.status(403).json({ error: 'Als Filialleitung kannst du nur Servicekräfte anlegen.' });
    return;
  }

  let branchId: string | null;
  if (isChainAdmin) {
    branchId = req.body?.branchId ? String(requireObjectId(req.body.branchId, 'Filial-ID')) : null;
  } else {
    // Die eigene Filiale, unabhängig davon, was im Body steht.
    branchId = actor.branchId;
  }

  if (await req.db!.collection('users').countDocuments({ email }) > 0) {
    res.status(409).json({ error: 'Für diese E-Mail existiert bereits ein Benutzer.' });
    return;
  }
  await req.db!.collection<UserDoc>('users').insertOne({
    name: requireText(req.body?.name, 'Name', 120),
    email,
    passwordHash: null,
    role,
    branchId,
    status: 'eingeladen',
  });
  res.json(await stateFor(req));
}));

router.delete('/users/:id', branchAdmin(async (req: OrgRequest, res) => {
  const actor = req.user!;
  const id = requireObjectId(req.params.id, 'Benutzer-ID');
  // Sich selbst zu löschen würde den Zugang sofort verlieren; und der letzte
  // Admin muss stehen bleiben, sonst kommt niemand mehr in die Verwaltung.
  if (String(id) === actor.sub) {
    res.status(400).json({ error: 'Das eigene Konto kann nicht gelöscht werden.' });
    return;
  }
  const target = await req.db!.collection<UserDoc>('users').findOne({ _id: id });
  if (!target) {
    res.status(404).json({ error: 'Benutzer wurde nicht gefunden.' });
    return;
  }
  if (actor.role !== 'Admin') {
    // Filialleitung: nur eigene Kellner.
    if (target.role !== 'Kellner' || target.branchId !== actor.branchId) {
      res.status(403).json({ error: 'Du kannst nur Servicekräfte deiner eigenen Filiale entfernen.' });
      return;
    }
  }
  if (target.role === 'Admin') {
    const admins = await req.db!.collection('users').countDocuments({ role: 'Admin' });
    if (admins <= 1) {
      res.status(400).json({ error: 'Der letzte Admin kann nicht gelöscht werden.' });
      return;
    }
  }
  await req.db!.collection('users').deleteOne({ _id: id });
  res.json(await stateFor(req));
}));

// ── Admin: Branding-Einstellungen (inkl. Design-Studio: Logo, Schrift, Karten-Layout) ──
router.patch('/settings/brand', chainAdmin(async (req: OrgRequest, res) => {
  const { name, accent, logo, logoImage, coverImage, font, cardStyle } = req.body ?? {};
  const update: Partial<BrandDoc> = {};
  if (name !== undefined) update.name = name;
  if (accent !== undefined) update.accent = accent;
  if (logo !== undefined) update.logo = logo;
  if (logoImage !== undefined) update.logoImage = logoImage;
  if (coverImage !== undefined) update.coverImage = coverImage;
  if (font !== undefined) update.font = font;
  if (cardStyle !== undefined) update.cardStyle = cardStyle;
  await req.db!.collection<BrandDoc>('settings').updateOne({ _id: 'brand' }, { $set: update }, { upsert: true });
  res.json(await stateFor(req));
}));

// ── Admin: Gerichtsfoto ersetzen ──
router.patch('/dishes/:id/image', chainAdmin(async (req: OrgRequest, res) => {
  const { img } = req.body ?? {};
  if (typeof img !== 'string' || !img.startsWith('data:image/')) {
    res.status(400).json({ error: 'Ungültiges Bild.' });
    return;
  }
  await req.db!.collection('dishes').updateOne(
    { _id: requireObjectId(req.params.id, 'Gericht-ID') }, { $set: { img } }
  );
  res.json(await stateFor(req));
}));

// ── Admin: Menüverwaltung (Stammkarte der Kette) ──
// Neue Gerichte starten ohne Bewertungen; ratingsByBranch wächst ausschließlich
// über abgegebene Bewertungen.
router.post('/dishes', chainAdmin(async (req: OrgRequest, res) => {
  const db = req.db!;
  await db.collection('dishes').insertOne({
    name: requireText(req.body?.name, 'Name', 80),
    price: requirePrice(req.body?.price),
    cat: requireCategory(req.body?.cat),
    img: optionalImage(req.body?.img) ?? IMAGE_PLACEHOLDER,
    // Ohne Angabe führt es die ganze Kette.
    branchIds: (await optionalBranchIds(db, req.body?.branchIds)) ?? null,
    ratingsByBranch: {},
  });
  res.json(await stateFor(req));
}));

router.patch('/dishes/:id', chainAdmin(async (req: OrgRequest, res) => {
  const db = req.db!;
  const update: Record<string, unknown> = {};
  if (req.body?.name !== undefined) update.name = requireText(req.body.name, 'Name', 80);
  if (req.body?.price !== undefined) update.price = requirePrice(req.body.price);
  if (req.body?.cat !== undefined) update.cat = requireCategory(req.body.cat);
  if (req.body?.img !== undefined) update.img = optionalImage(req.body.img) ?? IMAGE_PLACEHOLDER;
  if (req.body?.branchIds !== undefined) update.branchIds = await optionalBranchIds(db, req.body.branchIds);
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: 'Es wurde nichts zum Ändern übergeben.' });
    return;
  }
  const result = await db.collection('dishes').updateOne(
    { _id: requireObjectId(req.params.id, 'Gericht-ID') }, { $set: update }
  );
  if (result.matchedCount === 0) {
    res.status(404).json({ error: 'Gericht wurde nicht gefunden.' });
    return;
  }
  res.json(await stateFor(req));
}));

/**
 * ── Verfügbarkeit eines Gerichts in EINER Filiale ──
 *
 * Der Hebel der Filialleitung: Stammdaten (Name, Preis, Foto) gehören der
 * Kette, ob die Filiale das Gericht führt, entscheidet sie selbst.
 *
 * `branchIds: null` heißt "überall". Wird ein Gericht in einer Filiale
 * abgeschaltet, muss diese Kurzform erst in eine ausdrückliche Liste aller
 * anderen Filialen aufgelöst werden — sonst ginge die Abwahl verloren.
 */
router.patch('/branches/:branchSlug/dishes/:dishId/availability',
  branchAdmin(withBranch(async (req: OrgRequest, res) => {
    const db = req.db!;
    const branchId = String(req.branch!._id);
    const active = req.body?.active;
    if (typeof active !== 'boolean') {
      throw new HttpError(400, 'active muss true oder false sein.');
    }

    const dish = await db.collection<DishDoc>('dishes')
      .findOne({ _id: requireObjectId(req.params.dishId, 'Gericht-ID') });
    if (!dish) {
      res.status(404).json({ error: 'Gericht wurde nicht gefunden.' });
      return;
    }

    const allBranchIds = (await db.collection('branches').find().project({ _id: 1 }).toArray())
      .map(b => String(b._id));
    const current = dish.branchIds ?? allBranchIds;

    let next = active
      ? [...new Set([...current, branchId])]
      : current.filter(id => id !== branchId);

    if (next.length === 0) {
      res.status(400).json({
        error: 'Das Gericht wäre dann in keiner Filiale mehr verfügbar. Lösche es stattdessen im Menü.',
      });
      return;
    }

    // Wieder alle: zurück auf die Kurzform, damit neue Filialen mitgelten.
    const branchIds = next.length === allBranchIds.length ? null : next;
    await db.collection('dishes').updateOne({ _id: dish._id }, { $set: { branchIds } });
    res.json(await stateFor(req));
  }))
);

/**
 * Ein gelöschtes Gericht verschwindet auch aus den laufenden Bestellungen —
 * sonst hinge es unbewertbar auf dem Tisch. Bereits abgegebene Bewertungen
 * behalten ihre dishId; die Oberfläche zeigt dafür "Gelöschtes Gericht".
 */
router.delete('/dishes/:id', chainAdmin(async (req: OrgRequest, res) => {
  const db = req.db!;
  const id = requireObjectId(req.params.id, 'Gericht-ID');
  await db.collection('dishes').deleteOne({ _id: id });
  await db.collection('tables').updateMany({}, { $pull: { items: { dishId: String(id) } } } as never);
  // Tische, die dadurch leer geworden sind, gelten als nicht mehr belegt.
  await db.collection('tables').updateMany(
    { status: 'offen', items: { $size: 0 } },
    { $set: { status: 'frei', orderId: null, openedAt: null } }
  );
  res.json(await stateFor(req));
}));

// ── Admin: Gutscheinverwaltung ──
router.post('/vouchers', chainAdmin(async (req: OrgRequest, res) => {
  const db = req.db!;
  await db.collection('vouchers').insertOne({
    title: requireText(req.body?.title, 'Titel', 80),
    points: requirePoints(req.body?.points),
    expiry: requireText(req.body?.expiry, 'Gültig bis', 40),
    img: optionalImage(req.body?.img) ?? IMAGE_PLACEHOLDER,
    // Ohne Angabe in der ganzen Kette einlösbar — der Gast sammelt seine
    // Punkte schließlich auch überall.
    branchIds: (await optionalBranchIds(db, req.body?.branchIds)) ?? null,
  });
  res.json(await stateFor(req));
}));

router.patch('/vouchers/:id', chainAdmin(async (req: OrgRequest, res) => {
  const db = req.db!;
  const update: Record<string, unknown> = {};
  if (req.body?.title !== undefined) update.title = requireText(req.body.title, 'Titel', 80);
  if (req.body?.points !== undefined) update.points = requirePoints(req.body.points);
  if (req.body?.expiry !== undefined) update.expiry = requireText(req.body.expiry, 'Gültig bis', 40);
  if (req.body?.img !== undefined) update.img = optionalImage(req.body.img) ?? IMAGE_PLACEHOLDER;
  if (req.body?.branchIds !== undefined) update.branchIds = await optionalBranchIds(db, req.body.branchIds);
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: 'Es wurde nichts zum Ändern übergeben.' });
    return;
  }
  const result = await db.collection('vouchers').updateOne(
    { _id: requireObjectId(req.params.id, 'Gutschein-ID') }, { $set: update }
  );
  if (result.matchedCount === 0) {
    res.status(404).json({ error: 'Gutschein wurde nicht gefunden.' });
    return;
  }
  res.json(await stateFor(req));
}));

router.delete('/vouchers/:id', chainAdmin(async (req: OrgRequest, res) => {
  const db = req.db!;
  const id = requireObjectId(req.params.id, 'Gutschein-ID');
  await db.collection('vouchers').deleteOne({ _id: id });
  // Aus der Einlöse-Liste des Gasts nehmen, damit dort keine toten IDs bleiben.
  await db.collection<GuestProfileDoc>('guestProfile').updateOne(
    { _id: 'default' }, { $pull: { redeemed: String(id) } }
  );
  res.json(await stateFor(req));
}));

// ── Admin: Filialverwaltung ──
router.post('/branches', chainAdmin(async (req: OrgRequest, res) => {
  const db = req.db!;
  const name = requireText(req.body?.name, 'Name', 80);
  await db.collection('branches').insertOne({
    slug: await uniqueBranchSlug(db, name),
    name,
    address: requireText(req.body?.address, 'Adresse', 160),
  });
  res.json(await stateFor(req));
}));

router.patch('/branches/:id', chainAdmin(async (req: OrgRequest, res) => {
  const db = req.db!;
  const update: Record<string, unknown> = {};
  if (req.body?.name !== undefined) update.name = requireText(req.body.name, 'Name', 80);
  if (req.body?.address !== undefined) update.address = requireText(req.body.address, 'Adresse', 160);
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: 'Es wurde nichts zum Ändern übergeben.' });
    return;
  }
  // Der slug bleibt bewusst unverändert: er steckt in bereits gedruckten Links.
  const result = await db.collection('branches').updateOne(
    { _id: requireObjectId(req.params.id, 'Filial-ID') }, { $set: update }
  );
  if (result.matchedCount === 0) {
    res.status(404).json({ error: 'Filiale wurde nicht gefunden.' });
    return;
  }
  res.json(await stateFor(req));
}));

/**
 * Filialen tragen die Tische, und Tische tragen die QR-Codes. Eine Filiale mit
 * Tischen zu löschen würde also gedruckte Codes ins Leere zeigen lassen —
 * deshalb erst die Tische, dann die Filiale. Die letzte Filiale bleibt stehen,
 * weil neue Tische sonst nirgends mehr angelegt werden könnten.
 */
router.delete('/branches/:id', chainAdmin(async (req: OrgRequest, res) => {
  const db = req.db!;
  const id = requireObjectId(req.params.id, 'Filial-ID');
  if (await db.collection('branches').countDocuments() <= 1) {
    res.status(400).json({ error: 'Die letzte Filiale kann nicht gelöscht werden.' });
    return;
  }
  const tableCount = await db.collection('tables').countDocuments({ branchId: String(id) });
  if (tableCount > 0) {
    res.status(409).json({
      error: `Zu dieser Filiale gehören noch ${tableCount} Tische. Lösche zuerst die Tische.`,
    });
    return;
  }
  await db.collection('branches').deleteOne({ _id: id });
  // Benutzer, die nur dieser Filiale zugeordnet waren, gelten wieder für alle.
  await db.collection('users').updateMany({ branchId: String(id) }, { $set: { branchId: null } });
  res.json(await stateFor(req));
}));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Geprüfte Eingabefehler bekommen ihren eigenen Status und eine Meldung, die
  // der Oberfläche etwas sagt. Alles andere bleibt ein 500 ohne Interna.
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Bitely API läuft auf http://localhost:${port}`);
});
