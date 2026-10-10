import type { Prospect } from './engine.js';

// Kaoo — Asian Fusion (Ramen, Sushi, Dumplings, Wok), Kaiserstraße 48, 1070 Wien.
// Google: 4,4 ★ bei 1.192 Rezensionen (Stand 10.10.2026) — die niedrigste Note
// der Tour bei der größten Karte.
//
// Was die Rezensionen tragen: riesige Auswahl, eigene vegane und vegetarische
// Karte, Preis-Leistung, das vegane Set für zwei, Mochi, hausgemachte
// Limonaden. Was sie bemängeln: Reis muss extra bestellt werden, im Sommer
// heiß (keine Klimaanlage), Schärfegrade schwer einzuschätzen. Bei 70+
// Gerichten ist eine 4,4 ein Mittelwert über sehr Unterschiedliches — der Hebel
// ist, die zwei, drei Gerichte zu finden, die die Note drücken.
//
// Karte, Preise und Gerichtsfotos: Wolt (kaoo-1070), die eigenen Aufnahmen des
// Lokals; Wolt-Preise können leicht über denen im Lokal liegen. Titelbild:
// Innenraum aus dem Google-Eintrag.

const WOLT = (id: string) => `https://imageproxy.wolt.com/assets/${id}`;
const G = (path: string, w = 1600, h = 1000) => `https://lh3.googleusercontent.com/grass-cs/${path}=w${w}-h${h}-k-no`;

const INTERIOR = 'AABkmLcKJb884PkQZ5gZfmfsa1x-PedmhB7CniQ58tdsFR1YbqwgGC1NClzj5nvp-h0t_-92RUVfc-ArCiGpW-OUQzp8hK4qnxZ_mNip5waI0VRhjwvwKwug1ZFpcYSPRQ4CIN9_u4g';

