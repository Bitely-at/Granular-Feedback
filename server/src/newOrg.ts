import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { platformDb, orgDbBySlug, closeDb } from './db.js';
import { hashPassword } from './auth.js';
import type {
  Organization, Branch, DishDoc, TableDoc, VoucherDoc, UserDoc, BrandDoc, GuestDoc,
} from './types.js';

// ═══════════════════════════════════════════════════════════
// Neue Organisation (Mandant) anlegen
//
//   npm run new-org --prefix server -- <slug> "<Name>" <admin-email> [passwort]
//   npm run new-org --prefix server -- <slug> "<Name>" <admin-email> [passwort] --demo [--kind=bistro]
//
// Ohne --demo entsteht das Minimum für einen echten Kunden: Registry-Eintrag,
// eine Filiale, Branding, ein Ketten-Admin mit Passwort. Menü, Tische und
// Gutscheine legt der Kunde danach in der Verwaltung an.
//
// Mit --demo kommt ein vorzeigbares Lokal dazu: eine Speisekarte (Preset über
// --kind, Standard "bistro"), acht Tische, drei Gutscheine, je ein Manager- und
// Kellner-Konto und ein Demo-Gastkonto mit Punkten. Erfundene Bewertungen holt
// man anschließend mit `npm run demo-reviews --prefix server -- <wochen> <slug>`.
//
// Das Skript ist wiederholbar: was schon da ist, bleibt unangetastet.
// ═══════════════════════════════════════════════════════════

const IMG = (id: string, w = 400, h = 400) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;

// Ein paar verlässliche Food-Fotos, rundum vergeben. Sie passen nicht immer
// zum Gerichtsnamen — für eine Vorführung genügt das, und in der Verwaltung
// lässt sich jedes Foto tauschen (Gericht antippen) oder per CSV mitbringen.
const PHOTOS = [
  'photo-1611143669185-af224c5e3252', 'photo-1617196034183-421b4917c92d',
  'photo-1633478062482-790e3b5dd810', 'photo-1680137248903-7af5d51a3350',
  'photo-1562158074-d49fbeffcc91', 'photo-1611810174991-5cdd99a2c6b2',
  'photo-1571613316887-6f8d5cbf7ef7', 'photo-1594035900144-17151c9910af',
  'photo-1515823064-d6e0c04616a7',
];

interface Preset {
  logo: string;
  accent: string;
  address: string;
  dishes: { name: string; price: number; cat: DishDoc['cat'] }[];
  vouchers: { title: string; points: number }[];
}

