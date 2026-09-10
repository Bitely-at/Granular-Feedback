import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { platformDb, orgDbBySlug, closeDb } from './db.js';
import { hashPassword } from './auth.js';
import type {
  Organization, Branch, DishDoc, TableDoc, VoucherDoc, UserDoc, BrandDoc, GuestDoc,
  OrderDoc, ReviewDoc,
} from './types.js';

// ═══════════════════════════════════════════════════════════
// Prototyp-Mandant "Hungry Guy" — Street-Food-Pita beim Schwedenplatz
//
//   npm run seed:hungry-guys --prefix server
//
// Baut die Organisation 'hungry-guys' mit einer Filiale (Rabensteig, Ecke
// Fleischmarkt), der ECHTEN Karte (Pita, Platten, Beilagen), acht Tischen,
// vier Gutscheinen, Personal- und Gastkonten und einer Handvoll kuratierter,
// gerichtsgenauer Bewertungen — das Muster "Pita/Schawarma stark, Beilagen und
// Wartezeit durchwachsen", das gerichtsgenaues Feedback trägt.
//
// Datenquelle: das echte Lokal (hungryguy.wien, über web.archive.org, weil die
// Domain auf manchen österreichischen Netzen DNS-gesperrt ist) und die
// foodora-Karte des Standorts (Gericht­namen, -preise und die Studiofotos je
// Gericht auf images.deliveryhero.io). Logo und Standortfoto stammen von der
// eigenen Website. Jedes Foto ist über die Verwaltung tauschbar (Gericht
// antippen).
//
// Das Skript ist selbstheilend: die Karte wird bei jedem Lauf an MENU
// angeglichen (Name/Preis/Foto per Upsert, überzählige Gerichte fliegen raus).
// Fällt dabei ein Gericht weg, werden auch die Demo-Bewertungen neu erzeugt,
// damit keine auf ein gelöschtes Gericht zeigt.
// ═══════════════════════════════════════════════════════════

const ORG_SLUG = 'hungry-guys';
const ORG_NAME = 'Hungry Guy';
const BRANCH_SLUG = 'schwedenplatz';
const BRANCH_NAME = 'Schwedenplatz';
const BRANCH_ADDRESS = 'Rabensteig 1, 1010 Wien';

// Logo und Standortfoto: die eigene Website, gespiegelt über web.archive.org
// (die Domain hungryguy.wien ist auf einigen AT-Providern DNS-gesperrt). Fällt
// der Spiegel aus, greift bei der Marke der Emoji-Fallback und beim Titelbild
// die Akzentfläche.
const LOGO =
  'https://web.archive.org/web/20240130150336id_/https://hungryguy.wien/wp/wp-content/uploads/2015/12/hungry-guy-logo-black.png';
const COVER =
  'https://web.archive.org/web/20250804164859id_/https://hungryguy.wien/wp/wp-content/uploads/2023/10/hungry-gut-fron.jpg';

// Echte Gerichtsfotos: die foodora-Studioaufnahmen des Standorts.
const DH = (path: string) => `https://images.deliveryhero.io/image/${path}`;

