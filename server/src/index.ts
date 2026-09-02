import 'dotenv/config';
import { randomInt } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ObjectId, type Db, type WithId, type Document, type Filter } from 'mongodb';
import { platformDb, orgDbBySlug, connectionSummary, explainDbError } from './db.js';
import {
  verifyPassword, hashPassword, signToken, verifyToken, signGuestToken, verifyGuestToken,
  signPointsTicket, verifyPointsTicket, signReviewTicket, verifyReviewTicket,
  type TokenPayload, type GuestTokenPayload,
} from './auth.js';
import { verifyGoogleIdToken, googleClientId } from './googleAuth.js';
import { generateReviewText } from './reviewText.js';
import { generateHighlight, scanReceipt, hasClaude, type HighlightInput } from './ai.js';
import { canEncryptApiKeys, encryptApiKey, decryptApiKey } from './secrets.js';
import type {
  Organization, BrandDoc, DashboardDoc, GuestDoc, DishRatingInput, UserDoc, Branch,
  DishDoc, RedemptionDoc, ReviewDoc, InsightsDoc, TableDoc, OrderDoc,
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

// Wie lange eine Bestellung ohne Bewertung auf dem Tisch stehen bleibt, bevor
// der Tisch von selbst wieder frei wird. Zwei Stunden decken einen langen
// Restaurantbesuch ab; danach sitzen dort mit ziemlicher Sicherheit andere
// Gäste, und die sollen keine fremde Bestellung vorfinden.
const TABLE_TTL_MS = 2 * 60 * 60 * 1000;

// Wie viele vergangene Einlösungen das Admin-Reporting mitliefert.
const REDEMPTION_PAGE_SIZE = 100;

/**
 * Was eine Bewertung wert ist.
 *
 * Die Regel steht hier und nur hier. Der Gesamtzustand trägt sie als
 * `pointsRule` mit hinaus, damit die Gastansicht sie ANSAGEN kann, bevor
 * bewertet wird ("pro Gericht 20 Punkte") und während bewertet wird (der
 * Zähler, der beim Bewerten hochläuft). Vorher erfuhr der Gast die Zahl erst
 * NACH dem Absenden, und damit nie, wofür er sie eigentlich bekommt.
 *
 * Nicht ins Frontend kopieren: gerechnet wird weiterhin ausschließlich hier,
 * und eine zweite Kopie der Zahlen liefe irgendwann auseinander.
 */
const POINTS_PER_DISH = 20;
const POINTS_PER_REVIEW = 30;
const pointsFor = (ratedCount: number) => ratedCount * POINTS_PER_DISH + POINTS_PER_REVIEW;

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
  const { _id, passwordHash, googleSub, apiKeyEnc, ...rest } = doc;
  // Weder Hash noch Googles Konto-ID noch der eigene API-Schlüssel gehören in
  // eine Antwort: `users` steckt im Gesamtzustand, den auch ein Gast lädt. Was
  // die Verwaltung braucht, ist ohnehin nur, OB es sie gibt.
  return {
    id: String(_id), ...rest,
    hasPassword: !!passwordHash,
    hasGoogle: !!googleSub,
    hasApiKey: !!apiKeyEnc,
  };
}

