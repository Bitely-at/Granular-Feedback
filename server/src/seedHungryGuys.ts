import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { platformDb, orgDbBySlug, closeDb } from './db.js';
import { hashPassword } from './auth.js';
import type {
  Organization, Branch, DishDoc, TableDoc, VoucherDoc, UserDoc, BrandDoc, GuestDoc,
  OrderDoc, ReviewDoc,
} from './types.js';

// ═══════════════════════════════════════════════════════════
// Prototyp-Mandant "Hungry Guys" — Smash-Burger-Laden beim Schwedenplatz
//
//   npm run seed:hungry-guys --prefix server
//
// Baut die Organisation 'hungry-guys' mit einer Filiale (Schwedenplatz), einer
// Burger-Karte, acht Tischen, vier Gutscheinen, Personal- und Gastkonten und
// einer Handvoll kuratierter, gerichtsgenauer Bewertungen — das Muster
// "Burger top, Beilagen durchwachsen", das gerichtsgenaues Feedback trägt.
//
// Fotos sind ausgesuchte Unsplash-Aufnahmen und passen nicht immer aufs Gramm
// zum Gericht — in der Verwaltung ist jedes tauschbar (Gericht antippen).
//
// Das Skript ist wiederholbar: Stammdaten (Name, Preis) bleiben unangetastet,
// Fotos und Verfügbarkeit werden nachgezogen.
// ═══════════════════════════════════════════════════════════

const ORG_SLUG = 'hungry-guys';
const ORG_NAME = 'Hungry Guys';
const BRANCH_SLUG = 'schwedenplatz';
const BRANCH_NAME = 'Schwedenplatz';
const BRANCH_ADDRESS = 'Marc-Aurel-Straße 5, 1010 Wien';

const IMG = (id: string, w = 600, h = 600) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;

const COVER = IMG('photo-1550547660-d9450f859349', 1200, 675);