// Unsplash-CDN — nur für die zwei Getränke, zu denen es kein foodora-Foto gibt.
const IMG = (id: string, w = 600, h = 600) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;

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
  // ── Street Food in der Pita ──
  { sku: 'schawarma', name: 'Schawarma Pita', price: 14.6, cat: 'Speisen', photo: DH('fd-mj/products/11774880.jpg') },
  { sku: 'sabich', name: 'Sabich', price: 14.6, cat: 'Speisen', photo: DH('fd-mj/products/11774881.jpg') },
  { sku: 'falafelpita', name: 'Falafel Pita', price: 12.0, cat: 'Speisen', photo: DH('fd-mj/products/11774885.jpg') },
  { sku: 'schnitzelpita', name: 'Wiener Schnitzel Pita', price: 15.6, cat: 'Speisen', photo: DH('fd-mj/Products/11774887.jpg') },
  { sku: 'bcpita', name: 'Butter Chicken Pita', price: 14.5, cat: 'Speisen', photo: DH('global-menu-service/MJM_AT/vendor/yqvp/product/cc2aad4f-d2d9-40c5-8829-c94f6bacf121.jpg') },
  { sku: 'arayes', name: 'Vegane Arayes', price: 18.6, cat: 'Speisen', photo: DH('global-menu-service/MJM_AT/vendor/yqvp/product/12978781/cd2d61be-84c5-46f2-984b-67f79646df73.jpg') },
  { sku: 'cheese', name: 'Cheeseburger', price: 15.5, cat: 'Speisen', photo: DH('fd-mj/products/11774884.jpg') },
  // ── Street Food in der Pfanne / auf der Platte ──
  { sku: 'platte', name: 'Schawarma Platte', price: 21.5, cat: 'Speisen', photo: DH('fd-mj/products/11774877.jpg') },
  { sku: 'falafel', name: 'Falafel Teller (vegan)', price: 17.5, cat: 'Speisen', photo: DH('fd-mj/products/11774870.jpg') },
  { sku: 'hummusteller', name: 'Hummus Teller', price: 17.5, cat: 'Speisen', photo: DH('global-menu-service/MJM_AT/vendor/yqvp/product/11516398/dab7ac38-8194-4cbc-856e-2ae13cd4133c.jpg') },
  { sku: 'melanzani', name: 'Melanzani mit Feta', price: 16.5, cat: 'Speisen', photo: DH('global-menu-service/MJM_AT/vendor/yqvp/product/c789941b-322b-45d5-9107-7dc9219dc03a.jpg') },
  { sku: 'caesar', name: 'Schnitzel Caesar Salat', price: 16.5, cat: 'Speisen', photo: DH('global-menu-service/MJM_AT/vendor/yqvp/product/d5ceb194-eb46-4a16-b03d-ed95c012e242.jpg') },
  // ── Beilagen ──
  { sku: 'pommes', name: 'Pommes Frites', price: 6.0, cat: 'Speisen', photo: DH('fd-mj/products/11774917.jpg') },
  { sku: 'onion', name: 'Zwiebelringe', price: 5.5, cat: 'Speisen', photo: DH('fd-mj/products/11774918.jpg') },
  { sku: 'guyssalat', name: "Guy's Salat", price: 7.5, cat: 'Speisen', photo: DH('fd-mj/products/11774920.jpg') },
  { sku: 'hummus', name: 'Hummus', price: 8.0, cat: 'Speisen', photo: DH('fd-mj/Products/11774919.jpg') },
  // ── Getränke ──
  { sku: 'almdudler', name: 'Almdudler 0,33 l', price: 4.05, cat: 'Getränke', photo: DH('fd-mj/products/11774929.jpg') },
  { sku: 'fanta', name: 'Fanta Orange 0,33 l', price: 4.05, cat: 'Getränke', photo: DH('fd-mj/Products/1621309.jpg') },
  { sku: 'ayran', name: 'Ayran', price: 3.5, cat: 'Getränke', photo: DH('fd-mj/products/11779503.jpg') },
  { sku: 'voeslauer', name: 'Vöslauer prickelnd 0,5 l', price: 3.75, cat: 'Getränke', photo: DH('fd-mj/products/11774933.jpg') },
  { sku: 'makava', name: 'Makava Eistee 0,25 l', price: 4.5, cat: 'Getränke', photo: IMG('photo-1499638673689-79a0b5115d87') },
  { sku: 'trumer', name: 'Trumer Pils 0,33 l', price: 5.45, cat: 'Getränke', photo: IMG('photo-1608270586620-248524c67de9') },
];

const VOUCHERS = [
  { title: 'Gratis Pommes', points: 100, img: DH('fd-mj/products/11774917.jpg?width=1000&height=500') },
  { title: 'Gratis Ayran', points: 150, img: DH('fd-mj/products/11779503.jpg?width=1000&height=500') },
  { title: '10 % auf die ganze Rechnung', points: 250, img: COVER },
  { title: 'Gratis Schawarma Pita', points: 500, img: DH('fd-mj/products/11774880.jpg?width=1000&height=500') },
];

// ── Kuratierte Bewertungen, alle Filiale Schwedenplatz ──────
// An öffentlichen Google-/Tripadvisor-Rezensionen orientiert, selbst
// formuliert. Ergibt das Muster "Pita und Schawarma stark, Beilagen und
// Wartezeit durchwachsen, Preis grenzwertig".
interface SeedReview {
  table: number;
  items: { sku: string; stars: number; note: string }[];
  daysAgo: number;
}

