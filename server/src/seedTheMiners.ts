import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { platformDb, orgDbBySlug, closeDb } from './db.js';
import { hashPassword } from './auth.js';
import type {
  Organization, Branch, DishDoc, TableDoc, VoucherDoc, UserDoc, BrandDoc, GuestDoc,
  OrderDoc, ReviewDoc,
} from './types.js';

// ═══════════════════════════════════════════════════════════
// Demo-Mandant "The Miners" (Specialty-Coffee-Kette)
//
//   npm run seed:miners --prefix server
//
// Baut die Organisation 'the-miners' mit zwei Filialen (Wien Naschmarkt,
// Dresden Altstadt), der echten Kaffeekarte, Gutscheinen, Personal- und
// Gastkonten und einer Handvoll kuratierter, gerichtsgenauer Bewertungen —
// das Muster "Kaffee besser bewertet als Speisen", das den Pitch trägt.
//
// Datenquelle: theminers.eu (Karte, Standorte) und öffentliche Google-/
// Falstaff-Rezensionen, aggregiert und paraphrasiert (siehe die beiden
// JSON-Dateien in ~/Downloads, aus denen dieses Skript entstanden ist).
//
// Das Skript ist wiederholbar: was schon da ist, bleibt unangetastet.
//
// Zwei bekannte Lücken, die hier bewusst weggelassen sind:
//  • Kein Pro-Filial-Preis — die Karte gilt kettenweit. Für Wien/Dresden (beide
//    EUR) unkritisch; Prag (CZK) oder Barcelona wären damit nicht abbildbar.
//  • Modifier (Extra Shot, Decaf, Alternativmilch) kennt das Datenmodell nicht.
//  • Die Punkte-Ökonomie ist fest im Server: 20 Punkte je bewertetem Gericht
//    plus 30 je Bewertung (POINTS_PER_DISH / POINTS_PER_REVIEW in index.ts).
//    Die Gutschein-Punktepreise unten stammen aus der Vorlage und sind gemessen
//    daran eher günstig — in der Verwaltung nachziehbar.
// ═══════════════════════════════════════════════════════════

const ORG_SLUG = 'the-miners';
const ORG_NAME = 'The Miners';

// Echte The-Miners-Bilder liegen auf ihrem eigenen CDN (Shoptet). Nur das
// Lokal und die Verkaufsware sind dort abgelichtet — von den einzelnen
// Getränken und Speisen gibt es KEINE Fotos (die Onlinekarte ist reiner Text).
// Deshalb: Marken-Titelbild und Gutscheine mit echten Miners-Aufnahmen,
// die 20 Karten-Positionen mit passend ausgesuchten Unsplash-Fotos. Jedes
// Foto ist über die Verwaltung tauschbar (Gericht antippen, „Foto ändern").
const MINERS = (path: string) =>
  `https://cdn.myshoptet.com/usr/www.theminers.eu/user/${path}`;

// Unsplash-CDN, feste Foto-IDs — jedes von Hand gegen das Gericht geprüft.
const IMG = (id: string, w = 600, h = 600) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;

