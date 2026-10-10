import type { Prospect } from './engine.js';

// Kung Fu Bao — Baozi und Guo Tie aus eigener Produktion, Mariahilfer Straße 93,
// 1060 Wien (Fußgängerzone). Google: 4,9 ★ bei 533 Rezensionen (Stand
// 10.10.2026), eröffnet 2025.
//
// Was die Rezensionen tragen: Bao und Gyoza "der Hammer", frisch, aufmerksame
// Beratung durch den Kellner, hausgemachte Limonade, schön angerichtet. Was
// auffällt: ein Gast würde die Knoblauch-Sauce nicht mehr bestellen, Sesam-
// Erdnuss und Ingwer-Soja dagegen "ausgezeichnet"; eine Portion kam einmal
// später (mit Entschuldigungsgeste). Genau solche Einzelheiten gehen in einer
// 4,9 unter — gerichtsgenau stehen sie da, bevor sie in eine 3-Sterne-
// Rezension wandern.
//
// Karte, Preise und Gerichtsfotos: Wolt (kungfu-bao), die eigenen Aufnahmen des
// Lokals. Titelbild: die Ladenfront aus dem Google-Eintrag.

const WOLT = (id: string) => `https://imageproxy.wolt.com/assets/${id}`;
const G = (path: string, w = 1600, h = 1000) => `https://lh3.googleusercontent.com/${path}=w${w}-h${h}-k-no`;

const FRONT = 'gps-cs-s/ANWiy9QDKedGPxPYs62Bg0uwWXG4J6_I04dhjsXGIK-vV0PzxBIQ42ECpZ3usSKRNVUQowcbQ-h1oVzV8CPu1NjSIJvLR1sb7vBsF4lavLla_ioFQgGKN1EoWTUtnYVs4BJeEpwHibNv';
const TABLE = 'grass-cs/AABkmLe7sBQSIEBVJXi9HuV8OYsxasztRcOQWRcCS9gw64wXuIZ-SenP9OuDZ64nJP4N63iM7eTicbygtdVKk9WzfNm-LNr2AXdx_-1diIhwyHJIXE5srblPwuPWcVeTUq5DkH7KwAILhcD7W6I';

