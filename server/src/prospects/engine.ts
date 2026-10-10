import { ObjectId } from 'mongodb';
import { platformDb, orgDbBySlug } from '../db.js';
import { hashPassword } from '../auth.js';
import type {
  Organization, Branch, DishDoc, TableDoc, VoucherDoc, UserDoc, BrandDoc, GuestDoc,
  OrderDoc, ReviewDoc,
} from '../types.js';

// ═══════════════════════════════════════════════════════════
// Gemeinsamer Bauplan für Pitch-Demos ("Prospects")
//
// Dasselbe Muster wie `seedHungryGuys.ts`, nur als Funktion über einer
// Beschreibung: eine Organisation, eine Filiale, die echte Karte mit echten
// Fotos, acht Tische, Gutscheine, Demo-Konten, eine Handvoll kuratierter
// Bewertungen und ~12 Wochen Verlauf fürs Dashboard. Je Lokal steht nur noch
// die Beschreibung in einer eigenen Datei (`prospects/<slug>.ts`).
//
// Selbstheilend wie das Vorbild: Karte und Gutscheine werden bei jedem Lauf an
// die Beschreibung angeglichen; zeigt eine Demo-Bewertung auf ein entferntes
// Gericht, wird der Demo-Bestand neu erzeugt.
// ═══════════════════════════════════════════════════════════

export interface ProspectDish {
  sku: string;
  name: string;
  price: number;
  cat: DishDoc['cat'];
  photo: string;
  /** Ruf in Sternen, um den der Verlauf streut. */
  rep: number;
  /** Wie oft im Korb, 1–5. */
  demand: number;
}

export interface ProspectReview {
  table: number;
  daysAgo: number;
  items: { sku: string; stars: number; note: string }[];
}

export interface Prospect {
  slug: string;
  name: string;
  branchSlug: string;
  branchName: string;
  address: string;
  accent: string;
  logo: string;
  logoImage?: string | null;
  cover: string;
  menu: ProspectDish[];
  vouchers: { title: string; points: number; img: string }[];
  /** Kuratiert, an echten Google-Rezensionen orientiert, selbst formuliert. */
  reviews: ProspectReview[];
  notes: Record<string, { good: string[]; bad: string[] }>;
  ordersPerDay: number;
  reviewRate: number;
  /** Mittlere Service-Note; am Wochenende um `weekendDip` schlechter. */
  service: number;
  weekendDip: number;
  /** Öffnungsfenster in Minuten ab Mitternacht, für die Zeitstempel. */
  open: [number, number];
  /** Ruhetage (0 = Sonntag … 6 = Samstag) — an denen entsteht kein Verlauf. */
  closedDays?: number[];
  randomSeed: number;
}

const HISTORY_WEEKS = 12;
const OWNER_EMAIL = process.env.PROSPECT_ADMIN_EMAIL ?? 'sialexander458@gmail.com';