/** dd.mm.yyyy, rund ein halbes Jahr in der Zukunft — `voucherExpired` liest das. */
function halfYearOut(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// ── Kaffeekarte Wien Naschmarkt (theminers.eu) ───────────────
// `cat` kennt nur 'Speisen' | 'Getränke'; die feinere Einteilung der echten
// Karte (Kaffee heiß / kalt / andere Getränke / Brunch / Pastry) geht dabei
// verloren. `only` = Filial-Slugs, in denen das Gericht geführt wird; fehlt es,
// führt es die ganze Kette (branchIds: null).
interface MenuItem {
  sku: string;
  name: string;
  price: number;
  cat: DishDoc['cat'];
  photo: string; // Unsplash-Foto-ID, gegen das Gericht geprüft
  only?: string[];
}

const MENU: MenuItem[] = [
  { sku: 'esp', name: 'Espresso', price: 3.30, cat: 'Getränke', photo: 'photo-1510591509098-f4fdc6d0ff04' },
  { sku: 'batch', name: 'Batch Brew', price: 4.50, cat: 'Getränke', photo: 'photo-1610874150308-a1e6f8c905d9' },
  { sku: 'capp', name: 'Cappuccino', price: 4.10, cat: 'Getränke', photo: 'photo-1497636577773-f1231844b336' },
  { sku: 'latte', name: 'Latte', price: 5.00, cat: 'Getränke', photo: 'photo-1557772611-722dabe20327' },
  { sku: 'flat', name: 'Flat White', price: 5.50, cat: 'Getränke', photo: 'photo-1541167760496-1628856ab772' },
  { sku: 'cort', name: 'Cortado', price: 4.80, cat: 'Getränke', photo: 'photo-1610889556528-9a770e32642f' },

  { sku: 'ilatte', name: 'Iced Latte', price: 5.00, cat: 'Getränke', photo: 'photo-1461023058943-07fcbe16d735' },
  { sku: 'icm', name: 'Iced Coconut Matcha', price: 6.00, cat: 'Getränke', photo: 'photo-1717603545758-88cc454db69b', only: ['naschmarkt'] },
  { sku: 'etonic', name: 'Espresso Tonic', price: 5.80, cat: 'Getränke', photo: 'photo-1753700281029-b3d15df20ec4', only: ['naschmarkt'] },

  { sku: 'chai', name: 'Chai Latte', price: 4.80, cat: 'Getränke', photo: 'photo-1561336526-2914f13ceb36' },
  { sku: 'match', name: 'Matcha Latte', price: 5.50, cat: 'Getränke', photo: 'photo-1515823064-d6e0c04616a7' },
  { sku: 'tea', name: 'Tea', price: 4.50, cat: 'Getränke', photo: 'photo-1491720731493-223f97d92c21' },
  { sku: 'choc', name: 'Hot Chocolate', price: 5.00, cat: 'Getränke', photo: 'photo-1637572815755-c4b80092dce1' },

  { sku: 'syrm', name: 'Syrniki with Mascarpone', price: 10.50, cat: 'Speisen', photo: 'photo-1612182062633-9ff3b3598e96', only: ['naschmarkt'] },
  { sku: 'syrs', name: 'Syrniki with Salmon', price: 12.50, cat: 'Speisen', photo: 'photo-1577906096429-f73c2c312435', only: ['naschmarkt'] },
  { sku: 'omel', name: 'Omelette', price: 10.50, cat: 'Speisen', photo: 'photo-1510693206972-df098062cb71', only: ['naschmarkt'] },
  { sku: 'fegg', name: 'Fried Eggs', price: 8.50, cat: 'Speisen', photo: 'photo-1525351484163-7529414344d8', only: ['naschmarkt'] },

  { sku: 'chees', name: 'Cheesecake', price: 5.50, cat: 'Speisen', photo: 'photo-1676300185983-d5f242babe34' },
  { sku: 'cook', name: 'Chocolate Chip Cookie', price: 3.90, cat: 'Speisen', photo: 'photo-1499636136210-6f4ee915583e' },
  { sku: 'crois', name: 'Croissant', price: 3.50, cat: 'Speisen', photo: 'photo-1555507036-ab1f4038808a' },
];

// Gutscheine mit echten Miners-Bildern, wo es eins gibt: das Lokal am
// Naschmarkt und die eigene Röstung. „Extra Shot" bleibt bei einem passenden
// Unsplash-Foto — dafür haben sie keine eigene Aufnahme.
const VOUCHERS = [
  { title: 'Batch Brew gratis', points: 120, img: MINERS('documents/upload/Austria/Vienna/Naschmarkt/naschmarkt_01.jpg') },
  { title: 'Extra Shot gratis', points: 30, img: IMG('photo-1624296410333-b89ab23cf0eb', 1000, 500) },
  { title: 'Pastry des Tages gratis', points: 150, img: MINERS('documents/upload/Austria/Vienna/Naschmarkt/naschmarkt_10.jpg') },
  { title: '20 % auf 250 g Bohnen', points: 250, img: MINERS('shop/big/1466-5_brazil-monteiro-lobato-front.png') },
  { title: '5 € auf Wochenend-Brunch', points: 400, img: MINERS('documents/upload/Austria/Vienna/Naschmarkt/naschmarkt_06.jpg') },
];

// ── Kuratierte Bewertungen, alle Filiale Naschmarkt ──────────
// Thematisch an öffentlichen Google-Rezensionen orientiert, selbst formuliert.
// Ergibt das Muster "Getränke deutlich besser als Speisen" — das stärkste
// Argument für gerichtsgenaues Feedback statt eines Venue-Sterns.
interface SeedReview {
  table: number;
  items: { sku: string; stars: number; note: string }[];
  daysAgo: number;
}

const SEED_REVIEWS: SeedReview[] = [
  { table: 3, daysAgo: 9, items: [
    { sku: 'batch', stars: 5, note: 'Schokoladig, sehr sauber gebrüht.' },
    { sku: 'chees', stars: 5, note: 'Bester Cheesecake seit langem.' },
  ] },
  { table: 1, daysAgo: 8, items: [
    { sku: 'ilatte', stars: 3, note: 'Zu milchlastig, Kaffee kaum rauszuschmecken.' },
  ] },
  { table: 5, daysAgo: 6, items: [
    { sku: 'flat', stars: 5, note: 'Milchschaum perfekt texturiert.' },
    { sku: 'syrm', stars: 4, note: 'Sehr gut, aber für die Portion teuer.' },
  ] },
  { table: 2, daysAgo: 5, items: [
    { sku: 'match', stars: 5, note: 'Cremig, nicht zu süß.' },
  ] },
  { table: 7, daysAgo: 3, items: [
    { sku: 'omel', stars: 3, note: 'Lange Wartezeit, Focaccia nur lauwarm.' },
  ] },
  { table: 4, daysAgo: 1, items: [
    { sku: 'esp', stars: 4, note: 'Ausgewogen, Preis grenzwertig.' },
  ] },
];

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'bitely123';
// Ketten-Admin auf dem eigenen Konto — so ist die Verwaltung ohne weitere
// Einrichtung erreichbar.
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

  // ── 2) Org-DB öffnen (legt alle Indizes an) ──────────────
  const db = await orgDbBySlug(ORG_SLUG);

  // ── 3) Branding ─────────────────────────────────────────
  // Titelbild des Gast-Willkommensbildschirms: das designierte Cover-Foto der
  // Filiale Naschmarkt von der Miners-Website (44 KB webp). Beim Wiederholungs-
  // lauf nachgezogen, den Rest der Marken-Einstellungen aber nicht anfassen.
  const COVER = MINERS('documents/upload/covers/naschmarkt_00.webp');
  const settingsCol = db.collection<BrandDoc>('settings');
  if ((await settingsCol.countDocuments({ _id: 'brand' })) === 0) {
    await settingsCol.insertOne({ _id: 'brand', name: ORG_NAME, accent: '#C8A882', logo: '☕', coverImage: COVER });
    console.log('Branding angelegt.');
  } else {
    await settingsCol.updateOne({ _id: 'brand' }, { $set: { coverImage: COVER } });
    console.log('Branding existiert bereits — Titelbild nachgezogen.');
  }

  // ── 4) Filialen ─────────────────────────────────────────
  const branchesCol = db.collection<Branch>('branches');
  const branchSeeds = [
    { slug: 'naschmarkt', name: 'Naschmarkt', address: 'Getreidemarkt 1, 1060 Wien' },
    { slug: 'altstadt', name: 'Altstadt', address: 'Annenstraße 4, 01067 Dresden' },
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
  const naschmarktId = bySlug.get('naschmarkt')!;

  // ── 5) Speisekarte ──────────────────────────────────────
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
    // Bestehende Karte: nur das Foto nachziehen (Name/Preis gehören dem Kunden,
    // sobald er sie in der Verwaltung angefasst hat).
    let fixed = 0;
    for (const m of MENU) {
      const r = await dishesCol.updateOne({ name: m.name }, { $set: { img: IMG(m.photo) } });
      fixed += r.modifiedCount;
    }
    console.log(`Speisekarte existiert bereits — ${fixed} Fotos aktualisiert.`);
  }
  // sku -> dishId, über den Namen (funktioniert auch beim Wiederholungslauf)
  const dishDocs = await dishesCol.find().toArray();
  const idByName = new Map(dishDocs.map(d => [d.name, d._id!.toString()]));
  const dishIdBySku = new Map(MENU.map(m => [m.sku, idByName.get(m.name)!]));

  // ── 6) Tische: Naschmarkt 1–8, Altstadt 1–12 ────────────
  const tablesCol = db.collection<TableDoc>('tables');
  const mk = (branchId: string) => (number: number): Omit<TableDoc, '_id'> => ({
    branchId, number, status: 'frei', items: [], openedAt: null, orderId: null,
  });
  const tableCounts: Record<string, number> = { naschmarkt: 8, altstadt: 12 };
  for (const b of branches) {
    const branchId = b._id!.toString();
    if ((await tablesCol.countDocuments({ branchId })) === 0) {
      const count = tableCounts[b.slug];
      await tablesCol.insertMany(
        Array.from({ length: count }, (_, k) => k + 1).map(mk(branchId)),
      );
      console.log(`Tische 1–${count} für "${b.name}" angelegt.`);
    } else {
      console.log(`Tische für "${b.name}" existieren bereits.`);
    }
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
    { name: 'Bitely Admin', email: 'admin@theminers.eu', role: 'Admin', branchId: null, status: 'aktiv' },
    { name: 'Chain Manager', email: 'chain@theminers.eu', role: 'Admin', branchId: null, status: 'aktiv' },
    { name: 'Filialleitung Wien', email: 'lead.wien@theminers.eu', role: 'Manager', branchId: naschmarktId, status: 'aktiv' },
    { name: 'Barista 1', email: 'barista1@theminers.eu', role: 'Kellner', branchId: naschmarktId, status: 'aktiv' },
    { name: 'Barista 2', email: 'barista2@theminers.eu', role: 'Kellner', branchId: naschmarktId, status: 'aktiv' },
    { name: 'Filialleitung Dresden', email: 'lead.dd@theminers.eu', role: 'Manager', branchId: bySlug.get('altstadt')!, status: 'aktiv' },
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
    { email: 'gast.stammkunde@example.com', name: 'Stammkunde', points: 340 },
    { email: 'gast.neu@example.com', name: 'Neukunde', points: 20 },
    { email: 'gast.tourist@example.com', name: 'Tourist', points: 130 },
  ];
  for (const g of demoGuests) {
    if ((await guestsCol.countDocuments({ email: g.email })) > 0) continue;
    await guestsCol.insertOne({
      email: g.email, name: g.name, passwordHash: hashPassword(DEMO_PASSWORD),
      googleSub: null, points: g.points, redeemed: [], createdAt: Date.now(),
    });
  }
  console.log(`Demo-Gastkonten angelegt/geprüft (${demoGuests.length}).`);

  // ── 10) Kuratierte Bewertungen (Filiale Naschmarkt) ─────
  const ordersCol = db.collection<OrderDoc>('orders');
  const reviewsCol = db.collection<ReviewDoc>('reviews');
  const naschmarktTables = await tablesCol.find({ branchId: naschmarktId }).toArray();
  const tableByNumber = new Map(naschmarktTables.map(t => [t.number, t]));

  if ((await reviewsCol.countDocuments({ demo: true })) === 0) {
    const orderDocs: Omit<OrderDoc, '_id'>[] = [];
    const reviewDocs: Omit<ReviewDoc, '_id'>[] = [];
    for (const sr of SEED_REVIEWS) {
      const table = tableByNumber.get(sr.table);
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
        orderId, branchId: naschmarktId, tableId: String(table._id), tableNumber: table.number,
        createdAt: at.getTime(), itemCount: sr.items.length, demo: true,
      });
      reviewDocs.push({
        orderId, branchId: naschmarktId, tableId: String(table._id), tableNumber: table.number,
        dishRatings,
        // Ambiente und Schnelligkeit werden nicht mehr gefragt: 0 = "nicht beurteilt".
        overall: { service, ambience: 0, speed: 0 },
        createdAt: at.getTime() + 55 * 60 * 1000, demo: true,
      });
    }
    await ordersCol.insertMany(orderDocs as OrderDoc[]);
    await reviewsCol.insertMany(reviewDocs as ReviewDoc[]);
    console.log(`Kuratierte Bewertungen angelegt (${reviewDocs.length} Bestellungen, Filiale Naschmarkt).`);
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
  console.log(`  QR am Tisch  /${ORG_SLUG}/naschmarkt/table/3`);
  console.log(`               /${ORG_SLUG}/altstadt/table/1`);
  console.log('\n  Zugänge (Passwort jeweils gleich):');
  console.log(`    ${OWNER_EMAIL}   Admin (ganze Kette)   / ${DEMO_PASSWORD}`);
  console.log(`    lead.wien@theminers.eu    Filialleitung Wien    / ${DEMO_PASSWORD}`);
  console.log(`    barista1@theminers.eu     Service Wien          / ${DEMO_PASSWORD}`);
  console.log(`    lead.dd@theminers.eu      Filialleitung Dresden / ${DEMO_PASSWORD}`);
  console.log(`    gast.stammkunde@example.com  Gast, 340 Punkte   / ${DEMO_PASSWORD}`);
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
