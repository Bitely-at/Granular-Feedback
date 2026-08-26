import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { orgDbBySlug, closeDb } from './db.js';
import type { Branch, DishDoc, TableDoc, ReviewDoc, OrderDoc } from './types.js';

/**
 * Bestellungen und Bewertungen über mehrere Wochen erfinden — für Vorführungen
 * und für Bildschirmfotos der Website.
 *
 *   npm run demo-reviews --prefix server -- [wochen] [orgSlug]
 *   npm run demo-reviews --prefix server -- --reset [orgSlug]
 *
 * Warum überhaupt: `seed.ts` schreibt Gerichten zwar einen Schnitt in die
 * Stammdaten, legt aber KEINE Bewertungen an — das Dashboard rechnet jedoch
 * ausschließlich über `reviews`. Frisch aufgesetzt stand dort deshalb ein
 * leerer Verlauf neben einer Menütabelle voller Sterne. Und selbst mit ein
 * paar von Hand abgegebenen Bewertungen ergibt der Verlauf einen einzigen
 * Balken: alles entstand heute.
 *
 * Was hier entsteht, ist als Demo-Bestand gekennzeichnet (`demo: true`) und
 * lässt sich mit `--reset` restlos wieder entfernen. Ein
 * Kommandozeilen-Werkzeug und keine Route — wie bei `guest-points`: ein
 * Endpunkt, der Bewertungen erfindet, wäre eine Hintertür in die Statistik.
 */

/** Wie viele Bestellungen ein durchschnittlicher Tag bringt. */
const ORDERS_PER_DAY = 14;
/** Welcher Anteil einer Bestellung am Ende auch bewertet wird. */
const REVIEW_RATE = 0.45;

/**
 * Ein Zufallsgenerator mit Saat: derselbe Aufruf ergibt denselben Bestand.
 * Bildschirmfotos, die sich bei jedem Lauf ändern, ließen sich nicht
 * nachstellen — und ein Gericht, das gestern Zugpferd war und heute
 * Problemfall, macht die Erklärung der Matrix zunichte.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Aus dem Namen eine feste Zahl — damit jedes Gericht seinen eigenen Ruf hat. */
function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mitternacht des Tages, `offset` Tage vor heute. */
function dayAt(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d;
}

/**
 * Die Sterne für ein Gericht: um seinen Ruf herum gestreut, auf 1–5 begrenzt.
 * Ohne die Streuung stünde in jeder Zeile derselbe Wert, und die Matrix hätte
 * vier Felder, von denen drei leer bleiben.
 */
function starsFor(reputation: number, rnd: () => number): number {
  const drift = (rnd() + rnd() - 1) * 1.1;
  return Math.max(1, Math.min(5, Math.round(reputation + drift)));
}

/**
 * Die Bewertungen in den Stammdaten neu aus `reviews` rechnen.
 *
 * Beide Zahlen beschreiben dasselbe, entstehen aber getrennt: `reviews` ist
 * die Quelle des Dashboards, `ratingsByBranch` die des Menüs und der
 * Gastansicht. Nach einem Lauf hier — und erst recht nach `--reset` — müssen
 * sie wieder übereinstimmen.
 */