const PRESETS: Record<string, Preset> = {
  bistro: {
    logo: '🍽️', accent: '#B45309', address: 'Stubenring 8, 1010 Wien',
    dishes: [
      { name: 'Rindsgulasch mit Semmelknödel', price: 16.5, cat: 'Speisen' },
      { name: 'Wiener Schnitzel vom Kalb', price: 19.9, cat: 'Speisen' },
      { name: 'Caesar Salad mit Hühnerstreifen', price: 12.9, cat: 'Speisen' },
      { name: 'Pasta Arrabbiata', price: 13.5, cat: 'Speisen' },
      { name: 'Bistro-Burger mit Pommes', price: 15.9, cat: 'Speisen' },
      { name: 'Tagessuppe', price: 5.5, cat: 'Speisen' },
      { name: 'Hausgemachtes Tiramisu', price: 6.5, cat: 'Speisen' },
      { name: 'Hausbier 0,3 l', price: 3.9, cat: 'Getränke' },
      { name: 'Weißer Spritzer', price: 4.2, cat: 'Getränke' },
      { name: 'Espresso', price: 2.8, cat: 'Getränke' },
    ],
    vouchers: [
      { title: 'Gratis Tagessuppe', points: 100 },
      { title: '10 % auf die ganze Rechnung', points: 250 },
      { title: 'Gratis Hauptspeise', points: 500 },
    ],
  },
  pizza: {
    logo: '🍕', accent: '#DC2626', address: 'Praterstraße 21, 1020 Wien',
    dishes: [
      { name: 'Pizza Margherita', price: 9.9, cat: 'Speisen' },
      { name: 'Pizza Prosciutto e Funghi', price: 12.5, cat: 'Speisen' },
      { name: 'Pizza Diavola', price: 12.9, cat: 'Speisen' },
      { name: 'Pizza Quattro Formaggi', price: 13.5, cat: 'Speisen' },
      { name: 'Spaghetti Bolognese', price: 11.9, cat: 'Speisen' },
      { name: 'Insalata Mista', price: 6.5, cat: 'Speisen' },
      { name: 'Bruschetta al Pomodoro', price: 6.9, cat: 'Speisen' },
      { name: 'Panna Cotta', price: 5.5, cat: 'Speisen' },
      { name: 'Limonata', price: 3.5, cat: 'Getränke' },
      { name: 'Birra Moretti 0,33 l', price: 4.2, cat: 'Getränke' },
    ],
    vouchers: [
      { title: 'Gratis Bruschetta', points: 100 },
      { title: '10 % auf die ganze Rechnung', points: 250 },
      { title: 'Gratis Pizza nach Wahl', points: 500 },
    ],
  },
  sushi: {
    logo: '🍣', accent: '#16A34A', address: 'Rotenturmstraße 16, 1010 Wien',
    dishes: [
      { name: 'Spicy Tuna Roll', price: 14.5, cat: 'Speisen' },
      { name: 'California Roll', price: 12.5, cat: 'Speisen' },
      { name: 'Dragon Roll', price: 16.0, cat: 'Speisen' },
      { name: 'Miso Suppe', price: 4.5, cat: 'Speisen' },
      { name: 'Lachs Nigiri (2 Stück)', price: 6.5, cat: 'Speisen' },
      { name: 'Edamame', price: 5.0, cat: 'Speisen' },
      { name: 'Gyoza (5 Stück)', price: 7.5, cat: 'Speisen' },
      { name: 'Asahi Bier 0,33 l', price: 4.8, cat: 'Getränke' },
      { name: 'Sake, warm', price: 6.5, cat: 'Getränke' },
      { name: 'Matcha Latte', price: 4.2, cat: 'Getränke' },
    ],
    vouchers: [
      { title: 'Gratis Miso Suppe', points: 100 },
      { title: '10 % Rabatt', points: 250 },
      { title: 'Gratis Inside-Out Roll', points: 400 },
    ],
  },
  cafe: {
    logo: '☕', accent: '#92400E', address: 'Neubaugasse 44, 1070 Wien',
    dishes: [
      { name: 'Frühstücksteller', price: 11.5, cat: 'Speisen' },
      { name: 'Avocado-Brot mit Ei', price: 9.9, cat: 'Speisen' },
      { name: 'Bagel mit Räucherlachs', price: 9.5, cat: 'Speisen' },
      { name: 'Quiche des Tages', price: 8.5, cat: 'Speisen' },
      { name: 'Bananenbrot', price: 4.5, cat: 'Speisen' },
      { name: 'Käsekuchen', price: 4.9, cat: 'Speisen' },
      { name: 'Apfelstrudel', price: 5.2, cat: 'Speisen' },
      { name: 'Cappuccino', price: 3.8, cat: 'Getränke' },
      { name: 'Flat White', price: 4.2, cat: 'Getränke' },
      { name: 'Frisch gepresster Orangensaft', price: 4.9, cat: 'Getränke' },
    ],
    vouchers: [
      { title: 'Gratis Filterkaffee', points: 100 },
      { title: '10 % auf die ganze Rechnung', points: 250 },
      { title: 'Gratis Frühstücksteller', points: 500 },
    ],
  },
};