// Dieselbe Falle wie oben, mit dem Einlöse-Code: `redemptions` steckt im
// GEMEINSAMEN Zustandsobjekt, das auch jeder Anonyme laden kann.
//
// Seit der Gast statt einer Zahl ein Häkchen sieht, wird der Code nirgends mehr
// angezeigt — er bleibt als Kennung der Einlösung in der Datenbank und im
// Reporting der Verwaltung. Herausgegeben wird er nur an das Personal.
function serializeRedemption(doc: WithId<RedemptionDoc>, withCode: boolean) {
  const { _id, code, ...rest } = doc;
  return { id: String(_id), ...rest, ...(withCode ? { code } : {}) };
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
 * Der angemeldete GAST, falls einer angemeldet ist. Anders als beim Personal
 * ist das nie Pflicht: die Gastansicht muss ohne Konto funktionieren, sonst
 * ist der QR-Code am Tisch wertlos. Ohne Konto gibt es nur keine Punkte.
 */
function readGuest(req: OrgRequest): GuestTokenPayload | null {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyGuestToken(token) : null;
  return payload && payload.orgSlug === req.params.orgSlug ? payload : null;
}

/** Das Konto des angemeldeten Gastes — oder null. */
async function currentGuest(req: OrgRequest): Promise<WithId<GuestDoc> | null> {
  const payload = readGuest(req);
  if (!payload) return null;
  try {
    return await req.db!.collection<GuestDoc>('guests').findOne({ _id: new ObjectId(payload.sub) });
  } catch {
    return null;
  }
}

/** Das Personal-Konto des angemeldeten Nutzers — oder null. */
async function currentUserDoc(req: OrgRequest): Promise<WithId<UserDoc> | null> {
  if (!req.user) return null;
  try {
    return await req.db!.collection<UserDoc>('users').findOne({ _id: new ObjectId(req.user.sub) });
  } catch {
    return null;
  }
}

/**
 * Der private API-Schlüssel des Aufrufers — Personal ODER Gast, je nachdem,
 * wer gerade angemeldet ist. Beide Konto-Arten kommen für dieselbe Anfrage
 * nie gleichzeitig infrage (Personal-Routen laufen über requireAuth, das
 * req.user setzt; Gast-Routen prüfen ohnehin nur den Gast-Token), die
 * Reihenfolge hier ist nur der einfachste Weg, beide an einer Stelle
 * abzufragen.
 */
async function callerApiKey(req: OrgRequest): Promise<string | null> {
  const user = await currentUserDoc(req);
  if (user?.apiKeyEnc) return decryptApiKey(user.apiKeyEnc);
  const guest = await currentGuest(req);
  return guest?.apiKeyEnc ? decryptApiKey(guest.apiKeyEnc) : null;
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
async function stateFor(req: OrgRequest) {
  const managesMenu = req.user?.role === 'Admin' || req.user?.role === 'Manager';
  // Punkte und eingelöste Gutscheine sind die des angemeldeten Gastes — oder
  // leer. Der Gesamtzustand trägt also je nach Aufrufer ein anderes Konto.
  const guest = await currentGuest(req);
  return getFullState(req.db!, scopeOf(req), managesMenu, !!req.user, guest);
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
 * Räumt Einlösungen aus der Zeit der 60-Sekunden-Frist ab und schreibt die
 * reservierten Punkte zurück. Neue Entwertungen entstehen nicht mehr in diesem
 * Zustand, in der Datenbank können aber noch welche liegen.
 *
 * Läuft ohne Hintergrundjob: wer als Erster den Zustand lädt, räumt auf. Das
 * `status: 'offen'` in der Bedingung ist der Kern — es kann nur EINE Anfrage
 * gewinnen, und nur die schreibt die Punkte gut. Sonst bekäme der Gast bei zwei
 * gleichzeitigen Aufrufen seine Punkte doppelt zurück.
 */
/**
 * Punkte auf ein Gastkonto zurückbuchen (Verfall oder Abbruch).
 *
 * Einlösungen aus der Zeit des geteilten Profils tragen `guestId: 'default'` —
 * keine Konto-ID. Für die gibt es nichts zurückzubuchen; sie sind längst
 * abgeschlossen und dürfen den Ablauf nicht mit einem Fehler anhalten.
 */
async function refundGuest(db: Db, guestId: string, points: number, voucherId: string): Promise<void> {
  if (!ObjectId.isValid(guestId)) return;
  await db.collection<GuestDoc>('guests').updateOne(
    { _id: new ObjectId(guestId) },
    { $inc: { points }, $pull: { redeemed: voucherId } }
  );
}

async function expireStaleRedemptions(db: Db): Promise<void> {
  const now = Date.now();
  const stale = await db.collection<RedemptionDoc>('redemptions')
    .find({ status: 'offen', expiresAt: { $lte: now, $ne: null } })
    .toArray();

  for (const r of stale) {
    const claimed = await db.collection<RedemptionDoc>('redemptions').findOneAndUpdate(
      { _id: r._id, status: 'offen' },
      { $set: { status: 'verfallen' } }
    );
    // Null heißt: eine andere Anfrage war schneller und hat die Punkte bereits
    // zurückgeschrieben. Dann hier nichts tun.
    if (!claimed) continue;
    await refundGuest(db, r.guestId, r.points, r.voucherId);
  }
}

/**
 * Gibt Tische frei, deren Bestellung zu lange ohne Bewertung steht.
 *
 * Ein Tisch soll den nächsten Gästen leer gegenübertreten. Ohne das bleibt die
 * Bestellung der vorigen Runde hängen, bis jemand daran denkt, sie zu
 * schließen, und der QR-Code am Tisch bietet fremde Gerichte zur Bewertung an.
 *
 * Wie beim Verfall der Einlösungen ohne Hintergrundjob: wer als Erster den
 * Zustand lädt, räumt auf. Der Normalfall bleibt der Knopf in der Kellner-App,
 * das hier fängt nur das Vergessen ab.
 */
async function releaseStaleTables(db: Db): Promise<void> {
  await db.collection<TableDoc>('tables').updateMany(
    { status: 'offen', openedAt: { $lte: Date.now() - TABLE_TTL_MS } },
    { $set: { status: 'frei', items: [], openedAt: null, orderId: null } }
  );
}

async function getFullState(
  db: Db, branchId: string | null, fullMenu = false, isStaff = false,
  guestAccount: WithId<GuestDoc> | null = null,
) {
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

  /**
   * Wessen Einlösungen der Aufrufer sieht.
   *
   * Für das Personal sind sie Arbeitsvorrat: alle der Filiale, sonst wüsste
   * niemand, welche Ausgabe noch aussteht. Für den Gast sind sie SEIN Beleg —
   * er bekommt ausschließlich die eigenen.
   *
   * Das ist kein Feinschliff. Die Gastansicht liest daraus, ob für einen
   * Gutschein bereits eine Entwertung offen ist, und überspringt dann den
   * Wisch, um dem Gast den Bildschirm zurückzugeben, den er vorzeigen muss.
   * Bekam sie die Einlösungen FREMDER Gäste, traf diese Prüfung auf einen
   * fremden Datensatz zu: der Wisch entfiel, es wurden keine Punkte abgebucht,
   * und der Gast sah ein Häkchen für einen Gutschein, den er nie eingelöst
   * hatte. Ein Gutschein, den ein Gast gerade offen hatte, war damit für alle
   * anderen in derselben Filiale gratis.
   *
   * Ohne Anmeldung gibt es nichts zu zeigen — einlösen setzt ohnehin ein Konto
   * voraus, also kann es keine eigene Einlösung geben.
   */
  const redemptionScope: Filter<RedemptionDoc> = isStaff
    ? branchFilter
    : guestAccount
      ? { ...branchFilter, guestId: String(guestAccount._id) }
      : { _id: { $in: [] } };

  // Vor dem Lesen aufräumen: keine längst abgelaufene Einlösung als "offen",
  // und keine Bestellung von vorgestern auf einem Tisch, an dem längst andere
  // Gäste sitzen.
  await expireStaleRedemptions(db);
  await releaseStaleTables(db);

  const [brandDoc, dashboardDoc, branches, dishes, tables, vouchers, users, alerts, reviews, redemptions] = await Promise.all([
    db.collection<BrandDoc>('settings').findOne({ _id: 'brand' }),
    db.collection<DashboardDoc>('settings').findOne({ _id: 'dashboard' }),
    db.collection('branches').find().toArray(),
    db.collection('dishes').find(availableHere).toArray(),
    db.collection('tables').find(branchFilter).toArray(),
    db.collection('vouchers').find(availableHere).toArray(),
    db.collection('users').find().toArray(),
    db.collection('alerts').find(branchFilter).sort({ createdAt: -1 }).toArray(),
    // Begrenzt: der Gesamtzustand wird bei jedem Seitenaufruf geladen, und die
    // Rezensionen wachsen als einzige Collection unbegrenzt mit.
    db.collection('reviews').find(branchFilter).sort({ createdAt: -1 }).limit(REVIEW_PAGE_SIZE).toArray(),
    db.collection<RedemptionDoc>('redemptions').find(redemptionScope).sort({ createdAt: -1 }).limit(REDEMPTION_PAGE_SIZE).toArray(),
  ]);

  // Ohne Anmeldung ein leeres Konto: keine Punkte, nichts eingelöst. Früher
  // stand hier ein von allen Gästen geteiltes Profil — jeder sah denselben
  // Punktestand und dieselben Gutscheine als verbraucht.
  const guest = guestAccount
    ? {
        points: guestAccount.points, redeemed: guestAccount.redeemed, loggedIn: true,
        name: guestAccount.name, email: guestAccount.email,
      }
    : { points: 0, redeemed: [] as string[], loggedIn: false, name: null, email: null };

  return {
    brand: brandDoc ? {
      name: brandDoc.name, accent: brandDoc.accent, logo: brandDoc.logo,
      logoImage: brandDoc.logoImage ?? null, coverImage: brandDoc.coverImage ?? null,
      font: brandDoc.font ?? 'Inter', cardStyle: brandDoc.cardStyle ?? 'standard',
      guestTheme: brandDoc.guestTheme ?? 'hell',
      guestNameColor: brandDoc.guestNameColor ?? null,
      guestTextColor: brandDoc.guestTextColor ?? null,
      coverOpacity: brandDoc.coverOpacity ?? null,
      guestLang: brandDoc.guestLang === 'en' ? 'en' : 'de',
      weakRatingColor: brandDoc.weakRatingColor ?? null,
    } : null,
    dashboard: { hiddenWidgets: dashboardDoc?.hiddenWidgets ?? [] },
    branches: branches.map(serialize),
    dishes: (dishes as WithId<DishDoc>[]).map(d => serializeDish(d, branchId)),
    tables: tables.map(serialize),
    vouchers: vouchers.map(serialize),
    users: (users as WithId<UserDoc>[]).map(serializeUser),
    alerts: alerts.map(serialize),
    reviews: reviews.map(serialize),
    redemptions: redemptions.map(r => serializeRedemption(r, isStaff)),
    guest,
    // Damit die Gastansicht sagen kann, wofür es Punkte gibt, BEVOR bewertet
    // wird. Gerechnet wird trotzdem nur auf dem Server (siehe pointsFor).
    pointsRule: { perDish: POINTS_PER_DISH, perReview: POINTS_PER_REVIEW },
  };
}

/**
 * Welcher Stand läuft hier eigentlich?
 *
 * Ohne diese Auskunft ist "ist der Deploy durch?" Rätselraten: man probiert
 * eine Route, die es im neuen Stand gibt, und schließt aus 404 auf den alten.
 * Genau das hat einmal eine Stunde gekostet, während Render still auf einem
 * blockierten Blueprint-Abgleich saß. `RENDER_GIT_COMMIT` setzt Render selbst.
 */
const STARTED_AT = Date.now();
app.get('/version', (_req, res) => {
  const commit = process.env.RENDER_GIT_COMMIT ?? null;
  res.json({
    commit: commit ? commit.slice(0, 7) : 'unbekannt (lokal?)',
    branch: process.env.RENDER_GIT_BRANCH ?? null,
    startedAt: new Date(STARTED_AT).toISOString(),
    uptimeMinutes: Math.round((Date.now() - STARTED_AT) / 60000),
  });
});

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

/**
 * Personal: eigenen Anthropic-Key hinterlegen — jede Rolle, nicht nur Admin,
 * denn ein Kellner löst den Bon-Scan genauso aus. Bewusst KEIN `/users/:id`:
 * das ist eine andere Route (chainAdmin), die ein Konto FÜR jemand anderen
 * ändert. Hier ändert das Konto sich selbst, über die eigene Sitzung.
 */
router.put('/account/api-key', staffOrAdmin(async (req: OrgRequest, res) => {
  if (!canEncryptApiKeys()) {
    res.status(503).json({ error: 'Eigene API-Schlüssel sind auf diesem Server nicht eingerichtet.' });
    return;
  }
  const apiKey = requireText(req.body?.apiKey, 'API-Schlüssel', 200);
  if (apiKey.length < 20) {
    res.status(400).json({ error: 'Das sieht nicht nach einem gültigen API-Schlüssel aus.' });
    return;
  }
  const id = requireObjectId(req.user!.sub, 'Benutzer-ID');
  const apiKeyEnc = encryptApiKey(apiKey);
  await req.db!.collection<UserDoc>('users').updateOne({ _id: id }, { $set: { apiKeyEnc } });
  const user = await req.db!.collection<UserDoc>('users').findOne({ _id: id });
  res.json({ user: serializeUser(user!) });
}));

router.delete('/account/api-key', staffOrAdmin(async (req: OrgRequest, res) => {
  const id = requireObjectId(req.user!.sub, 'Benutzer-ID');
  await req.db!.collection<UserDoc>('users').updateOne({ _id: id }, { $set: { apiKeyEnc: null } });
  const user = await req.db!.collection<UserDoc>('users').findOne({ _id: id });
  res.json({ user: serializeUser(user!) });
}));

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

/**
 * Die gebuchte Bestellung festhalten — als Beleg, dass es sie gab.
 *
 * Der Tisch vergisst sie beim Freigeben; ohne diesen Eintrag wüsste das
 * Dashboard nur, wie viele Bestellungen BEWERTET wurden, und nie, wie viele es
 * überhaupt gab. Der Upsert auf `orderId` sorgt dafür, dass Nachbuchen den
 * bestehenden Datensatz wachsen lässt statt einen zweiten anzulegen — die
 * Eindeutigkeit trägt der Index (siehe db.ts), nicht diese Funktion.
 */
async function recordOrder(
  req: OrgRequest,
  tableId: unknown,
  tableNumber: number,
  orderId: ObjectId,
  items: { dishId: string; qty: number }[],
): Promise<void> {
  const now = Date.now();
  try {
    await req.db!.collection<OrderDoc>('orders').updateOne(
      { orderId },
      {
        $setOnInsert: {
          orderId,
          branchId: String(req.branch!._id),
          tableId: String(tableId),
          tableNumber,
          createdAt: now,
        },
        $set: { itemCount: items.reduce((a, i) => a + i.qty, 0) },
      },
      { upsert: true }
    );
  } catch (err) {
    // Zwei gleichzeitige Buchungen auf denselben Tisch versuchen beide den
    // Einschub und eine verliert am eindeutigen Index. Das ist kein Fehler,
    // sondern genau das, wofür der Index da ist — und selbst wenn hier etwas
    // anderes schiefginge: die Bestellung liegt auf dem Tisch, der Gast kann
    // sie bewerten, und eine fehlende Zeile im Reporting darf das Buchen
    // nicht scheitern lassen.
    console.warn('[orders] Bestellung konnte nicht protokolliert werden:', err);
  }
}

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
    // Erste Buchung auf einen leeren Tisch eröffnet eine neue Bestellung.
    const orderId = (table.orderId as ObjectId | null | undefined) ?? new ObjectId();
    await req.db!.collection('tables').updateOne(
      { _id: table._id },
      {
        $set: {
          items,
          status: 'offen',
          openedAt: table.openedAt ?? Date.now(),
          orderId,
        },
      }
    );
    await recordOrder(req, table._id, number, orderId, items);
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
    // Ein Nachtrag macht den Tisch in jedem Fall wieder aktiv — auch wenn er
    // zuvor bewertet war; dann eröffnet er eine neue Bestellung.
    const orderId = (table.orderId as ObjectId | null | undefined) ?? new ObjectId();
    await req.db!.collection('tables').updateOne(
      { _id: table._id },
      {
        $set: {
          items,
          status: 'offen',
          openedAt: table.openedAt ?? Date.now(),
          orderId,
        },
      }
    );
    await recordOrder(req, table._id, number, orderId, items);
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
    let reviewId: ObjectId;
    try {
      const inserted = await db.collection('reviews').insertOne({
        orderId,
        branchId: table.branchId, tableId: String(table._id), tableNumber: number,
        dishRatings, overall, createdAt: Date.now(),
        // Wem die Punkte dieser Bewertung gehören. null heißt: noch niemandem —
        // wer sich gleich anmeldet, kann sie mit dem Ticket unten holen.
        guestId: null,
      });
      reviewId = inserted.insertedId;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        res.status(409).json({ error: 'Diese Bestellung wurde bereits bewertet.' });
        return;
      }
      throw err;
    }

    const ratedCount = dishRatings.filter(d => d.stars > 0).length;
    // Was die Bewertung wert ist. Gutgeschrieben wird sie nur einem Konto —
    // ohne Anmeldung bleibt es beim Betrag, den der Gast verpasst hat, und die
    // Oberfläche sagt ihm das (pointsEarned: 0, pointsPossible: …).
    const pointsPossible = pointsFor(ratedCount);
    const guestAccount = await currentGuest(req);
    const pointsEarned = guestAccount ? pointsPossible : 0;

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

    if (guestAccount) {
      await db.collection<GuestDoc>('guests').updateOne(
        { _id: guestAccount._id },
        { $inc: { points: pointsEarned } }
      );
      await db.collection('reviews').updateOne(
        { _id: reviewId }, { $set: { guestId: String(guestAccount._id) } }
      );
    }

    // Bestellung abräumen: der Tisch ist bewertet und damit wieder frei. Ein
    // erneuter Aufruf des QR-Links zeigt den Leerzustand statt derselben
    // Gerichte.
    await db.collection('tables').updateOne(
      { _id: table._id },
      { $set: { status: 'frei', items: [], orderId: null, openedAt: null } }
    );

    const state = await stateFor(req);
    // Ohne Konto: ein Gutschein auf die Punkte, einlösbar durch Anmelden.
    const pointsTicket = guestAccount ? null : signPointsTicket({
      reviewId: String(reviewId), points: pointsPossible, orgSlug: req.params.orgSlug!,
    });
    // Der Anspruch auf den KI-Rezensionstext zu GENAU dieser Bewertung. Der
    // Text wird nicht hier erzeugt: das kostet Sekunden, die der Gast sonst vor
    // einem hängenden „Wird gesendet…" verbringt. Der Dank-Bildschirm holt ihn
    // mit diesem Ticket nach, sobald er steht.
    const reviewTicket = signReviewTicket({
      reviewId: String(reviewId), orgSlug: req.params.orgSlug!,
    });
    res.json({ ...state, pointsEarned, pointsPossible, pointsTicket, reviewTicket });
  } catch (err) {
    next(err);
  }
}));