async function recomputeDishRatings(db: Awaited<ReturnType<typeof orgDbBySlug>>): Promise<number> {
  const reviews = await db.collection<ReviewDoc>('reviews').find({}).toArray();
  const byDish = new Map<string, Record<string, { sum: number; count: number }>>();
  for (const rv of reviews) {
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
  const dishes = await db.collection<DishDoc>('dishes').find({}).toArray();
  let touched = 0;
  for (const dish of dishes) {
    const next = byDish.get(String(dish._id)) ?? {};
    if (JSON.stringify(next) === JSON.stringify(dish.ratingsByBranch ?? {})) continue;
    await db.collection<DishDoc>('dishes').updateOne({ _id: dish._id }, { $set: { ratingsByBranch: next } });
    touched += 1;
  }
  return touched;
}

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const rest = args.filter(a => a !== '--reset');
  const orgSlug = rest.find(a => !/^[0-9]+$/.test(a)) ?? process.env.ORG_SLUG ?? 'sakura-sushi';
  const weeks = Number(rest.find(a => /^[0-9]+$/.test(a)) ?? 8);

  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
    console.error('Wochen müssen zwischen 1 und 52 liegen.');
    process.exit(1);
  }

  const db = await orgDbBySlug(orgSlug);

  if (reset) {
    const rv = await db.collection<ReviewDoc>('reviews').deleteMany({ demo: true });
    const or = await db.collection<OrderDoc>('orders').deleteMany({ demo: true });
    const touched = await recomputeDishRatings(db);
    console.log(`\nDemo-Bestand entfernt: ${rv.deletedCount} Bewertungen, ${or.deletedCount} Bestellungen.`);
    console.log(`Gerichtsschnitte neu gerechnet (${touched} angepasst).\n`);
    await closeDb();
    return;
  }

  const branches = await db.collection<Branch>('branches').find({}).toArray();
  const dishes = await db.collection<DishDoc>('dishes').find({}).toArray();
  const tables = await db.collection<TableDoc>('tables').find({}).toArray();
  if (branches.length === 0 || dishes.length === 0 || tables.length === 0) {
    console.error('Filialen, Gerichte oder Tische fehlen. Erst `npm run seed --prefix server`.');
    process.exit(1);
  }

  // Der Ruf eines Gerichts: fest am Namen, zwischen 3,3 und 4,9. Die Streuung
  // ist Absicht — sie füllt die vier Felder der Matrix. Nach unten reicht sie
  // trotzdem nur so weit, dass ein Lokal entsteht, das man vorzeigen kann:
  // ein Schnitt von 3,5 über die ganze Karte beschreibt kein Restaurant,
  // sondern eines mit einem Problem.
  const reputationOf = new Map<string, number>();
  // Wie oft ein Gericht überhaupt bestellt wird. Erst die Mischung aus Ruf und
  // Nachfrage trennt „Zugpferd" von „Geheimtipp".
  const demandOf = new Map<string, number>();
  for (const d of dishes) {
    const h = hashOf(d.name);
    reputationOf.set(String(d._id), 3.3 + (h % 17) / 10);
    demandOf.set(String(d._id), 1 + ((h >> 8) % 5));
  }

  const rnd = makeRandom(hashOf(orgSlug) ^ weeks);
  const reviewDocs: Omit<ReviewDoc, '_id'>[] = [];
  const orderDocs: Omit<OrderDoc, '_id'>[] = [];
  const days = weeks * 7;

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = dayAt(offset);
    const weekday = day.getDay();
    // Freitag und Samstag tragen ein Lokal, Montag ist ruhig. Ein Verlauf ohne
    // dieses Muster sieht aus wie ein Zufallsgenerator — weil er einer ist.
    const weekdayFactor = weekday === 5 || weekday === 6 ? 1.5 : weekday === 0 ? 1.1 : weekday === 1 ? 0.6 : 1;
    // Leichtes Wachstum über den Zeitraum: das Diagramm soll eine Richtung haben.
    const growth = 0.75 + (days - offset) / days * 0.5;
    const orders = Math.max(1, Math.round(ORDERS_PER_DAY * weekdayFactor * growth * (0.75 + rnd() * 0.5)));

    for (let i = 0; i < orders; i += 1) {
      // Die Hauptfiliale trägt drei Viertel — sie hat die meisten Tische.
      const branch = branches.length > 1 && rnd() > 0.75 ? branches[1] : branches[0];
      const branchId = String(branch._id);
      const branchTables = tables.filter(t => t.branchId === branchId);
      const branchDishes = dishes.filter(d => d.branchIds === null || d.branchIds.includes(branchId));
      if (branchTables.length === 0 || branchDishes.length === 0) continue;

      const table = branchTables[Math.floor(rnd() * branchTables.length)];
      const at = new Date(day);
      // Zwischen 11:30 und 22:00 — ein Lokal bewertet niemand um vier Uhr früh.
      at.setHours(11, 30, 0, 0);
      at.setMinutes(at.getMinutes() + Math.floor(rnd() * 630));

      // Nachfrage als Gewicht: beliebte Gerichte landen öfter im Korb.
      const picked: DishDoc[] = [];
      const wanted = 1 + Math.floor(rnd() * 4);
      for (let k = 0; k < wanted * 3 && picked.length < wanted; k += 1) {
        const candidate = branchDishes[Math.floor(rnd() * branchDishes.length)];
        const demand = demandOf.get(String(candidate._id)) ?? 3;
        if (rnd() * 5 > demand) continue;
        if (picked.some(p => String(p._id) === String(candidate._id))) continue;
        picked.push(candidate);
      }
      if (picked.length === 0) picked.push(branchDishes[Math.floor(rnd() * branchDishes.length)]);

      const orderId = new ObjectId();
      orderDocs.push({
        orderId, branchId, tableId: String(table._id), tableNumber: table.number,
        createdAt: at.getTime(), itemCount: picked.length, demo: true,
      });

      if (rnd() > REVIEW_RATE) continue;
      // Die Bewertung kommt gegen Ende des Besuchs, nicht bei der Bestellung.
      const reviewedAt = at.getTime() + (40 + Math.floor(rnd() * 50)) * 60 * 1000;
      const dishRatings = picked.map(d => ({
        dishId: String(d._id),
        stars: starsFor(reputationOf.get(String(d._id)) ?? 4, rnd),
      }));
      const service = Math.max(1, Math.min(5, Math.round(4.2 + (rnd() + rnd() - 1) * 1.2)));
      reviewDocs.push({
        orderId, branchId, tableId: String(table._id), tableNumber: table.number,
        dishRatings,
        // Ambiente und Schnelligkeit werden nicht mehr gefragt: 0 heißt
        // „nicht beurteilt", und genau so lesen es Dashboard und Rezensionstext.
        overall: { service, ambience: 0, speed: 0 },
        createdAt: reviewedAt, demo: true,
      });
    }
  }

  await db.collection<OrderDoc>('orders').insertMany(orderDocs as OrderDoc[]);
  await db.collection<ReviewDoc>('reviews').insertMany(reviewDocs as ReviewDoc[]);
  const touched = await recomputeDishRatings(db);

  const stars = reviewDocs.flatMap(r => r.dishRatings.map(d => d.stars));
  const avg = stars.reduce((a, b) => a + b, 0) / Math.max(1, stars.length);

  // Wie sich die Karte auf die vier Felder des Dashboards verteilt — dieselbe
  // Rechnung wie dort (4,0 ★ und der Median der Anzahl). Steht hier, weil ein
  // Demo-Bestand, in dem alle Gerichte in einem Feld liegen, sein Ziel
  // verfehlt: die Matrix soll etwas zeigen.
  const perDish = new Map<string, { sum: number; count: number }>();
  for (const r of reviewDocs) {
    for (const d of r.dishRatings) {
      const stat = perDish.get(d.dishId) ?? { sum: 0, count: 0 };
      stat.sum += d.stars;
      stat.count += 1;
      perDish.set(d.dishId, stat);
    }
  }
  const counts = [...perDish.values()].map(v => v.count).sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)] ?? 0;
  const fields = { Zugpferde: 0, Geheimtipps: 0, Verbesserungsbedarf: 0, 'Im Auge behalten': 0 };
  for (const v of perDish.values()) {
    const good = v.sum / v.count >= 4;
    const many = v.count > median;
    fields[good ? (many ? 'Zugpferde' : 'Geheimtipps') : (many ? 'Verbesserungsbedarf' : 'Im Auge behalten')] += 1;
  }
  console.log(`\nDemo-Bestand für '${orgSlug}' angelegt — ${weeks} Wochen:`);
  console.log(`  ${orderDocs.length} Bestellungen`);
  console.log(`  ${reviewDocs.length} Bewertungen (${Math.round(reviewDocs.length / orderDocs.length * 100)} % der Bestellungen)`);
  console.log(`  ${stars.length} Gerichtsurteile, Ø ${avg.toFixed(2)} ★`);
  console.log(`  Gerichtsschnitte neu gerechnet (${touched} angepasst)`);
  console.log(`  Vier Felder: ${Object.entries(fields).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log('\nWieder entfernen:  npm run demo-reviews --prefix server -- --reset\n');
  await closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
