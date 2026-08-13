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

function serialize<T extends WithId<Document>>(doc: T) {
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}

async function getFullState(db: Db) {
  const [brandDoc, branches, dishes, tables, vouchers, users, alerts, guestDoc] = await Promise.all([
    db.collection<BrandDoc>('settings').findOne({ _id: 'brand' }),
    db.collection('branches').find().toArray(),
    db.collection('dishes').find().toArray(),
    db.collection('tables').find().toArray(),
    db.collection('vouchers').find().toArray(),
    db.collection('users').find().toArray(),
    db.collection('alerts').find().sort({ createdAt: -1 }).toArray(),
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
  const branch = await db.collection('branches').findOne({});
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
  await req.db!.collection('tables').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json(await getFullState(req.db!));
});

// ── Kellner: Bestellung für einen Tisch speichern ──
router.post('/tables/:number/order', async (req: OrgRequest, res) => {
  const number = Number(req.params.number);
  const cart = (req.body?.cart ?? {}) as Record<string, number>;
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
    { $set: { items, status: 'offen', openedAt: table.openedAt ?? Date.now() } }
  );
  res.json(await getFullState(req.db!));
});

// ── Gast: einzelnes Gericht nachträglich zum Tisch hinzufügen ("Etwas vergessen?") ──
router.post('/tables/:number/items', async (req: OrgRequest, res) => {
  const number = Number(req.params.number);
  const { dishId, qty = 1 } = req.body ?? {};
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
    { $set: { items, status: table.status === 'frei' ? 'offen' : table.status, openedAt: table.openedAt ?? Date.now() } }
  );
  res.json(await getFullState(req.db!));
});

// ── Gast: Bewertung für einen Tisch abschicken ──
router.post('/tables/:number/review', async (req: OrgRequest, res) => {
  const number = Number(req.params.number);
  const dishRatings = (req.body?.dishRatings ?? []) as DishRatingInput[];
  const overall = req.body?.overall ?? { service: 0, ambience: 0, speed: 0 };
  const db = req.db!;

  const table = await db.collection('tables').findOne({ number });
  if (!table) {
    res.status(404).json({ error: `Tisch ${number} wurde nicht gefunden.` });
    return;
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

  await db.collection('tables').updateOne({ _id: table._id }, { $set: { status: 'abgeschlossen' } });

  await db.collection('reviews').insertOne({
    branchId: table.branchId, tableId: String(table._id), tableNumber: number,
    dishRatings, overall, createdAt: Date.now(),
  });

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

  const state = await getFullState(db);
  res.json({ ...state, pointsEarned });
});

// ── Gast: Gutschein einlösen ──
router.post('/vouchers/:id/redeem', async (req: OrgRequest, res) => {
  const db = req.db!;
  const voucher = await db.collection('vouchers').findOne({ _id: new ObjectId(req.params.id) });
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

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Bitely API läuft auf http://localhost:${port}`);
});