// ═══════════════════════════════════════════════════════════
// GUTSCHEIN-EINLÖSUNG
//
// Der Wisch entwertet sofort: Punkte weg, Gutschein verbraucht, ohne Frist und
// ohne Rückweg. Danach zeigt der Gast den Bildschirm der Servicekraft, die die
// Ausgabe in IHRER App einträgt.
//
// Damit ist ein Screenshot als Betrugsversuch uninteressant, denn er kostet
// den Gast dieselben Punkte wie der echte Wisch, und das Eintragen sagt dem
// Betrieb, was tatsächlich über die Theke ging.
// ═══════════════════════════════════════════════════════════

/** Gast: Gutschein entwerten. Liegt unter der Filiale, denn dort wird eingelöst. */
/**
 * Wann ein Gutschein abläuft, als Zeitstempel — oder `null`, wenn sich das
 * Feld nicht lesen lässt.
 *
 * `expiry` ist Freitext: der Admin tippt „31.12.2026" ins Formular. Deshalb
 * beide gebräuchlichen Formen, deutsch mit Punkten und ISO. Was sich nicht
 * lesen lässt, gilt als unbefristet — ein Gutschein, der wegen eines
 * Tippfehlers im Datum stillschweigend verschwindet, wäre schlimmer als einer,
 * der zu lange gilt.
 *
 * Der Zeitpunkt ist das ENDE des genannten Tages: „gültig bis 31.12." heißt
 * den 31. über.
 */