/** dd.mm.yyyy, rund ein halbes Jahr in der Zukunft — `voucherExpired` liest das. */
function halfYearOut(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** Zufallsgenerator mit Saat — derselbe Lauf ergibt denselben Bestand. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Sterne um einen Ruf herum gestreut, hart auf 1–5 begrenzt. */
function starsAround(rep: number, rnd: () => number): number {
  const drift = (rnd() + rnd() - 1) * 1.15;
  return Math.max(1, Math.min(5, Math.round(rep + drift)));
}

export function passwordFor(p: Prospect): string {
  return process.env.SEED_PASSWORD ?? `${p.slug.replace(/[^a-z0-9]/g, '')}2026`;
}

export async function seedProspect(p: Prospect): Promise<void> {
  const password = passwordFor(p);
  const mailDomain = `${p.slug}.demo`;

  // ── 1) Registry ─────────────────────────────────────────
  const platform = await platformDb();
  const orgs = platform.collection<Organization>('organizations');
  if (!(await orgs.findOne({ slug: p.slug }))) {
    await orgs.insertOne({ slug: p.slug, name: p.name, createdAt: Date.now() });
    console.log(`Organisation '${p.slug}' angelegt.`);
  } else {
    await orgs.updateOne({ slug: p.slug }, { $set: { name: p.name } });
    console.log(`Organisation '${p.slug}' existiert bereits.`);
  }

  // ── 2) Org-DB öffnen (legt alle Indizes an) ──────────────
  const db = await orgDbBySlug(p.slug);

  // ── 3) Branding ─────────────────────────────────────────
  const settingsCol = db.collection<BrandDoc>('settings');
  const brandFields = {
    name: p.name, accent: p.accent, logo: p.logo, logoImage: p.logoImage ?? null,
    coverImage: p.cover, guestLang: 'de' as const,
  };
  await settingsCol.updateOne({ _id: 'brand' }, { $set: brandFields }, { upsert: true });

  // ── 4) Filiale mit Standortfoto ─────────────────────────
  const branchesCol = db.collection<Branch>('branches');
  let branch = await branchesCol.findOne({ slug: p.branchSlug });
  if (!branch) {
    const doc = { slug: p.branchSlug, name: p.branchName, address: p.address, coverImage: p.cover };
    const res = await branchesCol.insertOne(doc);
    branch = { _id: res.insertedId, ...doc };
  } else {
    await branchesCol.updateOne(
      { _id: branch._id },
      { $set: { name: p.branchName, address: p.address, coverImage: p.cover } },
    );
  }
  const branchId = branch._id!.toString();

  // ── 5) Speisekarte angleichen ───────────────────────────
  const dishesCol = db.collection<DishDoc>('dishes');
  for (const m of p.menu) {
    await dishesCol.updateOne(
      { name: m.name },
      {
        $set: { img: m.photo, price: m.price, cat: m.cat },
        $setOnInsert: { branchIds: null, ratingsByBranch: {} },
      },
      { upsert: true },
    );
  }
  const keep = new Set(p.menu.map(m => m.name));
  const stale = await dishesCol.find({ name: { $nin: [...keep] } }).toArray();
  if (stale.length > 0) {
    await dishesCol.deleteMany({ _id: { $in: stale.map(d => d._id!) } });
    console.log(`Speisekarte: ${stale.length} überzählige Gerichte entfernt.`);
  }
  console.log(`Speisekarte angeglichen (${p.menu.length} Positionen).`);

  const dishDocs = await dishesCol.find().toArray();
  const idByName = new Map(dishDocs.map(d => [d.name, d._id!.toString()]));
  const dishIdBySku = new Map(p.menu.map(m => [m.sku, idByName.get(m.name)!]));
  const skuByDishId = new Map([...dishIdBySku].map(([sku, id]) => [id, sku]));
  const profile = new Map(p.menu.map(m => [m.sku, m]));

  // ── 6) Tische 1–8 ───────────────────────────────────────
  const tablesCol = db.collection<TableDoc>('tables');
  if ((await tablesCol.countDocuments({ branchId })) === 0) {
    await tablesCol.insertMany([1, 2, 3, 4, 5, 6, 7, 8].map(number => ({
      branchId, number, status: 'frei' as const, items: [], openedAt: null, orderId: null,
    })));
    console.log('Tische 1 bis 8 angelegt.');
  }

  // ── 7) Gutscheine angleichen ────────────────────────────
  const vouchersCol = db.collection<VoucherDoc>('vouchers');
  const expiry = halfYearOut();
  for (const v of p.vouchers) {
    await vouchersCol.updateOne(
      { title: v.title },
      { $set: { points: v.points, img: v.img, branchIds: null }, $setOnInsert: { expiry } },
      { upsert: true },
    );
  }
  await vouchersCol.deleteMany({ title: { $nin: p.vouchers.map(v => v.title) } });
  console.log(`Gutscheine angeglichen (${p.vouchers.length}).`);

  // ── 8) Personal ─────────────────────────────────────────
  const usersCol = db.collection<UserDoc>('users');
  const demoUsers: Omit<UserDoc, '_id' | 'passwordHash'>[] = [
    { name: 'Alexander Si', email: OWNER_EMAIL, role: 'Admin', branchId: null, status: 'aktiv' },
    { name: 'Demo-Filialleitung', email: `manager@${mailDomain}`, role: 'Manager', branchId, status: 'aktiv' },
    { name: 'Demo-Service 1', email: `kellner1@${mailDomain}`, role: 'Kellner', branchId, status: 'aktiv' },
    { name: 'Demo-Service 2', email: `kellner2@${mailDomain}`, role: 'Kellner', branchId, status: 'aktiv' },
  ];
  for (const u of demoUsers) {
    await usersCol.updateOne(
      { email: u.email },
      { $set: { ...u, passwordHash: hashPassword(password) } },
      { upsert: true },
    );
  }

  // ── 9) Demo-Gastkonten ──────────────────────────────────
  const guestsCol = db.collection<GuestDoc>('guests');
  const demoGuests = [
    { email: `gast.stammkunde@${mailDomain}`, name: 'Stammkunde', points: 420 },
    { email: `gast.neu@${mailDomain}`, name: 'Neukunde', points: 40 },
  ];
  for (const g of demoGuests) {
    if ((await guestsCol.countDocuments({ email: g.email })) > 0) continue;
    await guestsCol.insertOne({
      email: g.email, name: g.name, passwordHash: hashPassword(password),
      googleSub: null, points: g.points, redeemed: [], createdAt: Date.now(),
    });
  }

  // ── 10) Kuratierte Bewertungen ──────────────────────────
  const ordersCol = db.collection<OrderDoc>('orders');
  const reviewsCol = db.collection<ReviewDoc>('reviews');
  const tables = await tablesCol.find({ branchId }).toArray();
  const tableByNumber = new Map(tables.map(t => [t.number, t]));

  const existing = await reviewsCol.find({ demo: true }).toArray();
  const liveDishIds = new Set(dishDocs.map(d => d._id!.toString()));
  if (existing.some(rv => rv.dishRatings.some(r => !liveDishIds.has(r.dishId)))) {
    await reviewsCol.deleteMany({ demo: true });
    await ordersCol.deleteMany({ demo: true });
    console.log('Demo-Bewertungen zeigten auf entfernte Gerichte — werden neu erzeugt.');
  }

  const [openFrom, openTo] = p.open;
  if ((await reviewsCol.countDocuments({ demo: true })) === 0) {
    const orderDocs: Omit<OrderDoc, '_id'>[] = [];
    const reviewDocs: Omit<ReviewDoc, '_id'>[] = [];
    for (const sr of p.reviews) {
      const table = tableByNumber.get(sr.table);
      if (!table) continue;
      const at = new Date();
      at.setDate(at.getDate() - sr.daysAgo);
      at.setHours(0, openFrom, 0, 0);
      at.setMinutes(at.getMinutes() + Math.floor(Math.random() * (openTo - openFrom - 60)));
      const orderId = new ObjectId();
      const dishRatings = sr.items.map(it => {
        const dishId = dishIdBySku.get(it.sku);
        if (!dishId) throw new Error(`Bewertung nennt unbekanntes Gericht '${it.sku}'`);
        return { dishId, stars: it.stars, note: it.note };
      });
      const avg = dishRatings.reduce((a, r) => a + r.stars, 0) / dishRatings.length;
      const service = avg >= 4.5 ? 5 : avg >= 3.5 ? 4 : 3;
      orderDocs.push({
        orderId, branchId, tableId: String(table._id), tableNumber: table.number,
        createdAt: at.getTime(), itemCount: sr.items.length, demo: true,
      });
      reviewDocs.push({
        orderId, branchId, tableId: String(table._id), tableNumber: table.number,
        dishRatings,
        // Ambiente und Schnelligkeit werden nicht mehr gefragt: 0 = "nicht beurteilt".
        overall: { service, ambience: 0, speed: 0 },
        createdAt: at.getTime() + 55 * 60 * 1000, demo: true,
      });
    }
    await ordersCol.insertMany(orderDocs as OrderDoc[]);
    await reviewsCol.insertMany(reviewDocs as ReviewDoc[]);
    console.log(`Kuratierte Bewertungen angelegt (${reviewDocs.length}).`);
  }

  // ── 11) Demo-Verlauf (~12 Wochen) ───────────────────────
  if ((await ordersCol.countDocuments({ demo: true })) <= p.reviews.length) {
    const rnd = makeRandom(p.randomSeed ^ HISTORY_WEEKS);
    const dishIds = dishDocs.map(d => d._id!.toString());
    const days = HISTORY_WEEKS * 7;
    const histOrders: Omit<OrderDoc, '_id'>[] = [];
    const histReviews: Omit<ReviewDoc, '_id'>[] = [];
    // Die letzten Tage gehören den kuratierten Bewertungen.
    const curatedSpan = Math.max(0, ...p.reviews.map(r => r.daysAgo)) + 1;

    for (let offset = days - 1; offset >= curatedSpan; offset -= 1) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - offset);
      const wd = day.getDay();
      if (p.closedDays?.includes(wd)) continue;
      const weekend = wd === 5 || wd === 6;
      const weekdayFactor = weekend ? 1.5 : wd === 0 ? 1.15 : wd === 1 ? 0.65 : 1;
      const growth = 0.75 + (days - offset) / days * 0.5; // leichter Aufwärtstrend
      const orders = Math.max(1, Math.round(p.ordersPerDay * weekdayFactor * growth * (0.8 + rnd() * 0.4)));

      for (let i = 0; i < orders; i += 1) {
        const table = tables[Math.floor(rnd() * tables.length)];
        const at = new Date(day);
        at.setHours(0, openFrom, 0, 0);
        at.setMinutes(at.getMinutes() + Math.floor(rnd() * (openTo - openFrom - 60)));

        const picked: string[] = [];
        const wanted = 1 + Math.floor(rnd() * 4);
        for (let k = 0; k < wanted * 4 && picked.length < wanted; k += 1) {
          const id = dishIds[Math.floor(rnd() * dishIds.length)];
          const demand = profile.get(skuByDishId.get(id) ?? '')?.demand ?? 3;
          if (rnd() * 5 > demand) continue;
          if (!picked.includes(id)) picked.push(id);
        }
        if (picked.length === 0) picked.push(dishIds[Math.floor(rnd() * dishIds.length)]);

        const orderId = new ObjectId();
        histOrders.push({
          orderId, branchId, tableId: String(table._id), tableNumber: table.number,
          createdAt: at.getTime(), itemCount: picked.length, demo: true,
        });

        if (rnd() > p.reviewRate) continue;
        const dishRatings = picked.map(id => {
          const sku = skuByDishId.get(id) ?? '';
          const stars = starsAround(profile.get(sku)?.rep ?? 4, rnd);
          const pool = p.notes[sku];
          let note: string | undefined;
          if (pool && rnd() < 0.4) {
            const bucket = stars >= 4 ? pool.good : pool.bad;
            if (bucket.length) note = bucket[Math.floor(rnd() * bucket.length)];
          }
          return note ? { dishId: id, stars, note } : { dishId: id, stars };
        });
        const service = Math.max(1, Math.min(5, Math.round(
          p.service - (weekend ? p.weekendDip : 0) + (rnd() + rnd() - 1) * 1.1,
        )));
        histReviews.push({
          orderId, branchId, tableId: String(table._id), tableNumber: table.number,
          dishRatings,
          overall: { service, ambience: 0, speed: 0 },
          createdAt: at.getTime() + (40 + Math.floor(rnd() * 50)) * 60 * 1000,
          demo: true,
        });
      }
    }

    await ordersCol.insertMany(histOrders as OrderDoc[]);
    await reviewsCol.insertMany(histReviews as ReviewDoc[]);
    const pct = Math.round(histReviews.length / histOrders.length * 100);
    console.log(`Demo-Verlauf (${HISTORY_WEEKS} Wochen): ${histOrders.length} Bestellungen, ${histReviews.length} Bewertungen (${pct} %).`);
  }

  // Gerichtsschnitte (ratingsByBranch) aus allen Bewertungen neu rechnen.
  const allReviews = await reviewsCol.find().toArray();
  const byDish = new Map<string, Record<string, { sum: number; count: number }>>();
  for (const rv of allReviews) {
    for (const r of rv.dishRatings) {
      if (r.stars <= 0) continue;
      const perBranch = byDish.get(r.dishId) ?? {};
      const bucket = perBranch[rv.branchId] ?? { sum: 0, count: 0 };
      bucket.sum += r.stars;
      bucket.count += 1;
      perBranch[rv.branchId] = bucket;
      byDish.set(r.dishId, perBranch);
    }
  }
  for (const dish of dishDocs) {
    await dishesCol.updateOne({ _id: dish._id }, { $set: { ratingsByBranch: byDish.get(dish._id!.toString()) ?? {} } });
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`  ${p.name}  (/${p.slug})`);
  console.log('─────────────────────────────────────────');
  console.log(`  Verwaltung   /${p.slug}/admin`);
  console.log(`  Personal     /${p.slug}/staff`);
  console.log(`  QR am Tisch  /${p.slug}/${p.branchSlug}/table/3`);
  console.log(`  Admin        ${OWNER_EMAIL} / ${password}`);
  console.log(`  Service      kellner1@${mailDomain} / ${password}`);
  console.log(`  Gast         gast.stammkunde@${mailDomain} (420 Punkte) / ${password}\n`);
}
