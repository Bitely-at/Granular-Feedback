import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ObjectId, type Db, type WithId, type Document } from 'mongodb';
import { platformDb, orgDbBySlug, connectionSummary, explainDbError } from './db.js';
import type {
  Organization, BrandDoc, GuestProfileDoc, DishRatingInput,
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

function serialize<T extends WithId<Document>>(doc: T) {
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}

type RouteHandler = (req: OrgRequest, res: Response, next: NextFunction) => unknown;

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

async function getFullState(db: Db) {
  const [brandDoc, branches, dishes, tables, vouchers, users, alerts, reviews, guestDoc] = await Promise.all([
    db.collection<BrandDoc>('settings').findOne({ _id: 'brand' }),
    db.collection('branches').find().toArray(),
    db.collection('dishes').find().toArray(),
    db.collection('tables').find().toArray(),
    db.collection('vouchers').find().toArray(),
    db.collection('users').find().toArray(),
    db.collection('alerts').find().sort({ createdAt: -1 }).toArray(),
    // Begrenzt: der Gesamtzustand wird bei jedem Seitenaufruf geladen, und die
    // Rezensionen wachsen als einzige Collection unbegrenzt mit.
    db.collection('reviews').find().sort({ createdAt: -1 }).limit(REVIEW_PAGE_SIZE).toArray(),
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
    dishes: dishes.map(serialize),
    tables: tables.map(serialize),
    vouchers: vouchers.map(serialize),
    users: users.map(serialize),
    alerts: alerts.map(serialize),
    reviews: reviews.map(serialize),
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

// ── Gesamtzustand einer Organisation (ein Aufruf pro Seitenladung) ──
router.get('/state', async (req: OrgRequest, res) => {
  res.json(await getFullState(req.db!));
});

// ── Tisch per Nummer holen (für QR-Route /:orgSlug/table/:number) ──
router.get('/tables/:number', async (req: OrgRequest, res) => {
  const table = await req.db!.collection('tables').findOne({ number: Number(req.params.number) });
  if (!table) {
    res.status(404).json({ error: `Tisch ${req.params.number} wurde nicht gefunden.` });
    return;
  }
  res.json(serialize(table));
});

// ── Admin: neue Tische anlegen (damit eigene QR-Codes generiert werden können) ──
router.post('/tables', async (req: OrgRequest, res) => {
  const db = req.db!;
  const count = Math.max(1, Math.min(50, Number(req.body?.count) || 1));
  // Ohne Angabe landen neue Tische in der ersten Filiale — so verhält sich die
  // Route wie vor der Filialverwaltung.
  const branch = req.body?.branchId
    ? await db.collection('branches').findOne({ _id: requireObjectId(req.body.branchId, 'Filial-ID') })
    : await db.collection('branches').findOne({});
  if (!branch) {
    res.status(400).json({ error: 'Es existiert noch keine Filiale für diese Organisation.' });
    return;
  }
  const existing = await db.collection('tables').find().sort({ number: -1 }).limit(1).toArray();
  const nextNumber = (existing[0]?.number ?? 0) + 1;
  const newTables = Array.from({ length: count }, (_, i) => ({
    branchId: String(branch._id), number: nextNumber + i,
    status: 'frei' as const, items: [], openedAt: null,
  }));
  await db.collection('tables').insertMany(newTables);
  res.json(await getFullState(db));
});

// ── Admin: Tisch (und damit seinen QR-Code) wieder entfernen ──
router.delete('/tables/:id', async (req: OrgRequest, res) => {
  await req.db!.collection('tables').deleteOne({ _id: requireObjectId(req.params.id, 'Tisch-ID') });
  res.json(await getFullState(req.db!));
});

// ── Kellner: Bestellung für einen Tisch speichern ──
router.post('/tables/:number/order', async (req: OrgRequest, res, next) => {
  try {
    const number = requireTableNumber(req.params.number);
    const cartRaw = (req.body?.cart ?? {}) as Record<string, unknown>;
    const cart: Record<string, number> = {};
    for (const [dishId, qty] of Object.entries(cartRaw)) {
      requireObjectId(dishId, 'dishId');
      cart[dishId] = requireQty(qty);
    }
    const table = await req.db!.collection('tables').findOne({ number });
    if (!table) {
      res.status(404).json({ error: `Tisch ${number} wurde nicht gefunden.` });
      return;
    }
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
    res.json(await getFullState(req.db!));
  } catch (err) {
    next(err);
  }
});

// ── Kellner: Tisch schließen und wieder freigeben ──
// Gegenstück zum Buchen: räumt die laufende Bestellung ab und stellt den Tisch
// auf 'frei'. Bewusst idempotent — ein zweiter Aufruf ist kein Fehler.
router.post('/tables/:number/close', async (req: OrgRequest, res, next) => {
  try {
    const number = Number(req.params.number);
    const table = await req.db!.collection('tables').findOne({ number });
    if (!table) {
      res.status(404).json({ error: `Tisch ${number} wurde nicht gefunden.` });
      return;
    }
    await req.db!.collection('tables').updateOne(
      { _id: table._id },
      { $set: { status: 'frei', items: [], orderId: null, openedAt: null } }
    );
    res.json(await getFullState(req.db!));
  } catch (err) {
    next(err);
  }
});

// ── Gast: einzelnes Gericht nachträglich zum Tisch hinzufügen ("Etwas vergessen?") ──
router.post('/tables/:number/items', async (req: OrgRequest, res, next) => {
  try {
    const number = requireTableNumber(req.params.number);
    requireObjectId(req.body?.dishId, 'dishId');
    const dishId = String(req.body.dishId);
    const qty = requireQty(req.body?.qty);
    const table = await req.db!.collection('tables').findOne({ number });
    if (!table) {
      res.status(404).json({ error: `Tisch ${number} wurde nicht gefunden.` });
      return;
    }
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
    res.json(await getFullState(req.db!));
  } catch (err) {
    next(err);
  }
});

// ── Gast: Bewertung für einen Tisch abschicken ──
router.post('/tables/:number/review', async (req: OrgRequest, res, next) => {
  try {
    const number = requireTableNumber(req.params.number);
    const dishRatings = sanitizeDishRatings(req.body?.dishRatings ?? []);
    const overall = sanitizeOverall(req.body?.overall);
    const db = req.db!;

    const table = await db.collection('tables').findOne({ number });
    if (!table) {
      res.status(404).json({ error: `Tisch ${number} wurde nicht gefunden.` });
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

    for (const r of dishRatings) {
      if (r.stars <= 0) continue;
      await db.collection('dishes').updateOne(
        { _id: new ObjectId(r.dishId) },
        { $inc: { ratingsSum: r.stars, ratingsCount: 1 } }
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

    const state = await getFullState(db);
    res.json({ ...state, pointsEarned });
  } catch (err) {
    next(err);
  }
});

// ── Gast: Gutschein einlösen ──
router.post('/vouchers/:id/redeem', async (req: OrgRequest, res) => {
  const db = req.db!;
  const voucher = await db.collection('vouchers').findOne({ _id: requireObjectId(req.params.id, 'Gutschein-ID') });
  const guest = await db.collection<GuestProfileDoc>('guestProfile').findOne({ _id: 'default' });
  if (!voucher) {
    res.status(404).json({ error: 'Gutschein wurde nicht gefunden.' });
    return;
  }
  const points = guest?.points ?? 0;
  const redeemed = guest?.redeemed ?? [];
  if (redeemed.includes(req.params.id)) {
    res.status(409).json({ error: 'Dieser Gutschein wurde bereits eingelöst.' });
    return;
  }
  if (points < voucher.points) {
    res.status(400).json({ error: 'Nicht genug Punkte für diesen Gutschein.' });
    return;
  }
  await db.collection<GuestProfileDoc>('guestProfile').updateOne(
    { _id: 'default' },
    { $inc: { points: -voucher.points }, $push: { redeemed: req.params.id } },
    { upsert: true }
  );
  res.json(await getFullState(db));
});

// ── Gast: Demo-Login (kein echtes Auth-System — bewusst nicht Teil des Produkts) ──
router.post('/guest/login', async (req: OrgRequest, res) => {
  await req.db!.collection<GuestProfileDoc>('guestProfile').updateOne(
    { _id: 'default' }, { $set: { loggedIn: true } }, { upsert: true }
  );
  res.json(await getFullState(req.db!));
});

// ── Kellner: Alarm-Banner (Bewertung < 3 Sterne) als erledigt markieren ──
router.post('/alerts/:id/resolve', async (req: OrgRequest, res) => {
  await req.db!.collection('alerts').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { resolved: true } }
  );
  res.json(await getFullState(req.db!));
});

// ── Admin: Benutzer verwalten ──
router.post('/users', async (req: OrgRequest, res) => {
  const { name, email, role, branchId = null, status = 'eingeladen' } = req.body ?? {};
  await req.db!.collection('users').insertOne({ name, email, role, branchId, status });
  res.json(await getFullState(req.db!));
});

router.delete('/users/:id', async (req: OrgRequest, res) => {
  await req.db!.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json(await getFullState(req.db!));
});

// ── Admin: Branding-Einstellungen (inkl. Design-Studio: Logo, Schrift, Karten-Layout) ──
router.patch('/settings/brand', async (req: OrgRequest, res) => {
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
  res.json(await getFullState(req.db!));
});

// ── Admin: Gerichtsfoto ersetzen ──
router.patch('/dishes/:id/image', async (req: OrgRequest, res) => {
  const { img } = req.body ?? {};
  if (typeof img !== 'string' || !img.startsWith('data:image/')) {
    res.status(400).json({ error: 'Ungültiges Bild.' });
    return;
  }
  await req.db!.collection('dishes').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { img } });
  res.json(await getFullState(req.db!));
});

// ── Admin: Menüverwaltung ──
// Neue Gerichte starten ohne Bewertungen; ratingsSum/ratingsCount wachsen
// ausschließlich über abgegebene Bewertungen.
router.post('/dishes', async (req: OrgRequest, res) => {
  const db = req.db!;
  await db.collection('dishes').insertOne({
    name: requireText(req.body?.name, 'Name', 80),
    price: requirePrice(req.body?.price),
    cat: requireCategory(req.body?.cat),
    img: optionalImage(req.body?.img) ?? IMAGE_PLACEHOLDER,
    ratingsSum: 0,
    ratingsCount: 0,
  });
  res.json(await getFullState(db));
});

router.patch('/dishes/:id', async (req: OrgRequest, res) => {
  const db = req.db!;
  const update: Record<string, unknown> = {};
  if (req.body?.name !== undefined) update.name = requireText(req.body.name, 'Name', 80);
  if (req.body?.price !== undefined) update.price = requirePrice(req.body.price);
  if (req.body?.cat !== undefined) update.cat = requireCategory(req.body.cat);
  if (req.body?.img !== undefined) update.img = optionalImage(req.body.img) ?? IMAGE_PLACEHOLDER;
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
  res.json(await getFullState(db));
});

/**
 * Ein gelöschtes Gericht verschwindet auch aus den laufenden Bestellungen —
 * sonst hinge es unbewertbar auf dem Tisch. Bereits abgegebene Bewertungen
 * behalten ihre dishId; die Oberfläche zeigt dafür "Gelöschtes Gericht".
 */
router.delete('/dishes/:id', async (req: OrgRequest, res) => {
  const db = req.db!;
  const id = requireObjectId(req.params.id, 'Gericht-ID');
  await db.collection('dishes').deleteOne({ _id: id });
  await db.collection('tables').updateMany({}, { $pull: { items: { dishId: String(id) } } } as never);
  // Tische, die dadurch leer geworden sind, gelten als nicht mehr belegt.
  await db.collection('tables').updateMany(
    { status: 'offen', items: { $size: 0 } },
    { $set: { status: 'frei', orderId: null, openedAt: null } }
  );
  res.json(await getFullState(db));
});

// ── Admin: Gutscheinverwaltung ──
router.post('/vouchers', async (req: OrgRequest, res) => {
  const db = req.db!;
  await db.collection('vouchers').insertOne({
    title: requireText(req.body?.title, 'Titel', 80),
    points: requirePoints(req.body?.points),
    expiry: requireText(req.body?.expiry, 'Gültig bis', 40),
    img: optionalImage(req.body?.img) ?? IMAGE_PLACEHOLDER,
  });
  res.json(await getFullState(db));
});

router.patch('/vouchers/:id', async (req: OrgRequest, res) => {
  const db = req.db!;
  const update: Record<string, unknown> = {};
  if (req.body?.title !== undefined) update.title = requireText(req.body.title, 'Titel', 80);
  if (req.body?.points !== undefined) update.points = requirePoints(req.body.points);
  if (req.body?.expiry !== undefined) update.expiry = requireText(req.body.expiry, 'Gültig bis', 40);
  if (req.body?.img !== undefined) update.img = optionalImage(req.body.img) ?? IMAGE_PLACEHOLDER;
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
  res.json(await getFullState(db));
});

router.delete('/vouchers/:id', async (req: OrgRequest, res) => {
  const db = req.db!;
  const id = requireObjectId(req.params.id, 'Gutschein-ID');
  await db.collection('vouchers').deleteOne({ _id: id });
  // Aus der Einlöse-Liste des Gasts nehmen, damit dort keine toten IDs bleiben.
  await db.collection<GuestProfileDoc>('guestProfile').updateOne(
    { _id: 'default' }, { $pull: { redeemed: String(id) } }
  );
  res.json(await getFullState(db));
});

// ── Admin: Filialverwaltung ──
router.post('/branches', async (req: OrgRequest, res) => {
  const db = req.db!;
  const name = requireText(req.body?.name, 'Name', 80);
  await db.collection('branches').insertOne({
    slug: await uniqueBranchSlug(db, name),
    name,
    address: requireText(req.body?.address, 'Adresse', 160),
  });
  res.json(await getFullState(db));
});

router.patch('/branches/:id', async (req: OrgRequest, res) => {
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
  res.json(await getFullState(db));
});

/**
 * Filialen tragen die Tische, und Tische tragen die QR-Codes. Eine Filiale mit
 * Tischen zu löschen würde also gedruckte Codes ins Leere zeigen lassen —
 * deshalb erst die Tische, dann die Filiale. Die letzte Filiale bleibt stehen,
 * weil neue Tische sonst nirgends mehr angelegt werden könnten.
 */
router.delete('/branches/:id', async (req: OrgRequest, res) => {
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
  res.json(await getFullState(db));
});

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