function voucherExpiryTs(expiry: unknown): number | null {
  if (typeof expiry !== 'string') return null;
  const text = expiry.trim();
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  let y: number, m: number, d: number;
  if (de) { d = +de[1]; m = +de[2]; y = +de[3]; }
  else if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else return null;
  const ts = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/** Ist er heute noch einlösbar? Ohne lesbares Datum: ja. */
function voucherExpired(expiry: unknown, now = Date.now()): boolean {
  const ts = voucherExpiryTs(expiry);
  return ts !== null && ts < now;
}

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
  // Der Gast bekommt abgelaufene Gutscheine gar nicht erst zu sehen. Die
  // Prüfung steht trotzdem hier: die Route ist öffentlich, und ein alter
  // Bildschirm im Browser weiß nichts vom gestrigen Ablauf.
  if (voucherExpired(voucher.expiry)) {
    res.status(400).json({ error: `Dieser Gutschein ist seit ${voucher.expiry} abgelaufen.` });
    return;
  }

  // Abgelaufenes erst abräumen — sonst blockiert ein verwaister Versuch.
  await expireStaleRedemptions(db);

  // Einlösen setzt ein Konto voraus: die Punkte gehören einem, und ohne
  // Anmeldung gäbe es niemanden, dem sie abgezogen und zurückgebucht werden.
  const guest = await currentGuest(req);
  if (!guest) {
    res.status(401).json({ error: 'Zum Einlösen bitte anmelden. Deine Punkte hängen an deinem Konto.' });
    return;
  }
  const guestId = String(guest._id);
  if (guest.redeemed.includes(String(voucherId))) {
    res.status(409).json({ error: 'Dieser Gutschein wurde bereits eingelöst.' });
    return;
  }

  // Optionaler Tisch: nur fürs Reporting ("wo wurde eingelöst").
  let table: { _id: unknown; number: number } | null = null;
  if (req.body?.tableNumber != null) {
    const found = await findTableInBranch(req, requireTableNumber(req.body.tableNumber));
    if (found) table = found as { _id: unknown; number: number };
  }

  // Punkte abbuchen, endgültig. BEIDE Bedingungen stecken IM Update — genug
  // Punkte und dieser Gutschein noch nicht vergeben. Die Prüfungen oben sind
  // Diagnose, kein Schutz: zwischen ihnen und hier liegt Zeit, und zwei Daumen
  // auf demselben Gutschein kamen im Prüflauf beide durch (Punkte doppelt
  // abgebucht) — auf demselben Konto, zwei Geräte, ist das weiterhin möglich.
  const reserved = await db.collection<GuestDoc>('guests').updateOne(
    { _id: guest._id, points: { $gte: voucher.points }, redeemed: { $ne: String(voucherId) } },
    { $inc: { points: -voucher.points }, $push: { redeemed: String(voucherId) } }
  );
  if (reserved.modifiedCount === 0) {
    // Woran es lag, steht erst jetzt fest: im Wettlauf verloren oder zu wenige
    // Punkte. Der Gast bekommt denselben Satz zu lesen wie bei der Vorprüfung.
    const profile = await db.collection<GuestDoc>('guests').findOne({ _id: guest._id });
    if ((profile?.redeemed ?? []).includes(String(voucherId))) {
      res.status(409).json({ error: 'Dieser Gutschein wurde bereits eingelöst.' });
      return;
    }
    res.status(400).json({ error: 'Nicht genug Punkte für diesen Gutschein.' });
    return;
  }

  const now = Date.now();
  // Der Wisch IST die Einlösung: 'eingelöst' direkt. Es gab einmal einen
  // Zwischenzustand 'entwertet' ("Punkte weg, Ausgabe steht noch aus"), den die
  // Servicekraft in ihrer App bestätigte — der Schritt ist entfallen, der Wisch
  // vor Ort erklärt sich selbst und die Punkte sind ohnehin schon abgebucht.
  const doc: Omit<RedemptionDoc, '_id'> = {
    voucherId: String(voucherId),
    voucherTitle: String(voucher.title),
    branchId,
    tableId: table ? String(table._id) : null,
    tableNumber: table ? table.number : null,
    guestId,
    code: redemptionCode(),
    points: Number(voucher.points),
    status: 'eingelöst',
    createdAt: now,
    expiresAt: null,
    redeemedAt: now,
    confirmedBy: null,
    confirmedByName: null,
  };
  const inserted = await db.collection<RedemptionDoc>('redemptions').insertOne(doc as RedemptionDoc);

  const state = await stateFor(req);
  res.json({ ...state, redemption: { id: String(inserted.insertedId), ...doc } });
}));

// Eine Route, um die Ausgabe gesondert zu bestätigen, gibt es nicht mehr: der
// Wisch setzt 'eingelöst' direkt. Auch keine Route zum Abbrechen — ein Rückweg
// wäre genau die Lücke, über die derselbe Gutschein zweimal gälte. Die
// Rückbuchung in refundGuest bleibt für den Altbestand stehen, dessen
// 60-Sekunden-Frist noch verfallen kann.

// ═══════════════════════════════════════════════════════════
// GASTKONTEN
//
// Punkte gehören ab hier einem Konto, nicht mehr einem von allen geteilten
// Profil. Bewerten bleibt ohne Konto möglich — der QR-Code am Tisch wäre sonst
// wertlos —, nur die Punkte gibt es dann nicht.
//
// Das Gast-Token ist ein eigener Typ (kind: 'guest') und kommt an keine
// Personalroute heran, siehe verifyToken/verifyGuestToken in auth.ts.
// ═══════════════════════════════════════════════════════════

/** Was der Gast von sich selbst zu sehen bekommt — ohne Passwort-Hash. */
function serializeGuest(doc: WithId<GuestDoc>) {
  return {
    id: String(doc._id), email: doc.email, name: doc.name,
    points: doc.points, redeemed: doc.redeemed,
    hasPassword: !!doc.passwordHash, hasGoogle: !!doc.googleSub,
    hasApiKey: !!doc.apiKeyEnc,
  };
}

function guestSession(req: OrgRequest, doc: WithId<GuestDoc>) {
  return {
    token: signGuestToken({ sub: String(doc._id), orgSlug: req.params.orgSlug! }),
    guest: serializeGuest(doc),
  };
}

// ── Gast: Konto anlegen ──
router.post('/guest/register', async (req: OrgRequest, res) => {
  const db = req.db!;
  const email = requireText(req.body?.email, 'E-Mail', 200).toLowerCase();
  const name = requireText(req.body?.name, 'Name', 80);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email.includes('@')) {
    res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' });
    return;
  }
  if (await db.collection('guests').countDocuments({ email }) > 0) {
    res.status(409).json({ error: 'Für diese E-Mail gibt es bereits ein Konto. Melde dich einfach an.' });
    return;
  }

  const doc: GuestDoc = {
    email, name, passwordHash: hashPassword(password), googleSub: null,
    points: 0, redeemed: [], createdAt: Date.now(),
  };
  const inserted = await db.collection<GuestDoc>('guests').insertOne(doc as GuestDoc);
  res.json(guestSession(req, { ...doc, _id: inserted.insertedId } as WithId<GuestDoc>));
});

// ── Gast: anmelden ──
router.post('/guest/login', async (req: OrgRequest, res) => {
  const email = optionalText(req.body?.email, 'E-Mail', 200)?.toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich.' });
    return;
  }
  const guest = await req.db!.collection<GuestDoc>('guests').findOne({ email });
  // Dieselbe Meldung für "gibt es nicht" und "falsches Passwort" — sonst
  // verrät die Antwort, welche E-Mails ein Konto haben.
  if (!guest || !verifyPassword(password, guest.passwordHash)) {
    res.status(401).json({ error: 'E-Mail oder Passwort ist falsch.' });
    return;
  }
  res.json(guestSession(req, guest));
});

/**
 * Welche Anmeldewege der Gast hat.
 *
 * Die Client-ID kommt vom Server, nicht aus dem Frontend-Build: sie ist
 * ohnehin öffentlich (sie steht in jeder Google-Anmeldung im Browser), und als
 * Build-Variable müsste Netlify für jede Änderung neu bauen — dieselbe Falle
 * wie bei VITE_API_BASE_URL.
 */
router.get('/guest/auth-options', async (_req: OrgRequest, res) => {
  const clientId = googleClientId();
  res.json({ password: true, google: !!clientId, googleClientId: clientId });
});

// Dieselbe Auskunft für die Personal-Anmeldung. Eigene Adresse, weil ein
// Anmeldebildschirm für Mitarbeiter nichts unter `/guest/` abfragen sollte.
router.get('/auth-options', async (_req: OrgRequest, res) => {
  const clientId = googleClientId();
  res.json({ password: true, google: !!clientId, googleClientId: clientId });
});

/**
 * Gast: Anmeldung mit Google.
 *
 * Der Browser holt sich das ID-Token bei Google und schickt es hierher; geprüft
 * wird es serverseitig (googleAuth.ts). Zusammengeführt wird über die E-Mail:
 * wer sich erst mit Passwort registriert hat und später Google nimmt, landet
 * im selben Konto und behält seine Punkte.
 */
router.post('/guest/google', async (req: OrgRequest, res) => {
  const db = req.db!;
  if (!googleClientId()) {
    res.status(503).json({ error: 'Google-Anmeldung ist auf diesem Server nicht eingerichtet.' });
    return;
  }
  const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
  if (!credential) {
    res.status(400).json({ error: 'Es wurde kein Google-Token übergeben.' });
    return;
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(credential);
  } catch (err) {
    // Der Grund gehört ins Log, nicht in die Antwort: er sagt einem Angreifer,
    // welche Prüfung er als Nächstes umgehen müsste.
    console.warn('Google-Anmeldung abgelehnt:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Die Google-Anmeldung hat nicht geklappt. Bitte erneut versuchen.' });
    return;
  }

  const guests = db.collection<GuestDoc>('guests');
  const existing = await guests.findOne({ $or: [{ googleSub: identity.sub }, { email: identity.email }] });
  if (existing) {
    // Beim ersten Google-Login eines Konto, das per Passwort entstanden ist,
    // die Konto-ID nachtragen — danach greift der schnellere Weg über sub.
    if (!existing.googleSub) {
      await guests.updateOne({ _id: existing._id }, { $set: { googleSub: identity.sub } });
    }
    res.json(guestSession(req, { ...existing, googleSub: identity.sub }));
    return;
  }

  const doc: GuestDoc = {
    email: identity.email, name: identity.name, passwordHash: null, googleSub: identity.sub,
    points: 0, redeemed: [], createdAt: Date.now(),
  };
  const inserted = await guests.insertOne(doc as GuestDoc);
  res.json(guestSession(req, { ...doc, _id: inserted.insertedId } as WithId<GuestDoc>));
});

