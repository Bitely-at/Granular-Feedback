import 'dotenv/config';
import { orgDbBySlug, closeDb } from './db.js';
import type { DishDoc, ReviewDoc, OrderDoc } from './types.js';

/**
 * Die Zahlen des Dashboards als JSON auf die Konsole — für den statischen
 * Nachbau auf der Website.
 *
 *   npm run dashboard-snapshot --prefix server -- [tage] [orgSlug]
 *
 * Nur lesend. Zweck: der Nachbau soll dieselben Werte zeigen wie die echte
 * Auswertung, statt erfundener Zahlen, die niemand nachrechnen kann.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const args = process.argv.slice(2);
  const days = Number(args.find(a => /^[0-9]+$/.test(a)) ?? 30);
  const orgSlug = args.find(a => !/^[0-9]+$/.test(a)) ?? process.env.ORG_SLUG ?? 'sakura-sushi';
  const db = await orgDbBySlug(orgSlug);

  const from = Date.now() - days * DAY_MS;
  const reviews = await db.collection<ReviewDoc>('reviews').find({ createdAt: { $gte: from } }).toArray();
  const orders = await db.collection<OrderDoc>('orders').countDocuments({ createdAt: { $gte: from } });
  const dishes = await db.collection<DishDoc>('dishes').find({}).toArray();
  const nameOf = (id: string) => dishes.find(d => String(d._id) === id)?.name ?? '?';

  const byDish = new Map<string, { name: string; sum: number; count: number }>();
  const byDay = new Map<string, { sum: number; ratings: number; reviews: number }>();
  let sum = 0;
  let ratings = 0;
  for (const rv of reviews) {
    const key = new Date(rv.createdAt).toISOString().slice(0, 10);
    const day = byDay.get(key) ?? { sum: 0, ratings: 0, reviews: 0 };
    day.reviews += 1;
    for (const r of rv.dishRatings) {
      if (r.stars <= 0) continue;
      sum += r.stars;
      ratings += 1;
      day.sum += r.stars;
      day.ratings += 1;
      const stat = byDish.get(r.dishId) ?? { name: nameOf(r.dishId), sum: 0, count: 0 };
      stat.sum += r.stars;
      stat.count += 1;
      byDish.set(r.dishId, stat);
    }
    byDay.set(key, day);
  }

  const dishRows = [...byDish.values()]
    .map(d => ({ name: d.name, avg: Number((d.sum / d.count).toFixed(2)), count: d.count }))
    .sort((a, b) => b.avg - a.avg);
  const counts = dishRows.map(d => d.count).sort((a, b) => a - b);

  const trend: { date: string; reviews: number; avg: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
    const d = byDay.get(key);
    trend.push({ date: key, reviews: d?.reviews ?? 0, avg: d && d.ratings > 0 ? Number((d.sum / d.ratings).toFixed(2)) : 0 });
  }

  console.log(JSON.stringify({
    totals: {
      reviews: reviews.length, ratings, orders,
      avg: Number((sum / Math.max(1, ratings)).toFixed(2)),
      rate: Math.round(reviews.length / Math.max(1, orders) * 100),
    },
    medianCount: counts[Math.floor(counts.length / 2)] ?? 0,
    dishes: dishRows,
    trend,
  }, null, 1));
  await closeDb();
}

main().catch(err => { console.error(err); process.exit(1); });