const SEED_REVIEWS: SeedReview[] = [
  { table: 2, daysAgo: 11, items: [
    { sku: 'schawarma', stars: 5, note: 'Schawarma hausgemacht, die 13 Gewürze schmeckt man wirklich raus.' },
    { sku: 'pommes', stars: 3, note: 'Pommes waren nur noch lauwarm und labbrig.' },
  ] },
  { table: 5, daysAgo: 9, items: [
    { sku: 'sabich', stars: 5, note: 'Aubergine und Ei perfekt, Granatapfel gibt den Frischekick.' },
    { sku: 'ayran', stars: 4, note: 'Frisch und cremig, für mich einen Tick zu salzig.' },
  ] },
  { table: 1, daysAgo: 7, items: [
    { sku: 'schnitzelpita', stars: 4, note: 'Schnitzel saftig, Preiselbeere dazu ist ein Geniestreich. Für die Größe grenzwertig teuer.' },
    { sku: 'onion', stars: 2, note: 'Zwiebelringe labberig, der Teig löst sich vom Ring.' },
  ] },
  { table: 7, daysAgo: 6, items: [
    { sku: 'platte', stars: 5, note: 'Riesenportion, das Laffa-Brot frisch gebacken. Jeden Cent wert.' },
  ] },
  { table: 3, daysAgo: 4, items: [
    { sku: 'falafelpita', stars: 4, note: 'Falafel innen grün und würzig. Etwas mehr Tehina dürfte rein.' },
    { sku: 'hummusteller', stars: 3, note: 'Hummus cremig, kam aber kalt und die Melanzani schmeckte nach nichts.' },
  ] },
  { table: 4, daysAgo: 3, items: [
    { sku: 'arayes', stars: 4, note: 'Überraschend würzig für vegan, schön knusprig vom Grill.' },
    { sku: 'caesar', stars: 3, note: 'Schnitzel top, Salat aber labberig und zu wenig Dressing.' },
  ] },
  { table: 6, daysAgo: 2, items: [
    { sku: 'schawarma', stars: 5, note: 'Konstant gut, ich hole mir das jede Woche.' },
    { sku: 'pommes', stars: 3, note: 'Fast 20 Minuten gewartet, dann kamen sie nur handwarm.' },
  ] },
  { table: 8, daysAgo: 1, items: [
    { sku: 'bcpita', stars: 5, note: 'Butter Chicken in der Pita klingt schräg, schmeckt großartig.' },
    { sku: 'almdudler', stars: 4, note: 'Eiskalt serviert, passt.' },
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
    name: ORG_NAME, accent: '#1F3D33', logo: '🥙', logoImage: LOGO,
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

  // ── 5) Speisekarte an MENU angleichen ───────────────────
  const dishesCol = db.collection<DishDoc>('dishes');
  const fresh = (await dishesCol.countDocuments()) === 0;
  for (const m of MENU) {
    await dishesCol.updateOne(
      { name: m.name },
      {
        $set: { img: m.photo, price: m.price, cat: m.cat },
        $setOnInsert: { branchIds: null, ratingsByBranch: {} },
      },
      { upsert: true },
    );
  }
  const keep = new Set(MENU.map(m => m.name));
  const stale = await dishesCol.find({ name: { $nin: [...keep] } }).toArray();
  if (stale.length > 0) {
    await dishesCol.deleteMany({ _id: { $in: stale.map(d => d._id!) } });
    console.log(`Speisekarte: ${stale.length} überzählige Gerichte entfernt (${stale.map(d => d.name).join(', ')}).`);
  }
  console.log(fresh
    ? `Speisekarte angelegt (${MENU.length} Positionen).`
    : `Speisekarte an MENU angeglichen (${MENU.length} Positionen).`);

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

  // ── 7) Gutscheine (kettenweit einlösbar) — an VOUCHERS angleichen ──
  const vouchersCol = db.collection<VoucherDoc>('vouchers');
  const voucherFresh = (await vouchersCol.countDocuments()) === 0;
  const expiry = halfYearOut();
  for (const v of VOUCHERS) {
    await vouchersCol.updateOne(
      { title: v.title },
      { $set: { points: v.points, img: v.img, branchIds: null }, $setOnInsert: { expiry } },
      { upsert: true },
    );
  }
  const keepVouchers = new Set(VOUCHERS.map(v => v.title));
  const staleVouchers = await vouchersCol.find({ title: { $nin: [...keepVouchers] } }).toArray();
  if (staleVouchers.length > 0) {
    await vouchersCol.deleteMany({ _id: { $in: staleVouchers.map(v => v._id!) } });
    console.log(`Gutscheine: ${staleVouchers.length} überzählige entfernt (${staleVouchers.map(v => v.title).join(', ')}).`);
  }
  console.log(voucherFresh
    ? `Gutscheine angelegt (${VOUCHERS.length}, gültig bis ${expiry}).`
    : `Gutscheine an VOUCHERS angeglichen (${VOUCHERS.length}).`);

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

  // Zeigt eine bestehende Demo-Bewertung auf ein Gericht, das es nicht mehr
  // gibt (Karte umgestellt), alles einmal wegräumen und neu erzeugen.
  const demoReviews = await reviewsCol.find({ demo: true }).toArray();
  const liveDishIds = new Set(dishDocs.map(d => d._id!.toString()));
  const orphaned = demoReviews.some(rv => rv.dishRatings.some(r => !liveDishIds.has(r.dishId)));
  if (orphaned) {
    await reviewsCol.deleteMany({ demo: true });
    await ordersCol.deleteMany({ demo: true });
    console.log('Demo-Bewertungen zeigten auf entfernte Gerichte — verworfen, werden neu erzeugt.');
  }

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