// ── Gast: Sitzung prüfen (nach dem Neuladen der Seite) ──
router.get('/guest/me', async (req: OrgRequest, res) => {
  const guest = await currentGuest(req);
  if (!guest) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  res.json({ guest: serializeGuest(guest) });
});

/**
 * Gast: die Punkte einer Bewertung nachträglich gutschreiben, die vor der
 * Anmeldung abgegeben wurde.
 *
 * Der Beleg ist das signierte Ticket aus der Antwort auf die Bewertung — die
 * Bewertungs-ID allein reicht nicht, sie steht für jeden lesbar im
 * Gesamtzustand. Einmaligkeit steckt wie überall im Update-Filter: nur wer die
 * Bewertung noch mit `guestId: null` vorfindet, bekommt die Punkte. Zweimal
 * dasselbe Ticket zu schicken ändert nichts mehr.
 */
router.post('/guest/claim-points', async (req: OrgRequest, res) => {
  const db = req.db!;
  const guest = await currentGuest(req);
  if (!guest) {
    res.status(401).json({ error: 'Zum Gutschreiben bitte anmelden.' });
    return;
  }
  const ticket = typeof req.body?.ticket === 'string' ? verifyPointsTicket(req.body.ticket) : null;
  if (!ticket || ticket.orgSlug !== req.params.orgSlug) {
    res.status(400).json({ error: 'Dieser Punkte-Gutschein gilt nicht (mehr).' });
    return;
  }

  const claimed = await db.collection('reviews').findOneAndUpdate(
    { _id: requireObjectId(ticket.reviewId, 'Bewertungs-ID'), guestId: null },
    { $set: { guestId: String(guest._id) } }
  );
  if (!claimed) {
    // Schon jemandem zugeschrieben — kein Fehlerfall, nur nichts zu tun.
    res.json({ ...(await stateFor(req)), pointsClaimed: 0 });
    return;
  }

  await db.collection<GuestDoc>('guests').updateOne(
    { _id: guest._id }, { $inc: { points: ticket.points } }
  );
  res.json({ ...(await stateFor(req)), pointsClaimed: ticket.points });
});

/**
 * Wohin der Gast seine Rezension tragen soll. Steht am Filialdatensatz ein
 * Google-Maps-Link, gilt der; sonst ein Suchlink aus Name und Adresse. Der
 * führt zwar nur in die Nähe des Eintrags, ist aber besser als kein Weg —
 * und die Filiale kann den echten Link jederzeit nachtragen.
 */
