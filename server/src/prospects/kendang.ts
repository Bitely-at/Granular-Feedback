import type { Prospect } from './engine.js';

// Kendang — indonesische Küche, Webgasse 27, 1060 Wien. Pilotbetrieb.
// Google: 4,7 ★ (Stand 10.10.2026). Von Tatler Dining unter 20 indonesischen
// Restaurants weltweit genannt.
//
// Das Konzept trägt die Geschichte dieser Demo: neben den Evergreens (Rendang,
// Sate, Nasi Goreng) wechselt eine regionale Saisonkarte — gerade Sulawesi &
// Maluku. Welche dieser Gerichte auf die nächste Karte dürfen, sagt eine
// Gesamtnote nicht; gerichtsgenaues Feedback schon. Dazu Family Style: alles
// kommt gleichzeitig auf den Tisch, ein Gast bewertet also mehrere Gerichte
// auf einmal — genau der Fall, für den die Bewertung je Gericht gebaut ist.
//
// Karte und Preise: Speisekarte Februar 2026 (kendang.at, PDF), Fotos der
// Gerichte: die Studioaufnahmen des Lokals auf Wolt. Wo es keine gibt
// (Saisongerichte, Getränke), stehen Bilder von kendang.at — echte Aufnahmen
// aus dem Lokal, aber nicht immer genau dieses Gericht; in der Verwaltung
// tauschbar. Die kuratierten Bewertungen sind erfunden: Google gab zum
// Zeitpunkt des Baus keine Rezensionstexte heraus.

const WOLT = (id: string) => `https://imageproxy.wolt.com/assets/${id}`;
const KD = (path: string) => `https://www.kendang.at/wp-content/uploads/${path}`;

const PH = {
  family: KD('2024/10/acf78841-318b-43e7-8949-0b5e76cf6b69-e1728929919571.jpg'),
  familyVegan: KD('2025/01/dc7ae14c-6b13-4d80-907f-782b4d042bb9.jpeg'),
  front: KD('2024/08/a5565748-8484-4612-aa15-7056d06bc342.jpg'),
  sambals: KD('2024/10/e87ff1d3-aae9-46cf-9d3b-843c6a4d117a.jpeg'),
  cocktails: KD('2025/01/ab248e18-94c3-446f-9496-6b02b9351256.jpeg'),
  welcome: KD('2025/03/e802c75b-1fad-4b7e-961d-aa7e2c9593fe.jpeg'),
  soup: KD('2024/10/dfe0fa40-f9a8-4664-900b-3cbc3bca64dd.jpg'),
  robataSate: KD('2024/08/8E4226D9-518C-4243-9B01-1A55E88810C0.jpeg'),
  robataFish: KD('2024/08/BDD0F4F5-7AA8-43E1-AE44-0F0ACD335009.jpeg'),
  klepon: KD('2024/10/e4caf2fc-5eda-48fb-a3a9-0d096b5da106.jpeg'),
  cobek: KD('2024/10/ab684898-415d-4d4b-8461-b9f52b0eb2bd.jpeg'),
};