export const kungFuBao: Prospect = {
  slug: 'kung-fu-bao',
  name: 'Kung Fu Bao',
  branchSlug: 'mariahilfer-strasse',
  branchName: 'Mariahilfer Straße',
  address: 'Mariahilfer Straße 93, 1060 Wien',
  accent: '#C8102E',
  logo: '🥟',
  cover: G(FRONT),
  menu: [
    // ── Bao Zi ──
    { sku: 'kfbao', name: 'Kung Fu Bao (1 Stk.)', price: 4.8, cat: 'Speisen', photo: WOLT('682f3945f6adf52ef44623eb'), rep: 4.8, demand: 5 },
    { sku: 'zhurou', name: 'Zhu Rou Bao · Schwein (9 Stk.)', price: 12.5, cat: 'Speisen', photo: WOLT('6830831f0399ffae08626d6a'), rep: 4.7, demand: 4 },
    { sku: 'niurou', name: 'Niu Rou Bao · Rind & Käse (9 Stk.)', price: 13.6, cat: 'Speisen', photo: WOLT('683083260399ffae08626d72'), rep: 4.5, demand: 3 },
    { sku: 'jirou', name: 'Ji Rou Bao · Huhn (9 Stk.)', price: 12.5, cat: 'Speisen', photo: WOLT('683083230399ffae08626d6c'), rep: 4.5, demand: 3 },
    { sku: 'sucai', name: 'Su Cai Bao · Gemüse (9 Stk.)', price: 12.5, cat: 'Speisen', photo: WOLT('683083290399ffae08626d74'), rep: 4.3, demand: 3 },
    // ── Guo Tie ──
    { sku: 'gt-zhurou', name: 'Zhu Rou Guo Tie · Schwein', price: 11.4, cat: 'Speisen', photo: WOLT('6830841ec1dac14301be3657'), rep: 4.7, demand: 5 },
    { sku: 'gt-jiucai', name: 'Zhu Rou Jiu Cai Guo Tie · Schwein & Bärlauch', price: 12.5, cat: 'Speisen', photo: WOLT('68308420c1dac14301be3658'), rep: 4.6, demand: 3 },
    { sku: 'gt-niurou', name: 'Niu Rou Guo Tie · Rind', price: 11.4, cat: 'Speisen', photo: WOLT('6830842ac1dac14301be365a'), rep: 4.5, demand: 3 },
    { sku: 'gt-jirou', name: 'Ji Rou Guo Tie · Huhn', price: 11.4, cat: 'Speisen', photo: WOLT('68308424c1dac14301be3659'), rep: 4.4, demand: 3 },
    { sku: 'gt-xia', name: 'Xia Guo Tie · Garnele', price: 13.7, cat: 'Speisen', photo: WOLT('6830842fc1dac14301be365b'), rep: 4.6, demand: 3 },
    { sku: 'gt-su', name: 'Su Guo Tie · Gemüse', price: 11.4, cat: 'Speisen', photo: WOLT('68308431c1dac14301be365c'), rep: 4.2, demand: 2 },
    { sku: 'gt-shiitake', name: 'Xiang Gu Su Guo Tie · Shiitake', price: 11.4, cat: 'Speisen', photo: WOLT('68308434c1dac14301be365e'), rep: 4.4, demand: 2 },
    // ── Vorspeisen & Ramen ──
    { sku: 'huntun', name: 'La You Hun Tun · Wan Tan in Chiliöl', price: 6.8, cat: 'Speisen', photo: WOLT('682f38760399ffae08623e31'), rep: 4.6, demand: 3 },
    { sku: 'xiahe', name: 'Jian Jiu Cai Xia He · Garnelen-Bärlauch-Taschen', price: 7.9, cat: 'Speisen', photo: WOLT('682f386e0399ffae08623e2f'), rep: 4.3, demand: 2 },
    { sku: 'edamame', name: 'Hai Yan Dou Jiao · Edamame', price: 5.6, cat: 'Speisen', photo: WOLT('682f38550399ffae08623e2b'), rep: 4.2, demand: 3 },
    { sku: 'ramen', name: 'Rinder Ramen', price: 19.7, cat: 'Speisen', photo: WOLT('683084780399ffae08626d98'), rep: 3.9, demand: 2 },
    // ── Nachtisch ──
    { sku: 'mango', name: 'Yan Zhi Gan Lu · Mango-Sago', price: 6.8, cat: 'Speisen', photo: WOLT('682f3afe0399ffae08623ecf'), rep: 4.5, demand: 2 },
    { sku: 'apfel', name: 'Ping Guo Jiao · Apfel-Gyoza', price: 5.4, cat: 'Speisen', photo: WOLT('682f34f6c1dac14301bdffba'), rep: 3.7, demand: 2 },
    // ── Getränke ──
    { sku: 'peach', name: 'Peach Lemon Jasmin Tea', price: 7.9, cat: 'Getränke', photo: WOLT('68345c280399ffae0862b195'), rep: 4.6, demand: 3 },
    { sku: 'lychee', name: 'Pink Lychee Jasmin Tea', price: 7.9, cat: 'Getränke', photo: WOLT('68345cb50399ffae0862b1b4'), rep: 4.5, demand: 2 },
    { sku: 'maracuja', name: 'Maracuja Mango Jasmin Tea', price: 7.9, cat: 'Getränke', photo: WOLT('683459cac1dac14301be79ee'), rep: 4.4, demand: 2 },
    { sku: 'tsingtao', name: 'Tsingtao 0,33 l', price: 4.5, cat: 'Getränke', photo: WOLT('67bf2259c37c12770f813aa2'), rep: 4.3, demand: 2 },
  ],
  vouchers: [
    { title: 'Gratis Kung Fu Bao', points: 80, img: WOLT('682f3945f6adf52ef44623eb') },
    { title: 'Gratis Jasmin Tea', points: 150, img: WOLT('68345c280399ffae0862b195') },
    { title: '10 % auf die ganze Rechnung', points: 250, img: G(TABLE, 1000, 500) },
    { title: 'Gratis Guo Tie nach Wahl', points: 350, img: WOLT('6830841ec1dac14301be3657') },
  ],
  reviews: [
    { table: 2, daysAgo: 10, items: [
      { sku: 'kfbao', stars: 5, note: 'Fluffig, Schweinefleisch zergeht. Allein dafür komme ich wieder.' },
      { sku: 'gt-zhurou', stars: 4, note: 'Boden schön knusprig. Die Knoblauch-Sauce dazu würde ich nicht mehr nehmen.' },
    ] },
    { table: 5, daysAgo: 8, items: [
      { sku: 'gt-jiucai', stars: 5, note: 'Mit der Ingwer-Soja-Sauce perfekt.' },
      { sku: 'peach', stars: 5, note: 'Hausgemacht und nicht zu süß.' },
    ] },
    { table: 1, daysAgo: 7, items: [
      { sku: 'ramen', stars: 3, note: 'Brühe gut, aber 19,70 ist viel. Und nur mit Fleisch, keine Veggie-Variante.' },
      { sku: 'huntun', stars: 5, note: 'Chiliöl mit richtig Aroma.' },
    ] },
    { table: 7, daysAgo: 5, items: [
      { sku: 'zhurou', stars: 5, note: 'Neun Stück, alle gleich gut. Super zum Teilen.' },
    ] },
    { table: 3, daysAgo: 4, items: [
      { sku: 'gt-xia', stars: 4, note: 'Garnelen saftig. Kam ein paar Minuten nach den anderen.' },
      { sku: 'apfel', stars: 3, note: 'Schokosauce erschlägt den Apfel.' },
    ] },
    { table: 4, daysAgo: 3, items: [
      { sku: 'sucai', stars: 4, note: 'Für vegetarisch richtig gut, Pilze geben Tiefe.' },
      { sku: 'gt-su', stars: 4, note: 'Mit Sesam-Erdnuss-Sauce ausgezeichnet.' },
    ] },
    { table: 6, daysAgo: 2, items: [
      { sku: 'kfbao', stars: 5, note: 'Der Kellner hat super beraten, was wir bestellen sollen.' },
      { sku: 'mango', stars: 5, note: 'Frisch und leicht, toller Abschluss.' },
    ] },
    { table: 8, daysAgo: 1, items: [
      { sku: 'niurou', stars: 4, note: 'Rind mit Käse klingt komisch, schmeckt aber.' },
      { sku: 'edamame', stars: 4, note: 'Gut gesalzen.' },
    ] },
  ],
  notes: {
    kfbao: { good: ['Fluffig, Füllung saftig.', 'Bestes Bao in Wien.'], bad: ['Teig etwas zäh heute.'] },
    zhurou: { good: ['Super zum Teilen.', 'Füllung würzig, Teig fluffig.'], bad: ['Etwas lauwarm.'] },
    'gt-zhurou': {
      good: ['Knuspriger Boden, saftige Füllung.', 'Mit Ingwer-Soja perfekt.'],
      bad: ['Die Knoblauch-Sauce passt nicht dazu.', 'Boden leicht angebrannt.'],
    },
    'gt-jiucai': { good: ['Bärlauch gibt Frische.'], bad: ['Knoblauch-Sauce zu dominant.'] },
    'gt-xia': { good: ['Garnelen saftig.'], bad: ['Kam später als der Rest.'] },
    ramen: {
      good: ['Brühe kräftig, Fleisch zart.'],
      bad: ['Zu teuer für die Portion.', 'Keine vegetarische Variante.', 'Brühe zu salzig.'],
    },
    apfel: { good: ['Netter Abschluss.'], bad: ['Schokosauce zu viel.', 'Zu süß.', 'Lauwarm.'] },
    sucai: { good: ['Für vegetarisch richtig gut.'], bad: ['Etwas fad.'] },
    huntun: { good: ['Chiliöl mit Aroma.'], bad: ['Sehr scharf.'] },
    peach: { good: ['Hausgemacht, nicht zu süß.'], bad: ['7,90 für einen Tee ist viel.'] },
  },
  ordersPerDay: 30,
  reviewRate: 0.4,
  service: 4.8,
  weekendDip: 0.3,
  open: [11 * 60 + 30, 21 * 60],
  randomSeed: 0x4b464241,
};
