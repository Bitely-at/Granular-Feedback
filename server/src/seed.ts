import 'dotenv/config';
import { platformDb, orgDbBySlug, closeDb } from './db.js';
import type { Organization, Branch, DishDoc, TableDoc, VoucherDoc, UserDoc, BrandDoc, GuestProfileDoc } from './types.js';

const ORG_SLUG = 'sakura-sushi';

const IMG = (id: string, w = 400, h = 400) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;

function seedDish(name: string, img: string, price: number, cat: DishDoc['cat'], avg: number, count: number): Omit<DishDoc, '_id'> {
  return { name, img, price, cat, ratingsSum: Math.round(avg * count), ratingsCount: count };
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

  const branchesCol = db.collection<Branch>('branches');
  let branch = await branchesCol.findOne({ slug: 'herrengasse' });
  if (!branch) {
    const res = await branchesCol.insertOne({ slug: 'herrengasse', name: 'Herrengasse', address: 'Herrengasse 12, 8010 Graz' });
    branch = { _id: res.insertedId, slug: 'herrengasse', name: 'Herrengasse', address: 'Herrengasse 12, 8010 Graz' };
    console.log('Filiale "Graz · Herrengasse" angelegt.');
  } else {
    console.log('Filiale existiert bereits.');
  }
  const branchId = branch._id!.toString();

  const dishesCol = db.collection<DishDoc>('dishes');
  if ((await dishesCol.countDocuments()) === 0) {
    await dishesCol.insertMany([
      seedDish('Spicy Tuna Roll', IMG('photo-1611143669185-af224c5e3252'), 14.5, 'Speisen', 4.6, 87),
      seedDish('California Roll', IMG('photo-1617196034183-421b4917c92d'), 12.5, 'Speisen', 4.2, 74),
      seedDish('Dragon Roll', IMG('photo-1633478062482-790e3b5dd810'), 16.0, 'Speisen', 2.4, 65),
      seedDish('Miso Suppe', IMG('photo-1680137248903-7af5d51a3350'), 4.5, 'Speisen', 3.1, 91),
      seedDish('Lachs Nigiri', IMG('photo-1562158074-d49fbeffcc91'), 13.0, 'Speisen', 4.8, 52),
      seedDish('Edamame', IMG('photo-1611810174991-5cdd99a2c6b2'), 5.0, 'Speisen', 4.1, 43),
      seedDish('Asahi Bier', IMG('photo-1571613316887-6f8d5cbf7ef7'), 4.8, 'Getränke', 4.5, 38),
      seedDish('Japanischer Sake', IMG('photo-1594035900144-17151c9910af'), 6.5, 'Getränke', 4.3, 29),
      seedDish('Matcha Latte', IMG('photo-1515823064-d6e0c04616a7'), 4.2, 'Getränke', 4.7, 61),
    ]);
    console.log('Gerichte angelegt.');
  } else {
    console.log('Gerichte existieren bereits.');
  }
  const dishIds = (await dishesCol.find().toArray()).map(d => d._id!.toString());

  const tablesCol = db.collection<TableDoc>('tables');
  if ((await tablesCol.countDocuments()) === 0) {
    const mk = (
      number: number,
      status: TableDoc['status'],
      itemIdxQty: [number, number][],
      minutesAgo: number | null
    ): Omit<TableDoc, '_id'> => ({
      branchId,
      number,
      status,
      items: itemIdxQty.map(([idx, qty]) => ({ dishId: dishIds[idx], qty })),
      openedAt: minutesAgo == null ? null : Date.now() - minutesAgo * 60000,
    });
    await tablesCol.insertMany([
      mk(1, 'frei', [], null),
      mk(2, 'offen', [[0, 2], [6, 2]], 22),
      mk(3, 'abgeschlossen', [[4, 2], [8, 2], [5, 2]], 60),
      mk(4, 'offen', [[0, 1], [1, 1], [2, 1]], 8), // Tisch 4 = Demo-Gasttisch, siehe README
      mk(5, 'frei', [], null),
      mk(6, 'offen', [[1, 3], [7, 2], [3, 2]], 45),
      mk(7, 'frei', [], null),
      mk(8, 'abgeschlossen', [[4, 1], [8, 2]], 120),
      mk(9, 'offen', [[2, 2], [5, 3]], 15),
      mk(10, 'frei', [], null),
      mk(11, 'offen', [[6, 3]], 33),
      mk(12, 'frei', [], null),
    ]);
    console.log('Tische angelegt.');
  } else {
    console.log('Tische existieren bereits.');
  }

  const vouchersCol = db.collection<VoucherDoc>('vouchers');
  if ((await vouchersCol.countDocuments()) === 0) {
    await vouchersCol.insertMany([
      { title: 'Gratis Miso Suppe', points: 100, expiry: '30.09.2026', img: IMG('photo-1680137248903-7af5d51a3350', 800, 400) },
      { title: '10 % Rabatt auf alles', points: 250, expiry: '31.10.2026', img: IMG('photo-1562158074-d49fbeffcc91', 800, 400) },
      { title: 'Gratis Inside-Out Roll', points: 400, expiry: '15.11.2026', img: IMG('photo-1611143669185-af224c5e3252', 800, 400) },
      { title: '20 % auf den gesamten Besuch', points: 600, expiry: '31.12.2026', img: IMG('photo-1617196034183-421b4917c92d', 800, 400) },
    ]);
    console.log('Gutscheine angelegt.');
  } else {
    console.log('Gutscheine existieren bereits.');
  }

  const usersCol = db.collection<UserDoc>('users');
  if ((await usersCol.countDocuments()) === 0) {
    await usersCol.insertMany([
      { name: 'Hiroshi Tanaka', email: 'h.tanaka@sakura.at', role: 'Admin', branchId: null, status: 'aktiv' },
      { name: 'Maria Gruber', email: 'm.gruber@sakura.at', role: 'Manager', branchId, status: 'aktiv' },
      { name: 'Jakob Weber', email: 'j.weber@sakura.at', role: 'Kellner', branchId, status: 'aktiv' },
      { name: 'Sina Koller', email: 's.koller@sakura.at', role: 'Kellner', branchId, status: 'eingeladen' },
    ]);
    console.log('Benutzer angelegt.');
  } else {
    console.log('Benutzer existieren bereits.');
  }

  const settingsCol = db.collection<BrandDoc>('settings');
  if ((await settingsCol.countDocuments({ _id: 'brand' })) === 0) {
    await settingsCol.insertOne({ _id: 'brand', name: 'Sakura Sushi', accent: '#16A34A', logo: '🌸' });
    console.log('Branding angelegt.');
  } else {
    console.log('Branding existiert bereits.');
  }

  const guestCol = db.collection<GuestProfileDoc>('guestProfile');
  if ((await guestCol.countDocuments({ _id: 'default' })) === 0) {
    await guestCol.insertOne({ _id: 'default', points: 0, redeemed: [], loggedIn: false });
    console.log('Gast-Profil angelegt.');
  } else {
    console.log('Gast-Profil existiert bereits.');
  }

  console.log(`\nFertig. Demo-Gast-URL fürs Handy/QR-Code: /${ORG_SLUG}/table/4`);
  console.log(`Kellner-URL: /${ORG_SLUG}/staff`);
  console.log(`Admin-URL: /${ORG_SLUG}/admin`);
  await closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