function mapsUrlFor(brandName: string, branch: WithId<Branch> | null): string {
  if (branch?.googleMapsUrl) return branch.googleMapsUrl;
  const query = [brandName, branch?.name, branch?.address].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Gast: der fertig formulierte Rezensionstext zu seiner gerade abgegebenen
 * Bewertung, zum Kopieren auf Google Maps.
 *
 * Das Ticket ist Pflicht und ersetzt eine Anmeldung — bewerten geht ohne Konto,
 * also muss auch das hier ohne gehen. Die Bewertungs-ID allein würde nicht
 * genügen: sie steht für jeden lesbar im Gesamtzustand, und jeder Aufruf kostet
 * einen Modellaufruf.
 *
 * Der erzeugte Text wird an der Bewertung abgelegt. Wer den Bildschirm neu lädt,
 * bekommt denselben Text zurück statt eines zweiten, leicht anderen.
 */
router.post('/guest/review-text', async (req: OrgRequest, res) => {
  const db = req.db!;
  const ticket = typeof req.body?.ticket === 'string' ? verifyReviewTicket(req.body.ticket) : null;
  if (!ticket || ticket.orgSlug !== req.params.orgSlug) {
    res.status(400).json({ error: 'Dieser Zugang gilt nicht (mehr).' });
    return;
  }
  const review = await db.collection<ReviewDoc>('reviews').findOne({
    _id: requireObjectId(ticket.reviewId, 'Bewertungs-ID'),
  });
  if (!review) {
    res.status(404).json({ error: 'Bewertung wurde nicht gefunden.' });
    return;
  }

  const [brandDoc, branch] = await Promise.all([
    db.collection<BrandDoc>('settings').findOne({ _id: 'brand' }),
    db.collection<Branch>('branches').findOne({ _id: new ObjectId(review.branchId) }),
  ]);
  const brandName = brandDoc?.name ?? 'unser Restaurant';
  const mapsUrl = mapsUrlFor(brandName, branch);

  if (review.reviewText) {
    res.json({ text: review.reviewText, mapsUrl, source: 'cache' });
    return;
  }

  const dishDocs = await db.collection<DishDoc>('dishes').find({
    _id: { $in: review.dishRatings.map(d => new ObjectId(d.dishId)) },
  }).toArray();
  const nameOf = (id: string) => dishDocs.find(d => String(d._id) === id)?.name ?? 'Gericht';

  // Das Ticket bleibt die eigentliche Berechtigung zum Erzeugen; ob der Gast
  // nebenbei angemeldet ist, entscheidet nur, wessen Schlüssel dafür bezahlt.
  const guestAccount = await currentGuest(req);
  const apiKey = guestAccount?.apiKeyEnc ? decryptApiKey(guestAccount.apiKeyEnc) : null;

  const result = await generateReviewText({
    restaurantName: brandName,
    branchName: branch?.name ?? null,
    dishes: review.dishRatings.map(d => ({ name: nameOf(d.dishId), stars: d.stars, note: d.note })),
    overall: review.overall,
  }, apiKey);

  await db.collection<ReviewDoc>('reviews').updateOne(
    { _id: review._id }, { $set: { reviewText: result.text } }
  );
  res.json({ text: result.text, mapsUrl, source: result.source });
});

/**
 * Gast: eigenes Konto löschen. Wer ein Konto anlegen kann, muss es auch wieder
 * loswerden können — samt Punkten. Abgegebene Bewertungen bleiben: sie hängen
 * am Tisch, nicht am Gast, und sind für das Restaurant die eigentliche Substanz.
 */
router.delete('/guest/me', async (req: OrgRequest, res) => {
  const guest = await currentGuest(req);
  if (!guest) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  // Altbestand aus der Zeit der 60-Sekunden-Frist abräumen: eine 'offen'e
  // Einlösung wartet auf eine Quittung, die es für ein gelöschtes Konto nicht
  // mehr geben soll.
  //
  // Entwertete Gutscheine bleiben dagegen stehen. Sie sind bezahlt — die Punkte
  // waren mit dem Wischen weg —, und das Personal soll sie noch ausgeben und
  // eintragen können, auch wenn der Gast sein Konto in der Zwischenzeit löscht.
  await req.db!.collection<RedemptionDoc>('redemptions').updateMany(
    { guestId: String(guest._id), status: 'offen' },
    { $set: { status: 'abgebrochen' } }
  );
  await req.db!.collection<GuestDoc>('guests').deleteOne({ _id: guest._id });
  res.json({ ok: true });
});

/**
 * Gast: eigenen Anthropic-Key hinterlegen. Er treibt danach den automatischen
 * Rezensionstext an, statt der gemeinsamen bzw. der Vorlagen-Antwort — siehe
 * CLAUDE.md, "KI-Funktionen". Verschlüsselt gespeichert (secrets.ts), der
 * Klartext geht nie in eine Antwort zurück.
 */
router.put('/guest/me/api-key', async (req: OrgRequest, res) => {
  const guest = await currentGuest(req);
  if (!guest) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  if (!canEncryptApiKeys()) {
    res.status(503).json({ error: 'Eigene API-Schlüssel sind auf diesem Server nicht eingerichtet.' });
    return;
  }
  const apiKey = requireText(req.body?.apiKey, 'API-Schlüssel', 200);
  if (apiKey.length < 20) {
    res.status(400).json({ error: 'Das sieht nicht nach einem gültigen API-Schlüssel aus.' });
    return;
  }
  const apiKeyEnc = encryptApiKey(apiKey);
  await req.db!.collection<GuestDoc>('guests').updateOne({ _id: guest._id }, { $set: { apiKeyEnc } });
  res.json({ guest: serializeGuest({ ...guest, apiKeyEnc }) });
});

router.delete('/guest/me/api-key', async (req: OrgRequest, res) => {
  const guest = await currentGuest(req);
  if (!guest) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  await req.db!.collection<GuestDoc>('guests').updateOne({ _id: guest._id }, { $set: { apiKeyEnc: null } });
  res.json({ guest: serializeGuest({ ...guest, apiKeyEnc: null }) });
});

/**
 * Personal: Anmeldung mit Google.
 *
 * Der entscheidende Unterschied zum Gast: hier entsteht NIE ein Konto. Wer sich
 * anmeldet, muss schon eingeladen sein — gesucht wird über Googles Konto-ID
 * oder die E-Mail, und ohne aktives Konto bleibt es bei einer Absage. Sonst
 * wäre jede Google-Adresse der Welt ein Zugang zur Verwaltung eines fremden
 * Betriebs.
 *
 * Google beweist nur, wer vor dem Gerät sitzt. Welche Rechte daraus folgen,
 * steht weiterhin im Konto (`role`, `branchId`), und das Token stellen wir aus.
 */
router.post('/auth/google', async (req: OrgRequest, res) => {
  if (!googleClientId()) {
    res.status(503).json({ error: 'Google-Anmeldung ist auf diesem Server nicht eingerichtet.' });
    return;
  }
  const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
  if (!credential) {
    res.status(400).json({ error: 'Es wurde kein Google-Token übergeben.' });
    return;
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(credential);
  } catch (err) {
    // Der Grund gehört ins Log, nicht in die Antwort.
    console.warn('Google-Anmeldung (Personal) abgelehnt:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Die Google-Anmeldung hat nicht geklappt. Bitte erneut versuchen.' });
    return;
  }

  const users = req.db!.collection<UserDoc>('users');
  const user = await users.findOne({ $or: [{ googleSub: identity.sub }, { email: identity.email }] });
  if (!user || user.status !== 'aktiv') {
    // Absichtlich derselbe Satz für "kein Konto" und "gesperrt": wer hier
    // Adressen durchprobiert, soll nicht erfahren, welche davon existieren.
    res.status(403).json({
      error: `Für ${identity.email} gibt es hier kein aktives Mitarbeiterkonto. Bitte von der Verwaltung einladen lassen.`,
    });
    return;
  }

  // Beim ersten Mal die Konto-ID nachtragen — danach greift der Weg über sub,
  // und eine geänderte E-Mail bei Google wirft niemanden mehr hinaus.
  if (!user.googleSub) {
    await users.updateOne({ _id: user._id }, { $set: { googleSub: identity.sub } });
  }

  const token = signToken({
    sub: String(user._id), orgSlug: req.params.orgSlug!, role: user.role, branchId: user.branchId,
  });
  res.json({ token, user: serializeUser({ ...user, googleSub: identity.sub }) });
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

/**
 * Rolle und Filiale eines bestehenden Kontos ändern.
 *
 * Bis hierher war die Rolle mit dem Anlegen zementiert: wer als Kellner
 * eingeladen wurde, blieb einer — es sei denn, jemand löschte das Konto und
 * legte es neu an. Damit verlor es aber seine Kennung (die ID hängt an
 * Alarmen und Einlösungen), und das Passwort war auch weg.
 *
 * Bewusst `chainAdmin`: Rollen zu vergeben ist Ketten-Sache. Dürfte eine
 * Filialleitung sie ändern, könnte sie einen ihrer Kellner zum Admin machen
 * und über dessen Konto alles tun — die Grenze bei POST /users wäre dann eine
 * Umleitung, kein Zaun.
 */
router.patch('/users/:id', chainAdmin(async (req: OrgRequest, res) => {
  const actor = req.user!;
  const id = requireObjectId(req.params.id, 'Benutzer-ID');
  const target = await req.db!.collection<UserDoc>('users').findOne({ _id: id });
  if (!target) {
    res.status(404).json({ error: 'Benutzer wurde nicht gefunden.' });
    return;
  }

  const update: Partial<UserDoc> = {};

  if (req.body?.role !== undefined) {
    const role = req.body.role;
    if (role !== 'Admin' && role !== 'Manager' && role !== 'Kellner') {
      throw new HttpError(400, 'Rolle muss Admin, Manager oder Kellner sein.');
    }
    // Sich selbst herabzustufen ist der kürzeste Weg, sich auszusperren: nach
    // dem Speichern gilt das neue Recht sofort, und die Seite, auf der man
    // steht, gehört einem nicht mehr.
    if (String(id) === actor.sub && role !== actor.role) {
      res.status(400).json({ error: 'Die eigene Rolle kann nicht geändert werden.' });
      return;
    }
    // Wie beim Löschen: der letzte Admin muss stehen bleiben, sonst kommt
    // niemand mehr in die Verwaltung.
    if (target.role === 'Admin' && role !== 'Admin') {
      const admins = await req.db!.collection('users').countDocuments({ role: 'Admin' });
      if (admins <= 1) {
        res.status(400).json({ error: 'Der letzte Admin kann nicht herabgestuft werden.' });
        return;
      }
    }
    update.role = role;
  }

  if (req.body?.branchId !== undefined) {
    update.branchId = req.body.branchId
      ? String(requireObjectId(req.body.branchId, 'Filial-ID'))
      : null;
  }

  if (req.body?.name !== undefined) update.name = requireText(req.body.name, 'Name', 120);

  if (Object.keys(update).length > 0) {
    await req.db!.collection<UserDoc>('users').updateOne({ _id: id }, { $set: update });
  }
  res.json(await stateFor(req));
}));

/**
 * Passwort eines Mitarbeiterkontos setzen — und es damit freischalten.
 *
 * Ohne das war eine Einladung eine Sackgasse: `passwordHash: null` heißt
 * "kann sich nicht anmelden", und vergeben konnte es nur das Skript auf dem
 * Server. Wer die Einladung ausspricht, muss auch das erste Passwort geben
 * können — sonst wartet der Eingeladene auf eine E-Mail, die dieses Projekt
 * gar nicht verschickt.
 *
 * Dieselben Grenzen wie beim Anlegen und Löschen: eine Filialleitung kommt nur
 * an ihre eigenen Servicekräfte. Sonst könnte sie sich über das Passwort eines
 * Admin-Kontos selbst befördern.
 */
router.put('/users/:id/password', branchAdmin(async (req: OrgRequest, res) => {
  const actor = req.user!;
  const id = requireObjectId(req.params.id, 'Benutzer-ID');
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 8) {
    res.status(400).json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' });
    return;
  }

  const target = await req.db!.collection<UserDoc>('users').findOne({ _id: id });
  if (!target) {
    res.status(404).json({ error: 'Benutzer wurde nicht gefunden.' });
    return;
  }
  if (actor.role !== 'Admin' && (target.role !== 'Kellner' || target.branchId !== actor.branchId)) {
    res.status(403).json({ error: 'Du kannst nur Servicekräfte deiner eigenen Filiale freischalten.' });
    return;
  }

  // 'aktiv' mitsetzen: ein eingeladenes Konto mit Passwort, das sich trotzdem
  // nicht anmelden darf, wäre für niemanden nachvollziehbar.
  await req.db!.collection<UserDoc>('users').updateOne(
    { _id: id },
    { $set: { passwordHash: hashPassword(password), status: 'aktiv' } }
  );
  res.json(await stateFor(req));
}));

// ── Admin: Branding-Einstellungen (inkl. Design-Studio: Logo, Schrift, Karten-Layout) ──
// #rrggbb oder leer (= zurücksetzen auf die Vorgabefarben). Alles andere fällt
// still auf null zurück, statt einen unbrauchbaren Wert in die Anzeige zu lassen.
const asHexOrNull = (v: unknown): string | null =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;

router.patch('/settings/brand', chainAdmin(async (req: OrgRequest, res) => {
  const { name, accent, logo, logoImage, coverImage, font, cardStyle, guestTheme,
    guestNameColor, guestTextColor, coverOpacity, guestLang, weakRatingColor } = req.body ?? {};
  const update: Partial<BrandDoc> = {};
  if (name !== undefined) update.name = name;
  if (accent !== undefined) update.accent = accent;
  if (logo !== undefined) update.logo = logo;
  if (logoImage !== undefined) update.logoImage = logoImage;
  if (coverImage !== undefined) update.coverImage = coverImage;
  if (font !== undefined) update.font = font;
  if (cardStyle !== undefined) update.cardStyle = cardStyle;
  if (guestTheme === 'hell' || guestTheme === 'dunkel') update.guestTheme = guestTheme;
  if (guestLang === 'de' || guestLang === 'en') update.guestLang = guestLang;
  if (guestNameColor !== undefined) update.guestNameColor = asHexOrNull(guestNameColor);
  if (guestTextColor !== undefined) update.guestTextColor = asHexOrNull(guestTextColor);
  if (weakRatingColor !== undefined) update.weakRatingColor = asHexOrNull(weakRatingColor);
  if (coverOpacity !== undefined) {
    // 0–1, sonst zurück auf null (= voll). Unter 0,1 wäre das Bild praktisch weg.
    const n = Number(coverOpacity);
    update.coverOpacity = Number.isFinite(n) && n >= 0.1 && n < 1 ? Math.round(n * 100) / 100 : null;
  }
  await req.db!.collection<BrandDoc>('settings').updateOne({ _id: 'brand' }, { $set: update }, { upsert: true });
  res.json(await stateFor(req));
}));

/**
 * Welche Dashboard-Kacheln ausgeblendet sind. Die Filialleitung sieht dasselbe
 * Dashboard und darf es deshalb auch einrichten (branchAdmin).
 *
 * Die Liste kommt vom Client und wandert unverändert in die Datenbank —
 * deshalb begrenzt: Anzahl und Länge der Kennungen. Es sind die IDs der
 * Kacheln, keine freien Texte.
 */
router.patch('/settings/dashboard', branchAdmin(async (req: OrgRequest, res) => {
  const raw = req.body?.hiddenWidgets;
  if (!Array.isArray(raw) || raw.length > 40) {
    throw new HttpError(400, 'hiddenWidgets muss eine Liste mit höchstens 40 Einträgen sein.');
  }
  const hiddenWidgets = raw.map(v => requireText(v, 'Kachel-Kennung', 40));
  await req.db!.collection<DashboardDoc>('settings').updateOne(
    { _id: 'dashboard' }, { $set: { hiddenWidgets } }, { upsert: true }
  );
  res.json(await stateFor(req));
}));

// ═══════════════════════════════════════════════════════════
// DASHBOARD-AUSWERTUNG
//
// Warum eine eigene Route und nicht der Gesamtzustand: der trägt nur die
// letzten REVIEW_PAGE_SIZE Bewertungen. Für einen Verlauf über Wochen und für
// einen Zeitraumfilter reicht das nicht — und umgekehrt gehört diese Rechnerei
// nicht in jeden Seitenaufruf des Gastes.
// ═══════════════════════════════════════════════════════════

/** Nach einem Tag ist der Wochenrückblick von gestern. Dann wird neu geschrieben. */
const HIGHLIGHT_TTL_MS = 24 * 60 * 60 * 1000;

/** Obergrenze für einen Auswertungslauf. Darüber wird der Zeitraum eingegrenzt. */
const INSIGHT_REVIEW_CAP = 5000;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Wie fein der Verlauf aufgelöst wird.
 *
 * Feste Wochen waren für kurze Zeiträume die falsche Einheit: "letzte 7 Tage"
 * ergab EINEN Balken, "letzte 30 Tage" vier oder fünf — ein Diagramm, das aus
 * der Ferne wie ein Fehler aussieht. Die Einheit richtet sich deshalb nach der
 * Länge des Zeitraums, nicht nach dem Kalender.
 */
export type TrendUnit = 'day' | 'week' | 'month';

function trendUnitFor(spanMs: number): TrendUnit {
  if (spanMs <= 35 * DAY_MS) return 'day';
  if (spanMs <= 400 * DAY_MS) return 'week';
  return 'month';
}

/** Anfang des Kübels, in dem `ts` liegt — Wochen beginnen am Montag. */
function bucketStart(ts: number, unit: TrendUnit): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Montag = 0
  if (unit === 'month') d.setDate(1);
  return d.getTime();
}

