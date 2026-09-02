import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { platformDb, orgDbBySlug, closeDb } from './db.js';
import { hashPassword } from './auth.js';
import type {
  Organization, Branch, DishDoc, TableDoc, VoucherDoc, UserDoc, BrandDoc, GuestDoc,
  OrderDoc, ReviewDoc,
} from './types.js';

// ═══════════════════════════════════════════════════════════
// Demo-Mandant "The Miners CZ" (Prag)
//
//   npm run seed:miners-cz --prefix server
//
// Eine EIGENE Organisation neben 'the-miners' (Wien/Dresden). Grund: Bitely
// kennt keinen Pro-Filial-Preis, aber jede Organisation hat eine eigene
// Datenbank — CZK und EUR lassen sich nur so sauber trennen. Konsequenz: ein
// Ketten-Admin braucht zwei Logins (ein Token gilt nur in einer Organisation).
//
// Zwei Filialen: JZP (Vinohrady, mit vollem Brunch, der interessantere Pilot)
// und Maj (Národní, bestbewertet, fast reines Take-away, keine Speisen).
// Genau dieser Unterschied ist das Argument: Maj hat 4,9 auf Google, JZP 4,6 —
// und die Lücke liegt sichtbar beim Brunch, nicht beim Kaffee.
//
// Sprache der Gastansicht: 'en' (Tschechisch ist noch nicht drin, en ist der
// Fallback aus der Vorlage). Preise in CZK.
//
// Datenquelle: theminers.eu (Karten JZP/Maj, Locations), Google Places.
// Bilder: das Titelbild und ein Gutschein-Motiv von der echten Miners-Seite,
// die Kartenpositionen mit ausgesuchten Unsplash-Fotos (die Onlinekarte hat
// keine). Jedes Foto ist in der Verwaltung tauschbar.
//
// Wiederholbar: was schon da ist, bleibt unangetastet; nur Fotos werden
// nachgezogen.
// ═══════════════════════════════════════════════════════════

const ORG_SLUG = 'the-miners-cz';
const ORG_NAME = 'The Miners CZ';

const MINERS = (path: string) =>
  `https://cdn.myshoptet.com/usr/www.theminers.eu/user/${path}`;
const IMG = (id: string, w = 600, h = 600) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;