/** dd.mm.yyyy, rund ein halbes Jahr in der Zukunft — `voucherExpired` liest das. */
function halfYearOut(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function fail(msg: string): never {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter(a => a.startsWith('--'));
  const pos = args.filter(a => !a.startsWith('--'));

  const [slug, name, email, passwordArg] = pos;
  const demo = flags.includes('--demo');
  const kind = (flags.find(f => f.startsWith('--kind='))?.split('=')[1] ?? 'bistro').toLowerCase();

  if (!slug || !name || !email) {
    fail('Aufruf: npm run new-org --prefix server -- <slug> "<Name>" <admin-email> [passwort] [--demo] [--kind=bistro|pizza|sushi|cafe]');
  }
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(slug)) {
    fail(`Slug "${slug}" ist ungültig. Erlaubt: Kleinbuchstaben, Ziffern, Bindestrich; Anfang ein Buchstabe; 2 bis 41 Zeichen.`);
  }
  if (!email.includes('@')) fail(`"${email}" sieht nicht nach einer E-Mail aus.`);
  if (demo && !PRESETS[kind]) {
    fail(`Unbekanntes Preset "${kind}". Verfügbar: ${Object.keys(PRESETS).join(', ')}.`);
  }

  const password = passwordArg ?? `bitely-${randomBytes(4).toString('hex')}`;
  const preset = PRESETS[kind];

  // ── 1) Registry-Eintrag in der Plattform-DB ──────────────
  const platform = await platformDb();
  const orgs = platform.collection<Organization>('organizations');
  let org = await orgs.findOne({ slug });
  if (org) {
    console.log(`Organisation "${slug}" existiert bereits — wird ergänzt, nicht überschrieben.`);
  } else {
    const createdAt = Date.now();
    const res = await orgs.insertOne({ slug, name, createdAt });
    org = { _id: res.insertedId, slug, name, createdAt };
    console.log(`Organisation "${slug}" angelegt.`);
  }

  // ── 2) Org-DB öffnen: legt zugleich alle Indizes an (ensureOrgSchema) ──
  const db = await orgDbBySlug(slug);

  // ── 3) Branding ─────────────────────────────────────────
  const settingsCol = db.collection<BrandDoc>('settings');
  if ((await settingsCol.countDocuments({ _id: 'brand' })) === 0) {
    await settingsCol.insertOne({
      _id: 'brand', name,
      accent: demo ? preset.accent : '#16A34A',
      logo: demo ? preset.logo : '🍴',
    });
    console.log('Branding angelegt.');
  } else {
    console.log('Branding existiert bereits.');
  }

  // ── 4) Erste Filiale ────────────────────────────────────
  // Ohne Filiale lassen sich keine Tische anlegen; die letzte bleibt immer
  // stehen (siehe CLAUDE.md, "Löschen räumt mit auf").
  const branchesCol = db.collection<Branch>('branches');
  const branchSlug = demo ? 'zentrum' : 'hauptstandort';
  let branch = await branchesCol.findOne({ slug: branchSlug });
  if (!branch) {
    const res = await branchesCol.insertOne({
      slug: branchSlug,
      name: demo ? 'Zentrum' : 'Hauptstandort',
      address: demo ? preset.address : '',
    });
    branch = { _id: res.insertedId, slug: branchSlug, name: demo ? 'Zentrum' : 'Hauptstandort', address: demo ? preset.address : '' };
    console.log(`Filiale "${branch.name}" angelegt.`);
  } else {
    console.log(`Filiale "${branch.name}" existiert bereits.`);
  }
  const branchId = branch._id!.toString();

  // ── 5) Ketten-Admin ─────────────────────────────────────
  const usersCol = db.collection<UserDoc>('users');
  const existingAdmin = await usersCol.findOne({ email: email.toLowerCase() });
  if (!existingAdmin) {
    await usersCol.insertOne({
      name: name, email: email.toLowerCase(), passwordHash: hashPassword(password),
      role: 'Admin', branchId: null, status: 'aktiv',
    });
    console.log(`Ketten-Admin "${email}" angelegt.`);
  } else if (passwordArg) {
    await usersCol.updateOne({ _id: existingAdmin._id }, { $set: { passwordHash: hashPassword(password), status: 'aktiv' } });
    console.log(`Ketten-Admin "${email}" existierte — Passwort neu gesetzt.`);
  } else {
    console.log(`Ketten-Admin "${email}" existiert bereits — Passwort unverändert.`);
  }

  // ── 6) Nur mit --demo: vorzeigbares Lokal ────────────────
  if (demo) {
    const dishesCol = db.collection<DishDoc>('dishes');
    if ((await dishesCol.countDocuments()) === 0) {
      await dishesCol.insertMany(preset.dishes.map((d, i) => ({
        name: d.name, img: IMG(PHOTOS[i % PHOTOS.length]), price: d.price, cat: d.cat,
        branchIds: null, // die ganze (bisher einzige) Filiale führt es
        ratingsByBranch: {},
      })));
      console.log(`Speisekarte "${kind}" angelegt (${preset.dishes.length} Positionen).`);
    } else {
      console.log('Speisekarte existiert bereits.');
    }

    const tablesCol = db.collection<TableDoc>('tables');
    if ((await tablesCol.countDocuments({ branchId })) === 0) {
      await tablesCol.insertMany([1, 2, 3, 4, 5, 6, 7, 8].map(number => ({
        branchId, number, status: 'frei' as const, items: [], openedAt: null, orderId: null,
      })));
      console.log('Tische 1 bis 8 angelegt.');
    } else {
      console.log('Tische existieren bereits.');
    }

    const vouchersCol = db.collection<VoucherDoc>('vouchers');
    if ((await vouchersCol.countDocuments()) === 0) {
      const expiry = halfYearOut();
      await vouchersCol.insertMany(preset.vouchers.map((v, i) => ({
        title: v.title, points: v.points, expiry, branchIds: null,
        img: IMG(PHOTOS[i % PHOTOS.length], 800, 400),
      })));
      console.log(`Gutscheine angelegt (${preset.vouchers.length}, gültig bis ${expiry}).`);
    } else {
      console.log('Gutscheine existieren bereits.');
    }

    // Ein Manager- und ein Kellner-Konto, damit sich die Rollen vorführen
    // lassen. Passwort wie beim Admin.
    const demoStaff: Omit<UserDoc, '_id' | 'passwordHash'>[] = [
      { name: 'Demo-Filialleitung', email: `manager@${slug}.demo`, role: 'Manager', branchId, status: 'aktiv' },
      { name: 'Demo-Service', email: `kellner@${slug}.demo`, role: 'Kellner', branchId, status: 'aktiv' },
    ];
    for (const u of demoStaff) {
      await usersCol.updateOne(
        { email: u.email }, { $set: { ...u, passwordHash: hashPassword(password) } }, { upsert: true },
      );
    }
    console.log('Demo-Konten für Manager und Service angelegt.');

    const guestsCol = db.collection<GuestDoc>('guests');
    const guestEmail = `gast@${slug}.demo`;
    if ((await guestsCol.countDocuments({ email: guestEmail })) === 0) {
      await guestsCol.insertOne({
        email: guestEmail, name: 'Demo-Gast', passwordHash: hashPassword(password),
        googleSub: null, points: 500, redeemed: [], createdAt: Date.now(),
      });
      console.log(`Demo-Gastkonto angelegt (${guestEmail}).`);
    } else {
      console.log('Demo-Gastkonto existiert bereits.');
    }
  }

  // ── Zusammenfassung ─────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log(`  ${name}  (/${slug})`);
  console.log('─────────────────────────────────────────');
  console.log(`  Verwaltung   /${slug}/admin`);
  console.log(`  Personal     /${slug}/staff`);
  console.log(`  QR am Tisch  /${slug}/${branch.slug}/table/<nummer>`);
  console.log('\n  Ketten-Admin');
  console.log(`    ${email}`);
  console.log(passwordArg ? '    (Passwort wie übergeben)' : `    ${password}`);
  if (demo) {
    console.log('\n  Demo-Konten (Passwort wie oben)');
    console.log(`    manager@${slug}.demo   Filialleitung`);
    console.log(`    kellner@${slug}.demo   Service`);
    console.log(`    gast@${slug}.demo      Gast (500 Punkte)`);
    console.log(`\n  Erfundene Bewertungen fürs Dashboard:`);
    console.log(`    npm run demo-reviews --prefix server -- 8 ${slug}`);
    console.log(`  Wieder entfernen:`);
    console.log(`    npm run demo-reviews --prefix server -- --reset ${slug}`);
  } else {
    console.log('\n  Nächste Schritte in der Verwaltung: Speisekarte, Tische & QR, Gutscheine.');
  }
  console.log('');

  await closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
