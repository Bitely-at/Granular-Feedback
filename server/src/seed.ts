import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { platformDb, orgDbBySlug, closeDb } from './db.js';
import { hashPassword } from './auth.js';
import type { Organization, Branch, DishDoc, TableDoc, VoucherDoc, UserDoc, BrandDoc, GuestDoc } from './types.js';

const ORG_SLUG = 'sakura-sushi';

const IMG = (id: string, w = 400, h = 400) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;

// Die Demo-Bewertungen hängen an der Hauptfiliale — dort stehen auch die
// meisten Tische. Die zweite Filiale startet ohne Bewertungen, damit der
// Unterschied zwischen Filial- und Ketten-Blick im Admin sichtbar wird.
function seedDish(
  name: string, img: string, price: number, cat: DishDoc['cat'],
  avg: number, count: number, branchId: string,
  // null = die ganze Kette führt es. Nur die Ausnahmen bekommen eine Liste.
  branchIds: string[] | null = null
): Omit<DishDoc, '_id'> {
  return {
    name, img, price, cat, branchIds,
    ratingsByBranch: { [branchId]: { sum: Math.round(avg * count), count } },
  };
}

async function main() {
  const platform = await platformDb();
  const orgs = platform.collection<Organization>('organizations');

  let org = await orgs.findOne({ slug: ORG_SLUG });
  if (!org) {
    const createdAt = Date.now();
    const res = await orgs.insertOne({ slug: ORG_SLUG, name: 'Sakura Sushi', createdAt });
    org = { _id: res.insertedId, slug: ORG_SLUG, name: 'Sakura Sushi', createdAt };
    console.log(`Organisation '${ORG_SLUG}' angelegt.`);
  } else {
    console.log(`Organisation '${ORG_SLUG}' existiert bereits.`);
  }

  const db = await orgDbBySlug(ORG_SLUG);

  // Zwei Filialen, damit das Filial-Scoping überhaupt prüfbar ist: mit nur
  // einer sieht eine kaputte Filterung genauso aus wie eine funktionierende.
  const branchesCol = db.collection<Branch>('branches');
  const branchSeeds = [
    { slug: 'herrengasse', name: 'Herrengasse', address: 'Herrengasse 12, 8010 Graz' },
    { slug: 'hauptplatz', name: 'Hauptplatz', address: 'Hauptplatz 4, 8010 Graz' },
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
  const [mainBranch, secondBranch] = branches;
  const branchId = mainBranch._id!.toString();

  const dishesCol = db.collection<DishDoc>('dishes');
  if ((await dishesCol.countDocuments()) === 0) {
    await dishesCol.insertMany([
      seedDish('Spicy Tuna Roll', IMG('photo-1611143669185-af224c5e3252'), 14.5, 'Speisen', 4.6, 87, branchId),
      seedDish('California Roll', IMG('photo-1617196034183-421b4917c92d'), 12.5, 'Speisen', 4.2, 74, branchId),
      seedDish('Dragon Roll', IMG('photo-1633478062482-790e3b5dd810'), 16.0, 'Speisen', 2.4, 65, branchId),
      seedDish('Miso Suppe', IMG('photo-1680137248903-7af5d51a3350'), 4.5, 'Speisen', 3.1, 91, branchId),
      seedDish('Lachs Nigiri', IMG('photo-1562158074-d49fbeffcc91'), 13.0, 'Speisen', 4.8, 52, branchId),
      seedDish('Edamame', IMG('photo-1611810174991-5cdd99a2c6b2'), 5.0, 'Speisen', 4.1, 43, branchId),
      seedDish('Asahi Bier', IMG('photo-1571613316887-6f8d5cbf7ef7'), 4.8, 'Getränke', 4.5, 38, branchId),
      seedDish('Japanischer Sake', IMG('photo-1594035900144-17151c9910af'), 6.5, 'Getränke', 4.3, 29, branchId),
      seedDish('Matcha Latte', IMG('photo-1515823064-d6e0c04616a7'), 4.2, 'Getränke', 4.7, 61, branchId),
      // Absichtlich nur in EINER Filiale: so ist auf einen Blick prüfbar, dass
      // die Karte je Filiale abweichen kann.
      seedDish('Herrengassen-Bowl', IMG('photo-1617196034183-421b4917c92d'), 15.9, 'Speisen', 4.4, 12, branchId, [branchId]),
    ]);
    console.log('Gerichte angelegt.');
  } else {
    console.log('Gerichte existieren bereits.');
  }
  const dishIds = (await dishesCol.find().toArray()).map(d => d._id!.toString());

  const tablesCol = db.collection<TableDoc>('tables');
  // Tischnummern zählen PRO Filiale — beide Filialen fangen bei 1 an, Tisch 4
  // gibt es also zweimal, und die beiden sind verschiedene Tische.
  const mk = (forBranchId: string) => (
    number: number,
    status: TableDoc['status'],
    itemIdxQty: [number, number][],
    minutesAgo: number | null
  ): Omit<TableDoc, '_id'> => ({
    branchId: forBranchId,
    number,
    status,
    items: itemIdxQty.map(([idx, qty]) => ({ dishId: dishIds[idx], qty })),
    openedAt: minutesAgo == null ? null : Date.now() - minutesAgo * 60000,
    // Ein Tisch mit Gerichten trägt eine offene Bestellung; leere Tische nicht.
    orderId: itemIdxQty.length > 0 ? new ObjectId() : null,
  });

  if ((await tablesCol.countDocuments({ branchId })) === 0) {
    const t = mk(branchId);
    await tablesCol.insertMany([
      t(1, 'frei', [], null),
      t(2, 'offen', [[0, 2], [6, 2]], 22),
      t(3, 'frei', [], null),
      t(4, 'offen', [[0, 1], [1, 1], [2, 1]], 8), // Tisch 4 = Demo-Gasttisch, siehe README
      t(5, 'frei', [], null),
      t(6, 'offen', [[1, 3], [7, 2], [3, 2]], 45),
      t(7, 'frei', [], null),
      t(8, 'frei', [], null),
      t(9, 'offen', [[2, 2], [5, 3]], 15),
      t(10, 'frei', [], null),
      t(11, 'offen', [[6, 3]], 33),
      t(12, 'frei', [], null),
    ]);
    console.log(`Tische 1–12 für "${mainBranch.name}" angelegt.`);
  } else {
    console.log(`Tische für "${mainBranch.name}" existieren bereits.`);
  }

  const secondBranchId = secondBranch._id!.toString();
  if ((await tablesCol.countDocuments({ branchId: secondBranchId })) === 0) {
    const t = mk(secondBranchId);
    await tablesCol.insertMany([
      t(1, 'frei', [], null),
      t(2, 'offen', [[4, 2], [8, 2]], 12),
      t(3, 'frei', [], null),
      // Absichtlich belegt: Tisch 4 gibt es in beiden Filialen, mit anderem Inhalt.
      t(4, 'offen', [[5, 1], [7, 1]], 30),
      t(5, 'frei', [], null),
      t(6, 'frei', [], null),
    ]);
    console.log(`Tische 1–6 für "${secondBranch.name}" angelegt.`);
  } else {
    console.log(`Tische für "${secondBranch.name}" existieren bereits.`);
  }

  const vouchersCol = db.collection<VoucherDoc>('vouchers');
  if ((await vouchersCol.countDocuments()) === 0) {
    await vouchersCol.insertMany([
      // branchIds: null = in der ganzen Kette einlösbar. Der Gast sammelt
      // seine Punkte überall, also gilt der Gutschein auch überall.
      { title: 'Gratis Miso Suppe', points: 100, expiry: '30.09.2026', branchIds: null, img: IMG('photo-1680137248903-7af5d51a3350', 800, 400) },
      { title: '10 % Rabatt auf alles', points: 250, expiry: '31.10.2026', branchIds: null, img: IMG('photo-1562158074-d49fbeffcc91', 800, 400) },
      { title: 'Gratis Inside-Out Roll', points: 400, expiry: '15.11.2026', branchIds: null, img: IMG('photo-1611143669185-af224c5e3252', 800, 400) },
      // Eine Filialaktion — nur hier einlösbar.
      { title: '20 % am Hauptplatz', points: 600, expiry: '31.12.2026', branchIds: [secondBranch._id!.toString()], img: IMG('photo-1617196034183-421b4917c92d', 800, 400) },
    ]);
    console.log('Gutscheine angelegt.');
  } else {
    console.log('Gutscheine existieren bereits.');
  }

  // Test-Zugänge. Das Passwort ist bewusst überall gleich und steht im Klartext
  // im Quelltext — diese Zugänge sind für die lokale Demo gedacht, NICHT für
  // eine echte Installation. Für die Produktion gehören sie nach dem ersten
  // Login geändert oder gar nicht erst angelegt.
  const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'bitely123';

  const usersCol = db.collection<UserDoc>('users');
  // Je Rolle ein Zugang. Die zweite Filiale bekommt eine eigene Filialleitung —
  // damit lässt sich prüfen, dass sie die Daten der ersten nicht sieht.
  const demoUsers: Omit<UserDoc, '_id' | 'passwordHash'>[] = [
    { name: 'Hiroshi Tanaka', email: 'admin@sakura.at', role: 'Admin', branchId: null, status: 'aktiv' },
    { name: 'Maria Gruber', email: 'manager@sakura.at', role: 'Manager', branchId, status: 'aktiv' },
    { name: 'Elena Bauer', email: 'manager2@sakura.at', role: 'Manager', branchId: secondBranch._id!.toString(), status: 'aktiv' },
    { name: 'Jakob Weber', email: 'kellner@sakura.at', role: 'Kellner', branchId, status: 'aktiv' },
    { name: 'Sina Koller', email: 's.koller@sakura.at', role: 'Kellner', branchId, status: 'eingeladen' },
  ];
  for (const u of demoUsers) {
    // Eingeladene Benutzer bekommen kein Passwort — sie sollen sich (noch)
    // nicht anmelden können, das ist genau der Zustand, den 'eingeladen' meint.
    const passwordHash = u.status === 'aktiv' ? hashPassword(DEMO_PASSWORD) : null;
    // Passwort auch bei bestehenden Benutzern nachziehen: nach dem Update aus
    // der Zeit vor dem Login haben sie keins und kämen sonst nicht hinein.
    await usersCol.updateOne(
      { email: u.email },
      { $set: { ...u, passwordHash } },
      { upsert: true }
    );
  }
  console.log('Benutzer angelegt/aktualisiert.');

  const settingsCol = db.collection<BrandDoc>('settings');
  if ((await settingsCol.countDocuments({ _id: 'brand' })) === 0) {
    await settingsCol.insertOne({ _id: 'brand', name: 'Sakura Sushi', accent: '#16A34A', logo: '🌸' });
    console.log('Branding angelegt.');
  } else {
    console.log('Branding existiert bereits.');
  }

  // Ein Demo-Gastkonto, damit die Punkte- und Gutscheinansicht ohne
  // Registrierung vorführbar ist. Gäste legen sich sonst selbst eines an.
  const guestsCol = db.collection<GuestDoc>('guests');
  const demoGuestEmail = 'gast@example.com';
  if ((await guestsCol.countDocuments({ email: demoGuestEmail })) === 0) {
    await guestsCol.insertOne({
      email: demoGuestEmail, name: 'Demo-Gast', passwordHash: hashPassword(DEMO_PASSWORD),
      googleSub: null, points: 500, redeemed: [], createdAt: Date.now(),
    });
    console.log(`Demo-Gastkonto angelegt (${demoGuestEmail} / ${DEMO_PASSWORD}).`);
  } else {
    console.log('Demo-Gastkonto existiert bereits.');
  }

  console.log('\nFertig. QR-Ziele pro Filiale (Tisch 4 gibt es in beiden — verschiedene Tische):');
  for (const b of branches) {
    console.log(`  ${b.name.padEnd(13)} /${ORG_SLUG}/${b.slug}/table/4`);
  }
  console.log(`\nKellner-URL: /${ORG_SLUG}/staff`);
  console.log(`Admin-URL: /${ORG_SLUG}/admin`);
  console.log('\nTest-Zugänge (Passwort jeweils gleich):');
  console.log(`  Admin (ganze Kette)         admin@sakura.at     / ${DEMO_PASSWORD}`);
  console.log(`  Filialleitung ${branches[0].name.padEnd(13)} manager@sakura.at   / ${DEMO_PASSWORD}`);
  console.log(`  Filialleitung ${branches[1].name.padEnd(13)} manager2@sakura.at  / ${DEMO_PASSWORD}`);
  console.log(`  Servicekraft ${branches[0].name.padEnd(14)} kellner@sakura.at   / ${DEMO_PASSWORD}`);
  console.log('  Gast                        kein Konto nötig — über den QR-Link am Tisch');
  await closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