/** dd.mm.yyyy, rund ein halbes Jahr in der Zukunft — `voucherExpired` liest das. */
function halfYearOut(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

interface MenuItem {
  sku: string;
  name: string;
  price: number;
  cat: DishDoc['cat'];
  photo: string;
}

const MENU: MenuItem[] = [
  // ── Burger ──
  { sku: 'classic', name: 'Classic Smash', price: 11.9, cat: 'Speisen', photo: 'photo-1568901346375-23c9450c58cd' },
  { sku: 'bacon', name: 'Bacon Smash', price: 13.9, cat: 'Speisen', photo: 'photo-1553979459-d2229ba7433b' },
  { sku: 'double', name: 'Double Trouble', price: 15.9, cat: 'Speisen', photo: 'photo-1571091718767-18b5b1457add' },
  { sku: 'chicken', name: 'Crispy Chicken Burger', price: 12.5, cat: 'Speisen', photo: 'photo-1586190848861-99aa4a171e90' },
  { sku: 'veggie', name: 'Veggie Smash', price: 12.9, cat: 'Speisen', photo: 'photo-1520072959219-c595dc870360' },
  { sku: 'pulled', name: 'Pulled Pork Burger', price: 13.5, cat: 'Speisen', photo: 'photo-1594035900144-17151c9910af' },
  // ── Beilagen & Snacks ──
  { sku: 'fries', name: 'Pommes', price: 4.5, cat: 'Speisen', photo: 'photo-1573080496219-bb080dd4f877' },
  { sku: 'loaded', name: 'Loaded Fries', price: 8.9, cat: 'Speisen', photo: 'photo-1607013251379-e6eecfffe234' },
  { sku: 'sweet', name: 'Süßkartoffel-Pommes', price: 5.9, cat: 'Speisen', photo: 'photo-1552332386-f8dd00dc2f85' },
  { sku: 'wings', name: 'Chicken Wings (6 Stück)', price: 9.9, cat: 'Speisen', photo: 'photo-1608039755401-742074f0548d' },
  { sku: 'onion', name: 'Onion Rings', price: 5.9, cat: 'Speisen', photo: 'photo-1639024471283-03518883512d' },
  { sku: 'brownie', name: 'Brownie mit Vanilleeis', price: 6.5, cat: 'Speisen', photo: 'photo-1606313564200-e75d5e30476c' },
  // ── Getränke ──
  { sku: 'shake', name: 'Milkshake Vanille', price: 5.9, cat: 'Getränke', photo: 'photo-1572802419224-296b0aeee0d9' },
  { sku: 'lemo', name: 'Hausgemachte Limonade', price: 4.2, cat: 'Getränke', photo: 'photo-1621263764928-df1444c5e859' },
  { sku: 'cola', name: 'Craft Cola', price: 3.9, cat: 'Getränke', photo: 'photo-1622483767028-3f66f32aef97' },
  { sku: 'beer', name: 'Ottakringer 0,5 l', price: 4.5, cat: 'Getränke', photo: 'photo-1608270586620-248524c67de9' },
  { sku: 'icetea', name: 'Eistee Pfirsich', price: 3.8, cat: 'Getränke', photo: 'photo-1499638673689-79a0b5115d87' },
  { sku: 'espr', name: 'Espresso', price: 2.8, cat: 'Getränke', photo: 'photo-1510591509098-f4fdc6d0ff04' },
];

const VOUCHERS = [
  { title: 'Gratis Pommes', points: 100, img: IMG('photo-1573080496219-bb080dd4f877', 1000, 500) },
  { title: 'Gratis Milkshake', points: 180, img: IMG('photo-1572802419224-296b0aeee0d9', 1000, 500) },
  { title: '10 % auf die ganze Rechnung', points: 250, img: IMG('photo-1550547660-d9450f859349', 1000, 500) },
  { title: 'Gratis Classic Smash', points: 500, img: IMG('photo-1568901346375-23c9450c58cd', 1000, 500) },
];

// ── Kuratierte Bewertungen, alle Filiale Schwedenplatz ──────
// An öffentlichen Google-Rezensionen orientiert, selbst formuliert. Ergibt das
// Muster "Burger stark, Beilagen und Wartezeit durchwachsen".
interface SeedReview {
  table: number;
  items: { sku: string; stars: number; note: string }[];
  daysAgo: number;
}

const SEED_REVIEWS: SeedReview[] = [
  { table: 2, daysAgo: 11, items: [
    { sku: 'classic', stars: 5, note: 'Patty richtig krustig, genau wie es sein soll.' },
    { sku: 'fries', stars: 3, note: 'Pommes waren lauwarm und labbrig.' },
  ] },
  { table: 5, daysAgo: 9, items: [
    { sku: 'bacon', stars: 5, note: 'Speck knusprig, Sauce top.' },
    { sku: 'shake', stars: 4, note: 'Cremig, könnte etwas kälter sein.' },
  ] },
  { table: 1, daysAgo: 7, items: [
    { sku: 'chicken', stars: 4, note: 'Saftig, Panade gut. Bun etwas trocken.' },
    { sku: 'onion', stars: 2, note: 'Zu fettig, Teig löst sich vom Ring.' },
  ] },
  { table: 7, daysAgo: 6, items: [
    { sku: 'double', stars: 5, note: 'Mega Portion, jeden Cent wert.' },
  ] },
  { table: 3, daysAgo: 4, items: [
    { sku: 'veggie', stars: 4, note: 'Überraschend gut, für Fleischesser okay.' },
    { sku: 'loaded', stars: 3, note: 'Käse war schon fest, zu wenig Jalapeños.' },
  ] },
  { table: 4, daysAgo: 3, items: [
    { sku: 'pulled', stars: 4, note: 'Fleisch zart, Coleslaw fehlte etwas Säure.' },
    { sku: 'sweet', stars: 5, note: 'Beste Süßkartoffel-Pommes der Stadt.' },
  ] },
  { table: 6, daysAgo: 2, items: [
    { sku: 'classic', stars: 5, note: 'Konstant gut, komme immer wieder.' },
    { sku: 'wings', stars: 3, note: '20 Minuten gewartet, dann nur handwarm.' },
  ] },
  { table: 8, daysAgo: 1, items: [
    { sku: 'bacon', stars: 5, note: 'Bester Smash Burger beim Schwedenplatz.' },
    { sku: 'lemo', stars: 4, note: 'Frisch und nicht zu süß.' },
  ] },
];

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'hungryguys2026';
const OWNER_EMAIL = process.env.HUNGRY_ADMIN_EMAIL ?? 'sialexander458@gmail.com';

async function main() {
  // ── 1) Registry ─────────────────────────────────────────
  const platform = await platformDb();
  const orgs = platform.collection<Organization>('organizations');
  let org = await orgs.findOne({ slug: ORG_SLUG });
  if (!org) {
    const createdAt = Date.now();
    const res = await orgs.insertOne({ slug: ORG_SLUG, name: ORG_NAME, createdAt });
    org = { _id: res.insertedId, slug: ORG_SLUG, name: ORG_NAME, createdAt };
    console.log(`Organisation '${ORG_SLUG}' angelegt.`);
  } else {
    console.log(`Organisation '${ORG_SLUG}' existiert bereits.`);
  }

  // ── 2) Org-DB öffnen (legt alle Indizes an) ──────────────
  const db = await orgDbBySlug(ORG_SLUG);

  // ── 3) Branding ─────────────────────────────────────────
  const settingsCol = db.collection<BrandDoc>('settings');
  const brandFields = {
    name: ORG_NAME, accent: '#C2410C', logo: '🍔',
    coverImage: COVER, guestLang: 'de' as const,
  };
  if ((await settingsCol.countDocuments({ _id: 'brand' })) === 0) {
    await settingsCol.insertOne({ _id: 'brand', ...brandFields });
    console.log('Branding angelegt.');
  } else {
    await settingsCol.updateOne({ _id: 'brand' }, { $set: brandFields });
    console.log('Branding aktualisiert.');
  }

  // ── 4) Filiale mit Standortfoto ─────────────────────────
  const branchesCol = db.collection<Branch>('branches');
  let branch = await branchesCol.findOne({ slug: BRANCH_SLUG });
  if (!branch) {
    const doc = { slug: BRANCH_SLUG, name: BRANCH_NAME, address: BRANCH_ADDRESS, coverImage: COVER };
    const res = await branchesCol.insertOne(doc);
    branch = { _id: res.insertedId, ...doc };
    console.log(`Filiale "${BRANCH_NAME}" angelegt.`);
  } else {
    await branchesCol.updateOne(
      { _id: branch._id },
      { $set: { name: BRANCH_NAME, address: BRANCH_ADDRESS, coverImage: COVER } },
    );
    console.log(`Filiale "${BRANCH_NAME}" aktualisiert.`);
  }
  const branchId = branch._id!.toString();

  // ── 5) Speisekarte ──────────────────────────────────────
  const dishesCol = db.collection<DishDoc>('dishes');
  if ((await dishesCol.countDocuments()) === 0) {
    await dishesCol.insertMany(MENU.map(m => ({
      name: m.name, img: IMG(m.photo), price: m.price, cat: m.cat,
      branchIds: null, ratingsByBranch: {},
    })));
    console.log(`Speisekarte angelegt (${MENU.length} Positionen).`);
  } else {
    let fixed = 0;
    for (const m of MENU) {
      const r = await dishesCol.updateOne({ name: m.name }, { $set: { img: IMG(m.photo) } });
      fixed += r.modifiedCount;
    }
    console.log(`Speisekarte existiert bereits — ${fixed} Fotos aktualisiert.`);
  }
  const dishDocs = await dishesCol.find().toArray();
  const idByName = new Map(dishDocs.map(d => [d.name, d._id!.toString()]));
  const dishIdBySku = new Map(MENU.map(m => [m.sku, idByName.get(m.name)!]));

  // ── 6) Tische 1–8 ───────────────────────────────────────
  const tablesCol = db.collection<TableDoc>('tables');
  if ((await tablesCol.countDocuments({ branchId })) === 0) {
    await tablesCol.insertMany([1, 2, 3, 4, 5, 6, 7, 8].map(number => ({
      branchId, number, status: 'frei' as const, items: [], openedAt: null, orderId: null,
    })));
    console.log('Tische 1 bis 8 angelegt.');
  } else {
    console.log('Tische existieren bereits.');
  }

  // ── 7) Gutscheine (kettenweit einlösbar) ────────────────
  const vouchersCol = db.collection<VoucherDoc>('vouchers');
  if ((await vouchersCol.countDocuments()) === 0) {
    const expiry = halfYearOut();
    await vouchersCol.insertMany(VOUCHERS.map(v => ({
      title: v.title, points: v.points, expiry, branchIds: null, img: v.img,
    })));
    console.log(`Gutscheine angelegt (${VOUCHERS.length}, gültig bis ${expiry}).`);
  } else {
    let fixed = 0;
    for (const v of VOUCHERS) {
      const r = await vouchersCol.updateOne({ title: v.title }, { $set: { img: v.img } });
      fixed += r.modifiedCount;
    }
    console.log(`Gutscheine existieren bereits — ${fixed} Fotos aktualisiert.`);
  }

  // ── 8) Personal ─────────────────────────────────────────
  const usersCol = db.collection<UserDoc>('users');
  const demoUsers: Omit<UserDoc, '_id' | 'passwordHash'>[] = [
    { name: 'Alexander Si', email: OWNER_EMAIL, role: 'Admin', branchId: null, status: 'aktiv' },
    { name: 'Demo-Filialleitung', email: 'manager@hungry-guys.demo', role: 'Manager', branchId, status: 'aktiv' },
    { name: 'Demo-Service 1', email: 'kellner1@hungry-guys.demo', role: 'Kellner', branchId, status: 'aktiv' },
    { name: 'Demo-Service 2', email: 'kellner2@hungry-guys.demo', role: 'Kellner', branchId, status: 'aktiv' },
  ];
  for (const u of demoUsers) {
    await usersCol.updateOne(
      { email: u.email },
      { $set: { ...u, passwordHash: hashPassword(DEMO_PASSWORD) } },
      { upsert: true },
    );
  }
  console.log(`Personal angelegt/aktualisiert (${demoUsers.length} Konten).`);

  // ── 9) Demo-Gastkonten ──────────────────────────────────
  const guestsCol = db.collection<GuestDoc>('guests');
  const demoGuests = [
    { email: 'gast.stammkunde@hungry-guys.demo', name: 'Stammkunde', points: 420 },
    { email: 'gast.neu@hungry-guys.demo', name: 'Neukunde', points: 40 },
    { email: 'gast.buero@hungry-guys.demo', name: 'Büro nebenan', points: 260 },
  ];
  for (const g of demoGuests) {
    if ((await guestsCol.countDocuments({ email: g.email })) > 0) continue;
    await guestsCol.insertOne({
      email: g.email, name: g.name, passwordHash: hashPassword(DEMO_PASSWORD),
      googleSub: null, points: g.points, redeemed: [], createdAt: Date.now(),
    });
  }
  console.log(`Demo-Gastkonten angelegt/geprüft (${demoGuests.length}).`);

  // ── 10) Kuratierte Bewertungen ──────────────────────────
  const ordersCol = db.collection<OrderDoc>('orders');
  const reviewsCol = db.collection<ReviewDoc>('reviews');
  const tables = await tablesCol.find({ branchId }).toArray();
  const tableByNumber = new Map(tables.map(t => [t.number, t]));

  if ((await reviewsCol.countDocuments({ demo: true })) === 0) {
    const orderDocs: Omit<OrderDoc, '_id'>[] = [];
    const reviewDocs: Omit<ReviewDoc, '_id'>[] = [];
    for (const sr of SEED_REVIEWS) {
      const table = tableByNumber.get(sr.table);
      if (!table) continue;
      const at = new Date();
      at.setDate(at.getDate() - sr.daysAgo);
      at.setHours(11, 30, 0, 0);
      at.setMinutes(at.getMinutes() + Math.floor(Math.random() * 540));
      const orderId = new ObjectId();
      const dishRatings = sr.items.map(it => ({
        dishId: dishIdBySku.get(it.sku)!, stars: it.stars, note: it.note,
      }));
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
    console.log(`Kuratierte Bewertungen angelegt (${reviewDocs.length} Bestellungen).`);
  } else {
    console.log('Kuratierte Bewertungen existieren bereits.');
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
    const next = byDish.get(dish._id!.toString()) ?? {};
    await dishesCol.updateOne({ _id: dish._id }, { $set: { ratingsByBranch: next } });
  }
  console.log('Gerichtsschnitte neu gerechnet.');

  // ── Zusammenfassung ─────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log(`  ${ORG_NAME}  (/${ORG_SLUG})`);
  console.log('─────────────────────────────────────────');
  console.log(`  Verwaltung   /${ORG_SLUG}/admin`);
  console.log(`  Personal     /${ORG_SLUG}/staff`);
  console.log(`  QR am Tisch  /${ORG_SLUG}/${BRANCH_SLUG}/table/3`);
  console.log('\n  Zugänge (Passwort jeweils gleich):');
  console.log(`    ${OWNER_EMAIL}   Admin (ganze Kette)   / ${DEMO_PASSWORD}`);
  console.log(`    manager@hungry-guys.demo    Filialleitung   / ${DEMO_PASSWORD}`);
  console.log(`    kellner1@hungry-guys.demo   Service         / ${DEMO_PASSWORD}`);
  console.log(`    gast.stammkunde@hungry-guys.demo   Gast, 420 Punkte   / ${DEMO_PASSWORD}`);
  console.log('\n  Mehr Verlauf fürs Dashboard (optional):');
  console.log(`    npm run demo-reviews --prefix server -- 8 ${ORG_SLUG}`);
  console.log(`  Demo-Bewertungen wieder entfernen:`);
  console.log(`    npm run demo-reviews --prefix server -- --reset ${ORG_SLUG}`);
  console.log('');

  await closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