export const kendang: Prospect = {
  slug: 'kendang',
  name: 'Kendang',
  branchSlug: 'webgasse',
  branchName: 'Webgasse',
  address: 'Webgasse 27, 1060 Wien',
  accent: '#9A6A2F',
  logo: '🥁',
  logoImage: KD('2024/07/logo-png-format-2.png'),
  cover: PH.family,
  menu: [
    // ── Zum Beginn ──
    { sku: 'ritual', name: 'Kendang-Ritual (Gedeck p. P.)', price: 2, cat: 'Speisen', photo: PH.welcome, rep: 4.5, demand: 5 },
    // ── Tasting Experience ──
    { sku: 'tasting', name: '6-Gänge Family Style Sharing Menu (p. P.)', price: 55, cat: 'Speisen', photo: PH.family, rep: 4.8, demand: 2 },
    { sku: 'tastingvegan', name: '6-Gänge Family Style Sharing Menu vegan (p. P.)', price: 43, cat: 'Speisen', photo: PH.familyVegan, rep: 4.6, demand: 1 },
    // ── Evergreens ──
    { sku: 'rendang', name: 'Rendang Sapi', price: 24.5, cat: 'Speisen', photo: WOLT('670ce5c935b6997fcf834c5c'), rep: 4.9, demand: 5 },
    { sku: 'nasigoreng', name: 'Nasi Goreng Spesial · Ayam', price: 16.5, cat: 'Speisen', photo: WOLT('670ce5c435b6997fcf834c55'), rep: 4.5, demand: 4 },
    { sku: 'miegoreng', name: 'Mie Goreng Spesial · Sayur', price: 14.5, cat: 'Speisen', photo: WOLT('686cc9d1e214fc3c734ff5a6'), rep: 4.3, demand: 3 },
    { sku: 'gadogado', name: 'Gado-Gado', price: 14, cat: 'Speisen', photo: WOLT('670ce5c735b6997fcf834c5a'), rep: 4.6, demand: 4 },
    { sku: 'sateayam', name: 'Sate Ayam', price: 15, cat: 'Speisen', photo: WOLT('670ce5c935b6997fcf834c5d'), rep: 4.7, demand: 5 },
    { sku: 'satetahu', name: 'Sate Tahu & Tempe', price: 13, cat: 'Speisen', photo: WOLT('670ce5c935b6997fcf834c5f'), rep: 4.4, demand: 3 },
    // ── Sulawesi & Maluku (Saison) ──
    { sku: 'gohu', name: 'Gohu Ikan Tuna', price: 17, cat: 'Speisen', photo: PH.cobek, rep: 4.0, demand: 2 },
    { sku: 'kohu', name: 'Kohu-Kohu', price: 11, cat: 'Speisen', photo: WOLT('698c8593aa0a0db65f319cab'), rep: 4.1, demand: 2 },
    { sku: 'bebek', name: 'Bebek Paniki', price: 23.5, cat: 'Speisen', photo: WOLT('698c8570aa0a0db65f319c8a'), rep: 4.6, demand: 3 },
    { sku: 'coto', name: 'Coto Makassar', price: 17.9, cat: 'Speisen', photo: PH.soup, rep: 4.2, demand: 2 },
    { sku: 'konro', name: 'Konro Bakar', price: 29.5, cat: 'Speisen', photo: PH.robataSate, rep: 4.5, demand: 2 },
    { sku: 'ikanbakar', name: 'Ikan Bakar Bumbu Raja', price: 30, cat: 'Speisen', photo: PH.robataFish, rep: 4.3, demand: 2 },
    { sku: 'woku', name: 'Tahu & Sayur Woku', price: 13.9, cat: 'Speisen', photo: WOLT('698c856caa0a0db65f319c83'), rep: 4.3, demand: 2 },
    { sku: 'putungo', name: 'Sayur Putungo', price: 14.9, cat: 'Speisen', photo: WOLT('698c857faa0a0db65f319c9e'), rep: 3.6, demand: 2 },
    // ── Beilagen & Sambal ──
    { sku: 'nasi', name: 'Nasi Putih', price: 2.7, cat: 'Speisen', photo: WOLT('670ce5e8eed8e7744d3637f9'), rep: 4.2, demand: 4 },
    { sku: 'lontong', name: 'Lontong', price: 4.4, cat: 'Speisen', photo: WOLT('670ce5cc35b6997fcf834c60'), rep: 3.9, demand: 2 },
    { sku: 'tempe', name: 'Tempe Goreng', price: 6, cat: 'Speisen', photo: WOLT('670ce5c435b6997fcf834c52'), rep: 4.4, demand: 2 },
    { sku: 'tahu', name: 'Tahu Goreng', price: 6, cat: 'Speisen', photo: WOLT('670ce5c735b6997fcf834c57'), rep: 4.1, demand: 2 },
    { sku: 'bajak', name: 'Sambal Bajak', price: 4.5, cat: 'Speisen', photo: PH.sambals, rep: 4.7, demand: 3 },
    // ── Dessert ──
    { sku: 'buburne', name: 'Bubur Ne', price: 8, cat: 'Speisen', photo: PH.klepon, rep: 4.2, demand: 2 },
    // ── Getränke ──
    { sku: 'wakatobi', name: 'Sunset Over Wakatobi', price: 9.9, cat: 'Getränke', photo: PH.cocktails, rep: 4.6, demand: 2 },
    { sku: 'radler', name: 'Spice Island Radler 0,5 l', price: 5.9, cat: 'Getränke', photo: PH.cocktails, rep: 4.3, demand: 2 },
    { sku: 'jamu', name: 'Es Jamu Temulawak', price: 4.9, cat: 'Getränke', photo: PH.welcome, rep: 3.8, demand: 1 },
    { sku: 'veltliner', name: 'Grüner Veltliner Ried Hammert (Fl.)', price: 31, cat: 'Getränke', photo: WOLT('6707a5d3a7eb5c5d5a814764'), rep: 4.5, demand: 1 },
  ],
  vouchers: [
    { title: 'Gratis Sambal Bajak', points: 80, img: PH.sambals },
    { title: 'Gratis Bubur Ne', points: 180, img: PH.klepon },
    { title: 'Gratis Sunset Over Wakatobi', points: 250, img: PH.cocktails },
    { title: 'Gratis Rendang Sapi', points: 600, img: WOLT('670ce5c935b6997fcf834c5c') },
  ],
  // Samstag 10.10.2026 als Bezug: 5 und 6 Tage zurück wären So/Mo (Ruhetag).
  reviews: [
    { table: 2, daysAgo: 10, items: [
      { sku: 'rendang', stars: 5, note: 'Zart, karamellisiert, unglaublich tief im Geschmack. Zu Recht der Klassiker.' },
      { sku: 'putungo', stars: 3, note: 'Bananenblüte war spannend, aber sehr erdig. Eher nichts für mich.' },
    ] },
    { table: 5, daysAgo: 9, items: [
      { sku: 'tasting', stars: 5, note: 'Alles gleichzeitig auf dem Tisch, wie in Indonesien. Wunderbar erklärt.' },
    ] },
    { table: 1, daysAgo: 8, items: [
      { sku: 'bebek', stars: 5, note: 'Ente innen weich, außen knusprig, die Paniki-Sauce ist ein Traum.' },
      { sku: 'gohu', stars: 3, note: 'Thunfisch frisch, aber für mich zu sauer und zu scharf.' },
      { sku: 'bajak', stars: 5, note: 'Das beste Sambal, das ich in Wien gegessen habe.' },
    ] },
    { table: 7, daysAgo: 7, items: [
      { sku: 'sateayam', stars: 5, note: 'Rauchig vom Grill, Erdnusssauce hausgemacht.' },
      { sku: 'gadogado', stars: 5, note: 'Riesige Portion, Erdnusssauce cremig.' },
    ] },
    { table: 3, daysAgo: 4, items: [
      { sku: 'konro', stars: 5, note: 'Rippchen fallen vom Knochen. Teuer, aber jeden Euro wert.' },
      { sku: 'buburne', stars: 3, note: 'Gut, aber 15 Minuten Wartezeit wussten wir nicht.' },
    ] },
    { table: 4, daysAgo: 3, items: [
      { sku: 'coto', stars: 4, note: 'Kräftige Suppe, Erdnuss schmeckt man deutlich.' },
      { sku: 'kohu', stars: 4, note: 'Frisch und knackig, schöne Vorspeise zum Teilen.' },
      { sku: 'lontong', stars: 3, note: 'Etwas fad ohne Sauce.' },
    ] },
    { table: 6, daysAgo: 2, items: [
      { sku: 'nasigoreng', stars: 5, note: 'Spiegelei perfekt, Zwiebelchips machen es.' },
      { sku: 'wakatobi', stars: 5, note: 'Muskat und Passionsfrucht, toller Drink.' },
    ] },
    { table: 8, daysAgo: 1, items: [
      { sku: 'ikanbakar', stars: 4, note: 'Fisch saftig und würzig, ein paar Gräten mehr als erwartet.' },
      { sku: 'woku', stars: 4, note: 'Zitronengras gibt Frische, schön leicht.' },
      { sku: 'ritual', stars: 5, note: 'Der Willkommensdrink mit Cassava Chips ist eine schöne Idee.' },
    ] },
  ],
  notes: {
    rendang: { good: ['Zart und karamellisiert.', 'Bestes Rendang außerhalb Indonesiens.', 'Gewürze mit richtig Tiefe.'], bad: ['Etwas trocken heute.'] },
    sateayam: { good: ['Rauchig, Erdnusssauce hausgemacht.', 'Saftig vom Robata-Grill.'], bad: ['Kleine Portion für 15 Euro.'] },
    bebek: { good: ['Außen knusprig, innen weich.', 'Paniki-Sauce ein Traum.'], bad: ['Etwas fettig.'] },
    gohu: { good: ['Frisch und belebend, wie ein indonesisches Ceviche.'], bad: ['Zu sauer.', 'Sehr scharf, das stand nicht dabei.', 'Roher Fisch passt nicht zum Rest.'] },
    putungo: { good: ['Mal etwas ganz Neues.'], bad: ['Sehr erdig.', 'Textur gewöhnungsbedürftig.', 'Nicht nochmal.'] },
    coto: { good: ['Kräftige Brühe, viel Erdnuss.'], bad: ['Sehr schwer.', 'Zu wenig Rindfleisch.'] },
    konro: { good: ['Fällt vom Knochen.', 'Rauchig, unvergesslich.'], bad: ['29,50 ist viel.'] },
    ikanbakar: { good: ['Würzig, saftig.'], bad: ['Viele Gräten.', 'Dauerte lange.'] },
    buburne: { good: ['Warm mit Eis, herrlich.'], bad: ['15 Minuten Wartezeit nicht angekündigt.', 'Zu süß.'] },
    gadogado: { good: ['Riesige Portion, Sauce cremig.'], bad: ['Gemüse zu weich.'] },
    nasigoreng: { good: ['Ein Teller voller Glück.', 'Zwiebelchips machen es.'], bad: ['Etwas zu süß.'] },
    miegoreng: { good: ['Gut gewürzt.'], bad: ['Nudeln etwas fettig.'] },
    bajak: { good: ['Bestes Sambal in Wien.'], bad: ['Für Garnelen-Allergiker leider nichts.'] },
    lontong: { good: ['Passt gut zur Sate.'], bad: ['Fad ohne Sauce.'] },
    jamu: { good: ['Interessant, sehr gesund.'], bad: ['Sehr erdig, nicht meins.'] },
  },
  ordersPerDay: 18,
  reviewRate: 0.42,
  service: 4.8,
  weekendDip: 0.2,
  open: [17 * 60, 21 * 60 + 30],
  closedDays: [0, 1],
  randomSeed: 0x4b454e44,
};