/** dd.mm.yyyy, rund ein halbes Jahr in der Zukunft — `voucherExpired` liest das. */
function halfYearOut(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// `cat` kennt nur 'Speisen' | 'Getränke'. Feinere Kategorien der echten Karte
// (Káva / Ledová káva / Ostatní nápoje / Brunch / Pastry) gehen dabei verloren.
// `only` = Filial-Slugs, in denen es geführt wird; fehlt es → beide.
interface MenuItem {
  sku: string;
  name: string;
  price: number; // CZK
  cat: DishDoc['cat'];
  photo: string;
  only?: string[];
}

const MENU: MenuItem[] = [
  { sku: 'esp', name: 'Espresso', price: 80, cat: 'Getränke', photo: 'photo-1510591509098-f4fdc6d0ff04' },
  { sku: 'batch', name: 'Batch Brew', price: 85, cat: 'Getränke', photo: 'photo-1610874150308-a1e6f8c905d9' },
  { sku: 'capp', name: 'Cappuccino', price: 95, cat: 'Getränke', photo: 'photo-1497636577773-f1231844b336' },
  { sku: 'latte', name: 'Latte', price: 100, cat: 'Getränke', photo: 'photo-1557772611-722dabe20327' },
  { sku: 'flat', name: 'Flat White', price: 105, cat: 'Getränke', photo: 'photo-1541167760496-1628856ab772' },
  { sku: 'cort', name: 'Cortado', price: 85, cat: 'Getränke', photo: 'photo-1610889556528-9a770e32642f' },

  { sku: 'ilatte', name: 'Iced Latte', price: 110, cat: 'Getränke', photo: 'photo-1461023058943-07fcbe16d735' },
  { sku: 'cbrew', name: 'Cold Brew', price: 115, cat: 'Getränke', photo: 'photo-1531835207745-506a1bc035d8', only: ['maj'] },
  { sku: 'icm', name: 'Iced Coconut Matcha', price: 125, cat: 'Getränke', photo: 'photo-1717603545758-88cc454db69b' },
  { sku: 'etonic', name: 'Espresso Tonic', price: 115, cat: 'Getränke', photo: 'photo-1753700281029-b3d15df20ec4' },
  { sku: 'lemon', name: 'Homemade Lemonade', price: 100, cat: 'Getränke', photo: 'photo-1621263764928-df1444c5e859' },

  { sku: 'chai', name: 'Chai Latte', price: 110, cat: 'Getränke', photo: 'photo-1561336526-2914f13ceb36' },
  { sku: 'match', name: 'Matcha Latte', price: 125, cat: 'Getränke', photo: 'photo-1515823064-d6e0c04616a7' },
  { sku: 'tea', name: 'Tea', price: 100, cat: 'Getränke', photo: 'photo-1491720731493-223f97d92c21' },
  { sku: 'choc', name: 'Hot Chocolate', price: 125, cat: 'Getränke', photo: 'photo-1637572815755-c4b80092dce1' },

  { sku: 'avo', name: 'Avocado Sandwich', price: 285, cat: 'Speisen', photo: 'photo-1539252554453-80ab65ce3586', only: ['jzp'] },
  { sku: 'eben', name: 'Egg Benedict with Ham', price: 260, cat: 'Speisen', photo: 'photo-1674315604997-bc5fcaa1ac32', only: ['jzp'] },
  { sku: 'omel', name: 'Omelette', price: 260, cat: 'Speisen', photo: 'photo-1510693206972-df098062cb71', only: ['jzp'] },
  { sku: 'turk', name: 'Turkish Eggs on Waffle', price: 250, cat: 'Speisen', photo: 'photo-1759493785939-0bd3e3d60682', only: ['jzp'] },
  { sku: 'rwaf', name: 'Raspberry Waffle', price: 250, cat: 'Speisen', photo: 'photo-1568051243851-f9b136146e97', only: ['jzp'] },
  { sku: 'syrn', name: 'Syrniki', price: 260, cat: 'Speisen', photo: 'photo-1612182062633-9ff3b3598e96', only: ['jzp'] },

  { sku: 'chees', name: 'Cheesecake', price: 120, cat: 'Speisen', photo: 'photo-1676300185983-d5f242babe34' },
  { sku: 'rvc', name: 'Red Velvet Cookie', price: 95, cat: 'Speisen', photo: 'photo-1499636136210-6f4ee915583e' },
  { sku: 'psuis', name: 'Pain Suisse Raspberry', price: 110, cat: 'Speisen', photo: 'photo-1555507036-ab1f4038808a' },
];

// Punktepreise gegen CZK kalibriert (aus der Vorlage), nicht aus dem Wien-Seed.
// Der Brunch-Gutschein gilt nur in JZP (nur dort gibt es Brunch).
const VOUCHERS = [
  { title: 'Extra Shot zdarma', points: 30, only: undefined as string[] | undefined, img: IMG('photo-1624296410333-b89ab23cf0eb', 1000, 500) },
  { title: 'Batch Brew zdarma', points: 100, only: undefined, img: IMG('photo-1610874150308-a1e6f8c905d9', 1000, 500) },
  { title: 'Pastry dne zdarma', points: 130, only: undefined, img: IMG('photo-1483695028939-5bb13f8648b0', 1000, 500) },
  { title: '20 % na 250 g zrn', points: 250, only: undefined, img: MINERS('shop/big/1466-5_brazil-monteiro-lobato-front.png') },
  { title: '100 Kč na brunch', points: 400, only: ['jzp'], img: IMG('photo-1674315604997-bc5fcaa1ac32', 1000, 500) },
];

interface SeedReview {
  branch: string;
  table: number;
  items: { sku: string; stars: number; note: string }[];
  daysAgo: number;
}

// Selbst formuliert, thematisch an öffentlichen Rezensionen orientiert. Ergibt
// das Muster: in JZP liegen die Getränke deutlich über dem Brunch, in Maj ist
// alles gleichmäßig hoch — genau der Unterschied, der Maj 4,9 und JZP 4,6 auf
// Google bringt und den nur die gerichtsgenaue Sicht zeigt.
const SEED_REVIEWS: SeedReview[] = [
  { branch: 'jzp', table: 4, daysAgo: 10, items: [
    { sku: 'batch', stars: 5, note: 'Very clean, chocolatey, consistently good.' },
    { sku: 'turk', stars: 5, note: 'Best Turkish eggs in Prague.' },
  ] },
  { branch: 'jzp', table: 7, daysAgo: 8, items: [
    { sku: 'omel', stars: 3, note: 'Nduja overpowers everything, bread was lukewarm.' },
    { sku: 'flat', stars: 5, note: 'Milk foam perfect.' },
  ] },
  { branch: 'jzp', table: 2, daysAgo: 6, items: [
    { sku: 'syrn', stars: 4, note: 'Good, but 260 CZK is ambitious.' },
  ] },
  { branch: 'jzp', table: 11, daysAgo: 4, items: [
    { sku: 'rvc', stars: 5, note: 'My standard afternoon cookie.' },
  ] },
  { branch: 'jzp', table: 9, daysAgo: 2, items: [
    { sku: 'eben', stars: 3, note: 'Long wait on the weekend.' },
  ] },
  { branch: 'maj', table: 1, daysAgo: 9, items: [
    { sku: 'cbrew', stars: 5, note: 'Very clear, not bitter.' },
  ] },
  { branch: 'maj', table: 3, daysAgo: 6, items: [
    { sku: 'ilatte', stars: 5, note: 'Milk quality makes the difference.' },
  ] },
  { branch: 'maj', table: 5, daysAgo: 3, items: [
    { sku: 'match', stars: 4, note: 'Creamy, a touch too sweet.' },
  ] },
  { branch: 'maj', table: 2, daysAgo: 1, items: [
    { sku: 'esp', stars: 5, note: 'Balanced, no sugar needed.' },
  ] },
];

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'bitely123';
const OWNER_EMAIL = process.env.MINERS_ADMIN_EMAIL ?? 'sialexander458@gmail.com';

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

  const db = await orgDbBySlug(ORG_SLUG);

  // ── 2) Branding ─────────────────────────────────────────
  const COVER = MINERS('documents/upload/covers/jzp_00.webp');
  const settingsCol = db.collection<BrandDoc>('settings');
  if ((await settingsCol.countDocuments({ _id: 'brand' })) === 0) {
    await settingsCol.insertOne({
      _id: 'brand', name: ORG_NAME, accent: '#C8A882', logo: '☕',
      coverImage: COVER, guestLang: 'en',
    });
    console.log('Branding angelegt.');
  } else {
    await settingsCol.updateOne({ _id: 'brand' }, { $set: { coverImage: COVER, guestLang: 'en' } });
    console.log('Branding existiert bereits — Titelbild und Sprache nachgezogen.');
  }

  // ── 3) Filialen ─────────────────────────────────────────
  const branchesCol = db.collection<Branch>('branches');
  const branchSeeds = [
    { slug: 'jzp', name: 'JZP', address: 'Slavíkova 1611/5, 120 00 Praha 2' },
    { slug: 'maj', name: 'Maj', address: 'Národní 63/26, 110 00 Praha 1' },
  ];
  const branches: Branch[] = [];
  for (const b of branchSeeds) {
    const existing = await branchesCol.findOne({ slug: b.slug });
    if (existing) {
      branches.push(existing);
      console.log(`Filiale "${b.name}" existiert bereits.`);
    } else {
      const res = await branchesCol.insertOne({ ...b });
      branches.push({ _id: res.insertedId, ...b });
      console.log(`Filiale "${b.name}" angelegt.`);
    }
  }
  const bySlug = new Map(branches.map(b => [b.slug, b._id!.toString()]));

  // ── 4) Speisekarte ──────────────────────────────────────
  const dishesCol = db.collection<DishDoc>('dishes');
  if ((await dishesCol.countDocuments()) === 0) {
    await dishesCol.insertMany(MENU.map(m => ({
      name: m.name,
      img: IMG(m.photo),
      price: m.price,
      cat: m.cat,
      branchIds: m.only ? m.only.map(s => bySlug.get(s)!).filter(Boolean) : null,
      ratingsByBranch: {},
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

  // ── 5) Tische: JZP 1–14, Maj 1–8 ────────────────────────
  const tablesCol = db.collection<TableDoc>('tables');
  const mk = (branchId: string) => (number: number): Omit<TableDoc, '_id'> => ({
    branchId, number, status: 'frei', items: [], openedAt: null, orderId: null,
  });
  const tableCounts: Record<string, number> = { jzp: 14, maj: 8 };
  for (const b of branches) {
    const branchId = b._id!.toString();
    if ((await tablesCol.countDocuments({ branchId })) === 0) {
      const count = tableCounts[b.slug];
      await tablesCol.insertMany(Array.from({ length: count }, (_, k) => k + 1).map(mk(branchId)));
      console.log(`Tische 1–${count} für "${b.name}" angelegt.`);
    } else {
      console.log(`Tische für "${b.name}" existieren bereits.`);
    }
  }

  // ── 6) Gutscheine ───────────────────────────────────────
  const vouchersCol = db.collection<VoucherDoc>('vouchers');
  const voucherDocs = VOUCHERS.map(v => ({
    title: v.title, points: v.points, expiry: halfYearOut(),
    branchIds: v.only ? v.only.map(s => bySlug.get(s)!).filter(Boolean) : null,
    img: v.img,
  }));
  if ((await vouchersCol.countDocuments()) === 0) {
    await vouchersCol.insertMany(voucherDocs);
    console.log(`Gutscheine angelegt (${voucherDocs.length}).`);
  } else {
    let fixed = 0;
    for (const v of voucherDocs) {
      const r = await vouchersCol.updateOne({ title: v.title }, { $set: { img: v.img } });
      fixed += r.modifiedCount;
    }
    console.log(`Gutscheine existieren bereits — ${fixed} Fotos aktualisiert.`);
  }

  // ── 7) Personal ─────────────────────────────────────────
  const jzpId = bySlug.get('jzp')!;
  const majId = bySlug.get('maj')!;
  const usersCol = db.collection<UserDoc>('users');
  const demoUsers: Omit<UserDoc, '_id' | 'passwordHash'>[] = [
    { name: 'Alexander Si', email: OWNER_EMAIL, role: 'Admin', branchId: null, status: 'aktiv' },
    { name: 'Bitely Admin CZ', email: 'admin.cz@theminers.eu', role: 'Admin', branchId: null, status: 'aktiv' },
    { name: 'Chain Manager CZ', email: 'chain.cz@theminers.eu', role: 'Admin', branchId: null, status: 'aktiv' },
    { name: 'Vedoucí JZP', email: 'lead.jzp@theminers.eu', role: 'Manager', branchId: jzpId, status: 'aktiv' },
    { name: 'Vedoucí Maj', email: 'lead.maj@theminers.eu', role: 'Manager', branchId: majId, status: 'aktiv' },
    { name: 'Barista JZP 1', email: 'barista.jzp1@theminers.eu', role: 'Kellner', branchId: jzpId, status: 'aktiv' },
    { name: 'Barista JZP 2', email: 'barista.jzp2@theminers.eu', role: 'Kellner', branchId: jzpId, status: 'aktiv' },
    { name: 'Barista Maj 1', email: 'barista.maj1@theminers.eu', role: 'Kellner', branchId: majId, status: 'aktiv' },
  ];
  for (const u of demoUsers) {
    await usersCol.updateOne(
      { email: u.email },
      { $set: { ...u, passwordHash: hashPassword(DEMO_PASSWORD) } },
      { upsert: true },
    );
  }
  console.log(`Personal angelegt/aktualisiert (${demoUsers.length} Konten).`);

  // ── 8) Demo-Gastkonten ──────────────────────────────────
  const guestsCol = db.collection<GuestDoc>('guests');
  const demoGuests = [
    { email: 'host.stalyzakaznik@example.com', name: 'Stálý zákazník', points: 420 },
    { email: 'host.novy@example.com', name: 'Nový', points: 20 },
    { email: 'host.turista@example.com', name: 'Turista', points: 60 },
  ];
  for (const g of demoGuests) {
    if ((await guestsCol.countDocuments({ email: g.email })) > 0) continue;
    await guestsCol.insertOne({
      email: g.email, name: g.name, passwordHash: hashPassword(DEMO_PASSWORD),
      googleSub: null, points: g.points, redeemed: [], createdAt: Date.now(),
    });
  }
  console.log(`Demo-Gastkonten angelegt/geprüft (${demoGuests.length}).`);

  // ── 9) Kuratierte Bewertungen (beide Filialen) ──────────
  const ordersCol = db.collection<OrderDoc>('orders');
  const reviewsCol = db.collection<ReviewDoc>('reviews');
  const allTables = await tablesCol.find().toArray();
  const tableKey = (branchId: string, n: number) => `${branchId}#${n}`;
  const tableByKey = new Map(allTables.map(t => [tableKey(t.branchId, t.number), t]));

  if ((await reviewsCol.countDocuments({ demo: true })) === 0) {
    const orderDocs: Omit<OrderDoc, '_id'>[] = [];
    const reviewDocs: Omit<ReviewDoc, '_id'>[] = [];
    for (const sr of SEED_REVIEWS) {
      const branchId = bySlug.get(sr.branch)!;
      const table = tableByKey.get(tableKey(branchId, sr.table));
      if (!table) continue;
      const at = new Date();
      at.setDate(at.getDate() - sr.daysAgo);
      at.setHours(10, 0, 0, 0);
      at.setMinutes(at.getMinutes() + Math.floor(Math.random() * 480));
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
        overall: { service, ambience: 0, speed: 0 },
        createdAt: at.getTime() + 55 * 60 * 1000, demo: true,
      });
    }
    await ordersCol.insertMany(orderDocs as OrderDoc[]);
    await reviewsCol.insertMany(reviewDocs as ReviewDoc[]);
    console.log(`Kuratierte Bewertungen angelegt (${reviewDocs.length} Bestellungen, JZP + Maj).`);
  } else {
    console.log('Kuratierte Bewertungen existieren bereits.');
  }

  // Gerichtsschnitte aus allen Bewertungen neu rechnen.
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
  console.log(`  ${ORG_NAME}  (/${ORG_SLUG})   Prag · CZK · Gastansicht EN`);
  console.log('─────────────────────────────────────────');
  console.log(`  Verwaltung   /${ORG_SLUG}/admin`);
  console.log(`  Personal     /${ORG_SLUG}/staff`);
  console.log(`  QR am Tisch  /${ORG_SLUG}/jzp/table/4`);
  console.log(`               /${ORG_SLUG}/maj/table/1`);
  console.log('\n  Zugänge (Passwort jeweils gleich):');
  console.log(`    ${OWNER_EMAIL}   Admin (ganze Kette)   / ${DEMO_PASSWORD}`);
  console.log(`    lead.jzp@theminers.eu   Vedoucí JZP   / ${DEMO_PASSWORD}`);
  console.log(`    lead.maj@theminers.eu   Vedoucí Maj   / ${DEMO_PASSWORD}`);
  console.log(`    barista.jzp1@theminers.eu   Service JZP   / ${DEMO_PASSWORD}`);
  console.log(`    host.stalyzakaznik@example.com   Gast, 420 Punkte   / ${DEMO_PASSWORD}`);
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