/**
 * Der nächste Kübel. Bewusst über `Date` und nicht über eine Addition in
 * Millisekunden: bei der Zeitumstellung hat ein Tag 23 oder 25 Stunden, und
 * Monate haben ohnehin keine feste Länge.
 */
function nextBucket(ts: number, unit: TrendUnit): number {
  const d = new Date(ts);
  if (unit === 'day') d.setDate(d.getDate() + 1);
  else if (unit === 'week') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

/** Notbremse gegen eine Endlosschleife bei kaputten Zeitstempeln. */
const MAX_TREND_POINTS = 500;

function optionalDate(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  const ts = Date.parse(String(value));
  if (!Number.isFinite(ts)) throw new HttpError(400, `${field} ist kein gültiges Datum.`);
  return ts;
}

interface DishStat { id: string; name: string; sum: number; count: number }

/**
 * Alles, was das Dashboard über einen Zeitraum wissen muss, in einem Durchgang
 * über die Bewertungen.
 *
 * Die Reichweite kommt wie überall aus scopeOf() — und die schlägt jeden
 * Filter: ein Konto mit Filialbindung sieht seine Filiale, egal was in der
 * Anfrage steht. `branches` ist deshalb nur für den Ketten-Admin von Belang,
 * der mehrere Standorte nebeneinander betrachten will; `null` heißt „alle".
 */
async function collectInsights(
  req: OrgRequest,
  from: number | null,
  to: number | null,
  branches: string[] | null = null,
) {
  const db = req.db!;
  const scope = scopeOf(req);
  const branchIds = scope ? [scope] : (branches && branches.length > 0 ? branches : null);

  const filter: Record<string, unknown> = branchIds ? { branchId: { $in: branchIds } } : {};
  if (from !== null || to !== null) {
    filter.createdAt = {
      ...(from !== null ? { $gte: from } : {}),
      ...(to !== null ? { $lte: to } : {}),
    };
  }

  const [reviews, dishDocs, orders] = await Promise.all([
    db.collection<ReviewDoc>('reviews').find(filter).sort({ createdAt: -1 }).limit(INSIGHT_REVIEW_CAP).toArray(),
    db.collection<DishDoc>('dishes').find({}).toArray(),
    // Gebuchte Bestellungen im selben Zeitraum. Sie stehen neben den
    // Bewertungen, weil erst das Verhältnis der beiden etwas sagt: 40
    // Bewertungen sind viel bei 60 Bestellungen und wenig bei 600.
    db.collection<OrderDoc>('orders').countDocuments(filter),
  ]);
  const nameOf = (id: string) => dishDocs.find(d => String(d._id) === id)?.name ?? 'Gelöschtes Gericht';

  const byDish = new Map<string, DishStat>();
  // Die Einheit des Verlaufs steht fest, bevor der erste Kübel entsteht: sie
  // hängt am angefragten Zeitraum, nicht an den Daten. Fehlt eine Grenze, gilt
  // die älteste Bewertung bzw. jetzt.
  const oldest = reviews.length > 0 ? Math.min(...reviews.map(r => r.createdAt)) : Date.now();
  const spanFrom = from ?? oldest;
  const spanTo = to ?? Date.now();
  const trendUnit = trendUnitFor(Math.max(0, spanTo - spanFrom));
  const byBucket = new Map<number, { sum: number; ratings: number; reviews: number }>();
  const overall = { service: 0, ambience: 0, speed: 0, count: 0 };
  let sum = 0;
  let ratings = 0;

  for (const rv of reviews) {
    const bucket = byBucket.get(bucketStart(rv.createdAt, trendUnit)) ?? { sum: 0, ratings: 0, reviews: 0 };
    bucket.reviews += 1;
    for (const r of rv.dishRatings) {
      if (r.stars <= 0) continue;
      sum += r.stars;
      ratings += 1;
      bucket.sum += r.stars;
      bucket.ratings += 1;
      const stat = byDish.get(r.dishId) ?? { id: r.dishId, name: nameOf(r.dishId), sum: 0, count: 0 };
      stat.sum += r.stars;
      stat.count += 1;
      byDish.set(r.dishId, stat);
    }
    byBucket.set(bucketStart(rv.createdAt, trendUnit), bucket);
    if (rv.overall.service > 0) {
      overall.service += rv.overall.service;
      overall.ambience += rv.overall.ambience;
      overall.speed += rv.overall.speed;
      overall.count += 1;
    }
  }

  const dishes = [...byDish.values()]
    .map(d => ({ id: d.id, name: d.name, avg: d.sum / d.count, count: d.count }))
    .sort((a, b) => b.avg - a.avg);

  /**
   * Der Verlauf, LÜCKENLOS. Vorher entstanden Kübel nur dort, wo auch
   * Bewertungen lagen: eine Woche ohne Feedback fiel aus dem Diagramm, und
   * zwei Balken nebeneinander taten so, als lägen sie nebeneinander in der
   * Zeit. Ein leerer Kübel ist eine Aussage — er heißt „nichts gekommen".
   */
  const trend: { start: number; reviews: number; avg: number }[] = [];
  if (reviews.length > 0) {
    const last = bucketStart(spanTo, trendUnit);
    let t = bucketStart(spanFrom, trendUnit);
    for (let i = 0; t <= last && i < MAX_TREND_POINTS; i += 1, t = nextBucket(t, trendUnit)) {
      const b = byBucket.get(t);
      trend.push({ start: t, reviews: b?.reviews ?? 0, avg: b && b.ratings > 0 ? b.sum / b.ratings : 0 });
    }
  }

  return {
    range: { from, to },
    totals: {
      reviews: reviews.length,
      ratings,
      orders,
      avg: ratings > 0 ? sum / ratings : 0,
      capped: reviews.length >= INSIGHT_REVIEW_CAP,
    },
    overall: overall.count === 0 ? null : {
      service: overall.service / overall.count,
      ambience: overall.ambience / overall.count,
      speed: overall.speed / overall.count,
      count: overall.count,
    },
    trend,
    trendUnit,
    dishes,
  };
}

/** Unter welchem Schlüssel der Rückblick dieser Reichweite liegt. */
function highlightKey(req: OrgRequest): string {
  return scopeOf(req) ?? 'all';
}

async function storedHighlight(req: OrgRequest) {
  const doc = await req.db!.collection<InsightsDoc>('settings').findOne({ _id: 'insights' });
  const entry = doc?.highlights?.[highlightKey(req)];
  if (!entry) return null;
  return { ...entry, stale: Date.now() - entry.generatedAt > HIGHLIGHT_TTL_MS };
}

/**
 * `?branches=a,b` — mehrere Filialen nebeneinander auswerten.
 *
 * Geprüft wird jede ID: eine unbrauchbare fliegt raus, statt als Zeichenkette
 * in den Filter zu wandern. Für ein filialgebundenes Konto ist der Parameter
 * ohne Wirkung, siehe collectInsights.
 */
function branchFilterOf(req: OrgRequest): string[] | null {
  const raw = req.query.branches;
  if (raw == null || raw === '' || raw === 'all') return null;
  const ids = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  return ids.map(id => String(requireObjectId(id, 'Filial-ID')));
}

router.get('/insights', branchAdmin(async (req: OrgRequest, res) => {
  const from = optionalDate(req.query.from, 'Von-Datum');
  const to = optionalDate(req.query.to, 'Bis-Datum');
  const insights = await collectInsights(req, from, to, branchFilterOf(req));
  const apiKey = await callerApiKey(req);
  res.json({ ...insights, highlight: await storedHighlight(req), aiAvailable: hasClaude(apiKey) });
}));

/**
 * Den Wochenrückblick schreiben lassen. Getrennt von GET /insights, weil ein
 * Modellaufruf Sekunden dauert — das Dashboard soll sofort stehen und den Text
 * nachreichen. Ist der gespeicherte noch keinen Tag alt, wird er
 * zurückgegeben statt neu erzeugt: ein Rückblick, der sich bei jedem Neuladen
 * ändert, liest sich wie ein Zufallstext (und kostet jedes Mal).
 */
router.post('/insights/highlight', branchAdmin(async (req: OrgRequest, res) => {
  const db = req.db!;
  const existing = await storedHighlight(req);
  if (existing && !existing.stale) {
    res.json({ highlight: existing });
    return;
  }

  const now = Date.now();
  const [thisWeek, lastWeek, brandDoc] = await Promise.all([
    collectInsights(req, now - WEEK_MS, now),
    collectInsights(req, now - 2 * WEEK_MS, now - WEEK_MS),
    db.collection<BrandDoc>('settings').findOne({ _id: 'brand' }),
  ]);

  const branchId = scopeOf(req);
  const branch = branchId
    ? await db.collection<Branch>('branches').findOne({ _id: new ObjectId(branchId) })
    : null;

  // Nur Gerichte mit mindestens zwei Bewertungen taugen für eine Aussage;
  // ein einzelner Stern ist Zufall, keine Tendenz.
  const solid = thisWeek.dishes.filter(d => d.count >= 2);
  const notes = await db.collection<ReviewDoc>('reviews')
    .find({ ...(branchId ? { branchId } : {}), createdAt: { $gte: now - WEEK_MS } })
    .sort({ createdAt: -1 }).limit(60).toArray();
  const dishDocs = await db.collection<DishDoc>('dishes').find({}).toArray();
  const nameOf = (id: string) => dishDocs.find(d => String(d._id) === id)?.name ?? 'Gericht';

  const input: HighlightInput = {
    restaurantName: brandDoc?.name ?? 'Das Restaurant',
    scopeName: branch?.name ?? 'alle Filialen',
    current: { reviews: thisWeek.totals.reviews, avg: thisWeek.totals.avg },
    previous: { reviews: lastWeek.totals.reviews, avg: lastWeek.totals.avg },
    best: solid.slice(0, 5),
    worst: [...solid].reverse().slice(0, 5),
    notes: notes.flatMap(rv => rv.dishRatings
      .filter(d => d.note)
      .map(d => ({ dish: nameOf(d.dishId), stars: d.stars, note: d.note!.slice(0, 240) }))
    ).slice(0, 40),
  };

  const apiKey = await callerApiKey(req);
  const result = await generateHighlight(input, apiKey);
  const entry = {
    text: result.text, generatedAt: now, source: result.source,
    reviewCount: thisWeek.totals.reviews,
  };
  await db.collection<InsightsDoc>('settings').updateOne(
    { _id: 'insights' },
    { $set: { [`highlights.${highlightKey(req)}`]: entry } },
    { upsert: true }
  );
  res.json({ highlight: { ...entry, stale: false } });
}));

/**
 * Servicekraft: Gerichte vom Foto eines POS-Bons erkennen lassen.
 *
 * Schreibt nichts — die Erkennung ist ein Vorschlag, den die Servicekraft in
 * ihrem Warenkorb prüft und selbst bucht. Alles andere wäre eine Bestellung,
 * die niemand bestätigt hat.
 */
router.post('/branches/:branchSlug/scan-receipt', staffOrAdmin(withBranch(async (req: OrgRequest, res) => {
  const image = req.body?.image;
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    throw new HttpError(400, 'Es wurde kein Bild übergeben.');
  }
  const apiKey = await callerApiKey(req);
  if (!hasClaude(apiKey)) {
    res.status(503).json({ error: 'Der Bon-Scan ist auf diesem Server nicht eingerichtet (kein API-Schlüssel hinterlegt).' });
    return;
  }

  // Nur die Karte DIESER Filiale — sonst schlägt der Scan Gerichte vor, die
  // hier gar nicht geführt werden und beim Buchen abgelehnt würden.
  const branchId = String(req.branch!._id);
  const dishes = await req.db!.collection<DishDoc>('dishes')
    .find({ $or: [{ branchIds: null }, { branchIds: branchId }] }).toArray();

  const hits = await scanReceipt(image, dishes.map(d => ({
    id: String(d._id), name: d.name, price: d.price,
  })), apiKey);
  if (hits === null) {
    res.status(502).json({ error: 'Der Bon konnte nicht gelesen werden. Bitte noch einmal fotografieren.' });
    return;
  }
  res.json({ items: hits });
})));

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
  // Aus den Einlöse-Listen ALLER Gäste nehmen, damit dort keine toten IDs
  // bleiben — ein gelöschter Gutschein soll niemandem einen Platz blockieren.
  await db.collection<GuestDoc>('guests').updateMany(
    { redeemed: String(id) }, { $pull: { redeemed: String(id) } }
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
    googleMapsUrl: optionalText(req.body?.googleMapsUrl, 'Google-Maps-Link', 400) ?? null,
    coverImage: optionalImage(req.body?.coverImage) ?? null,
  });
  res.json(await stateFor(req));
}));

router.patch('/branches/:id', chainAdmin(async (req: OrgRequest, res) => {
  const db = req.db!;
  const update: Record<string, unknown> = {};
  if (req.body?.name !== undefined) update.name = requireText(req.body.name, 'Name', 80);
  if (req.body?.address !== undefined) update.address = requireText(req.body.address, 'Adresse', 160);
  if (req.body?.googleMapsUrl !== undefined) {
    update.googleMapsUrl = optionalText(req.body.googleMapsUrl, 'Google-Maps-Link', 400) ?? null;
  }
  if (req.body?.coverImage !== undefined) {
    update.coverImage = optionalImage(req.body.coverImage) ?? null;
  }
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