export const kaoo: Prospect = {
  slug: 'kaoo',
  name: 'Kaoo',
  branchSlug: 'kaiserstrasse',
  branchName: 'Kaiserstraße',
  address: 'Kaiserstraße 48, 1070 Wien',
  accent: '#2F6B4F',
  logo: '🍜',
  cover: G(INTERIOR),
  menu: [
    // ── Starters & Teigtaschen ──
    { sku: 'dumplingmix', name: 'Dumpling Mix', price: 7.2, cat: 'Speisen', photo: WOLT('6992f795c7fede311b1a0f7a'), rep: 4.5, demand: 4 },
    { sku: 'veggiedumpling', name: 'Teigtaschen Veggie (10 Stk.)', price: 12.9, cat: 'Speisen', photo: WOLT('6992f2350edcf1136ce20f4a'), rep: 4.6, demand: 3 },
    { sku: 'gyozatopping', name: 'Gyoza Topping (5 Stk.)', price: 6.5, cat: 'Speisen', photo: WOLT('6992f7270edcf1136ce211b4'), rep: 4.3, demand: 3 },
    { sku: 'koreanchicken', name: 'Crispy Korean Chicken', price: 9.9, cat: 'Speisen', photo: WOLT('6992f6a0c7fede311b1a0f15'), rep: 4.2, demand: 3 },
    { sku: 'kuerbis', name: 'Crispy Kürbis', price: 9.9, cat: 'Speisen', photo: WOLT('6992f432b353386403c1a7ad'), rep: 4.4, demand: 2 },
    { sku: 'wantansuppe', name: 'Wantan Suppe', price: 5.1, cat: 'Speisen', photo: WOLT('6992f5920edcf1136ce210b2'), rep: 3.9, demand: 2 },
    // ── Ramen ──
    { sku: 'tonkatsu', name: 'Ramen Tonkatsu', price: 13.1, cat: 'Speisen', photo: WOLT('699305650edcf1136ce21686'), rep: 4.3, demand: 4 },
    { sku: 'ramenchicken', name: 'Ramen Chicken', price: 13.6, cat: 'Speisen', photo: WOLT('69930548b353386403c1ad66'), rep: 4.1, demand: 3 },
    { sku: 'ramenspicy', name: 'Ramen Spicy (vegan)', price: 13.5, cat: 'Speisen', photo: WOLT('69947c477d64a09374d88ef9'), rep: 4.5, demand: 3 },
    { sku: 'biang', name: 'Biang Noodles Seitan', price: 12.2, cat: 'Speisen', photo: WOLT('69947cd2c7fede311b1aa8b6'), rep: 4.4, demand: 2 },
    // ── Sushi ──
    { sku: 'bigmix', name: 'Big Mix Fisch', price: 22.9, cat: 'Speisen', photo: WOLT('699304ddb353386403c1ad48'), rep: 3.8, demand: 3 },
    { sku: 'california', name: 'California Rolls', price: 12.9, cat: 'Speisen', photo: WOLT('699303e5c7fede311b1a13b0'), rep: 3.9, demand: 3 },
    { sku: 'tiger', name: 'Tiger Rolls', price: 13.9, cat: 'Speisen', photo: WOLT('69930401c7fede311b1a13bd'), rep: 4.0, demand: 2 },
    { sku: 'veganmix', name: 'Vegan Big Mix für 2', price: 36.9, cat: 'Speisen', photo: WOLT('69947bf97d64a09374d88eeb'), rep: 4.7, demand: 2 },
    // ── Specials & Wok ──
    { sku: 'knusprigeente', name: 'Knusprige Ente', price: 15.2, cat: 'Speisen', photo: WOLT('69947d4bb353386403c224d4'), rep: 4.2, demand: 3 },
    { sku: 'bulgogi', name: 'Bulgogi', price: 15.9, cat: 'Speisen', photo: WOLT('69934336c7fede311b1a43b7'), rep: 4.4, demand: 3 },
    { sku: 'crispylachs', name: 'Crispy Lachs', price: 14.9, cat: 'Speisen', photo: WOLT('69934393c7fede311b1a44a9'), rep: 3.7, demand: 2 },
    { sku: 'padthai', name: 'Pad Thai mit Huhn & Garnelen', price: 14.5, cat: 'Speisen', photo: WOLT('6993436dc7fede311b1a43fa'), rep: 4.0, demand: 4 },
    { sku: 'mapo', name: 'Mala Mapo Tofu', price: 11.5, cat: 'Speisen', photo: WOLT('69947ca9c7fede311b1aa8af'), rep: 4.5, demand: 2 },
    { sku: 'curry', name: 'Kokos-Huhn-Curry', price: 12.9, cat: 'Speisen', photo: WOLT('6993457bb353386403c1cc0b'), rep: 4.3, demand: 3 },
    { sku: 'reis', name: 'Jasmin Reis', price: 2.2, cat: 'Speisen', photo: WOLT('6993460bb353386403c1cc14'), rep: 3.5, demand: 4 },
    // ── Dessert ──
    { sku: 'mochi', name: 'Mochi Lotus', price: 5.2, cat: 'Speisen', photo: WOLT('69930612b353386403c1adc3'), rep: 4.6, demand: 2 },
    // ── Getränke ──
    { sku: 'makava', name: 'Makava Eistee 0,33 l', price: 3.9, cat: 'Getränke', photo: WOLT('67bf1ff93cde546b72edf9ed'), rep: 4.3, demand: 2 },
    { sku: 'kirin', name: 'Kirin Ichiban 0,33 l', price: 4.1, cat: 'Getränke', photo: WOLT('67bf20f3c37c12770f813a9e'), rep: 4.3, demand: 2 },
  ],
  vouchers: [
    { title: 'Gratis Mochi Lotus', points: 100, img: WOLT('69930612b353386403c1adc3') },
    { title: 'Gratis Dumpling Mix', points: 150, img: WOLT('6992f795c7fede311b1a0f7a') },
    { title: '10 % auf die ganze Rechnung', points: 250, img: G(INTERIOR, 1000, 500) },
    { title: 'Gratis Ramen nach Wahl', points: 500, img: WOLT('699305650edcf1136ce21686') },
  ],
  reviews: [
    { table: 2, daysAgo: 10, items: [
      { sku: 'veganmix', stars: 5, note: 'Das vegane Set für zwei war himmlisch.' },
      { sku: 'mochi', stars: 5, note: 'Super lecker, perfekter Abschluss.' },
    ] },
    { table: 5, daysAgo: 8, items: [
      { sku: 'bigmix', stars: 3, note: 'Reis fiel auseinander, Fisch okay, aber nichts Besonderes.' },
      { sku: 'dumplingmix', stars: 5, note: 'Alle vier Sorten gut, Shrimps am besten.' },
    ] },
    { table: 1, daysAgo: 7, items: [
      { sku: 'curry', stars: 4, note: 'Gemüse bissfest, schmeckt nicht nach Glutamat.' },
      { sku: 'reis', stars: 2, note: 'Dass Reis extra kostet, wusste ich nicht. Fühlt sich knausrig an.' },
    ] },
    { table: 7, daysAgo: 5, items: [
      { sku: 'ramenspicy', stars: 4, note: 'Achtung, eine Schote ist schon ordentlich scharf.' },
    ] },
    { table: 3, daysAgo: 4, items: [
      { sku: 'crispylachs', stars: 3, note: 'Panade zu dick, Lachs darunter trocken.' },
      { sku: 'bulgogi', stars: 5, note: 'Mit den Salatblättern und Kimchi richtig gut.' },
    ] },
    { table: 4, daysAgo: 3, items: [
      { sku: 'tonkatsu', stars: 4, note: 'Brühe kräftig, das Lava-Ei perfekt.' },
      { sku: 'california', stars: 3, note: 'Zu viel Reis, zu wenig Füllung.' },
    ] },
    { table: 6, daysAgo: 2, items: [
      { sku: 'mapo', stars: 5, note: 'Echt scharf und würzig, wie es sein soll.' },
      { sku: 'padthai', stars: 3, note: 'Eher süß und etwas matschig.' },
    ] },
    { table: 8, daysAgo: 1, items: [
      { sku: 'veggiedumpling', stars: 5, note: 'Hausgemacht, man schmeckt die Morcheln.' },
      { sku: 'makava', stars: 4, note: 'Eiskalt, passt.' },
    ] },
  ],
  notes: {
    bigmix: {
      good: ['Schön angerichtet, frisch.'],
      bad: ['Reis fällt auseinander.', 'Fisch nichts Besonderes für 22,90.', 'Reis zu kalt.'],
    },
    california: { good: ['Solide.'], bad: ['Zu viel Reis.', 'Füllung dünn.'] },
    crispylachs: { good: ['Knusprig, gute Sauce.'], bad: ['Panade zu dick.', 'Lachs trocken.'] },
    padthai: { good: ['Garnelen gut.'], bad: ['Zu süß.', 'Nudeln matschig.'] },
    reis: { good: ['Locker und duftend.'], bad: ['Dass Reis extra kostet, nervt.', 'Kleine Portion für 2,20.'] },
    veganmix: { good: ['Himmlisch.', 'Bunte, kreative Auswahl.'], bad: ['Etwas viel Avocado.'] },
    ramenspicy: { good: ['Schön scharf, Tofu knusprig.'], bad: ['Viel zu scharf, Schärfegrad unklar.'] },
    dumplingmix: { good: ['Alle Sorten gut.'], bad: ['Lauwarm.'] },
    tonkatsu: { good: ['Brühe kräftig, Lava-Ei perfekt.'], bad: ['Brühe zu salzig.'] },
    mochi: { good: ['Super lecker.'], bad: [] },
    curry: { good: ['Kein Glutamat-Geschmack, Gemüse bissfest.'], bad: ['Wenig Huhn.'] },
    wantansuppe: { good: ['Wärmt gut.'], bad: ['Brühe wässrig.', 'Nur zwei Wantan drin.'] },
  },
  ordersPerDay: 38,
  reviewRate: 0.34,
  service: 4.3,
  // Im Sommer heiß, am Wochenende voll — der Service leidet sichtbar.
  weekendDip: 0.5,
  open: [11 * 60 + 30, 22 * 60 + 30],
  randomSeed: 0x4b414f4f,
};
