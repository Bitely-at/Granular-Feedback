import type { Prospect } from './engine.js';

// SETTE Artisan Craft Pizza • Cocktail Bar — römische Pizza, Schottenfeldgasse 7,
// 1070 Wien. Google: 4,9 ★ bei 1.967 Rezensionen (Stand 10.10.2026); 50 Top
// Pizza Europe 2026, Falstaff.
//
// Was die Rezensionen tragen: die frittierten Klassiker (Tris), die leichte,
// zweimal gebackene Blechpizza, der Yuzu-Cocktail, ein Personal, das die Karte
// erklärt. SETTE antwortet auf JEDE Rezension — der Ruf ist hier Chefsache.
// Der Hebel ist darum nicht "bessere Note", sondern: welche Kreation der
// limitierten Herbst-/Winterkollektion trägt, welche polarisiert — gerichtsgenau,
// bevor die Saison vorbei ist, und mehr Rezensionen aus zufriedenen Tischen.
//
// Karte und Preise: Speisekarte Herbst/Winter 2026/27 und Cocktailkarte
// (settewien.at). Fotos: Bilder aus dem Google-Eintrag des Lokals.

const G = (path: string, w = 800, h = 800) => `https://lh3.googleusercontent.com/grass-cs/${path}=w${w}-h${h}-k-no`;

const P = {
  experience: 'AABkmLc0ccavd7foBLqsWPQ6MBXXKyu_QmgCM5G0Rb2P5-8IHvDzWigZsI0Z4IRFfgBWHz1rNhsKQBmf8DEnYdfqh5HnFpg-t1kiGLY0FZWcloZurJgCXE0BdhX3zgbFNQkyLbYiL5JqNzkJDcho',
  margherita: 'AABkmLcCj-92B4fzWIJt5A0qPZezch0DBh1-i2uM4whi7uNT3eLUbCOpjCIoytK5o5HGxOT3AXi4_BbkVfvd8oSZyqSCWOfVRFuNY7AYsodeh7V8_3Cm26UV7Oxjvob_Zefgy_0rxHY_9HWiEz0',
  yuzu: 'AABkmLcgeXsYDfoIcL91W8uo7F4PE7Ywu1je-6WztvtfOao3nXZv0JD2TSMpgsEIX3B-_M5NR8bZO3npXzgx92KPXklcHJGY2nJ0iZNDnolXNElM8FclQ_zSC9rNV0cQxr6L_r1v9BfI8RyLTZpp',
  tiramisu: 'AABkmLchOqwvLEq2L6bFHHHSa3Yys27jOdmTKccN8y1PE92BUTswdi4AHKfXU6V-yXqkp7UbxZtdL_wSRxAp898kxdB7DsmacvPx_hNzK0FKf1A-KP2dsTwohGwS2ylFmXx3Bp7DMHekZC73BgPa',
  spaghettone: 'AABkmLd23VeGuetuEuJ2tZM7xxkCVbaIrC2neyBWCHP_FwphHjmT-wx7M49F_MqQxJSb5hI5R6enfgZbGDJ89R6kfWNuoZCEwKbVPw0jk5uvsQjJS8rmE5sRnT0RW83cDIl-OXXRjtWjjPHaovx7',
  capricciosa: 'AABkmLd3eDPSx9tXaxDJ6tfJgshz7ZMzoHLzBmTNINkYyWJVCKXG2wl8k29Iari1DCDuzmaeam4L5MEEqWllu1AY7DG5es3C6jbsgPSboiaiPpXCbjKXnBe1qQm05dy0pB_mk1R4luSw0tYiG57O',
  tris: 'AABkmLdZpPHaGwQW-fyo-5rbuScs5HK4oNmDaAEL6038S74Yt6DGVdR0hdpqp-6p_sGO9lPWxOX0Xq68Lqa3oKTOeJNN0qpvSMBpd-zbfSY-C5SLsGFtfjuDpSAfAjIOwE5nCelDEOiEwI7wmXBB',
  suppli: 'AABkmLdp-H4nhWKjV4L5CE9Mq5PBSjqEXneLL3omf-WNLwrDq6dNKcS5QwOoimrfD6mWYFYqdsGfVLjOUwZ7G62L4HdFyqTqkCHOv6NZsB0oqUsdoAG_PBM_LNIWhuQ4epG7o0l4itRl2IchYc3Y',
  fotonica: 'AABkmLdt6uqAgtb-oDOZWLFhTQbUi707UkLSqPHM8AM5PYZqxzLD4vez6ffGQzYKKm5kUnN1c7DclXKN2W7XQ7XAQBNJM3ZO5_pgJstK9jPJljlqjvNFvenNowZK5GbebG1JfMI8IZu2Xy8gh4RS',
  diavolissima: 'AABkmLe0W_Tgtcst3ABhE5iQ8Yi_EfR_WA46fslDA3HBlhu0NnFqZcBmlEcj36ACz9ncJJvxdCb8E92NgNcNpWDugk1UcETfIgz_dvuEXSw3OvoNw5TseelovBjcOdmOd0WwGLOFNrNx',
  nonna: 'AABkmLe4VuzEkT7bWW1EqbrINvLZGNDJU-POLB2mNo2r13XdyM24t7XU5TVetkJT5r99zDlI6mM9JBOscjWxVCgNNLxLMDoLNMIzmuJIetuypS4qH0rrGwfgg4sAviMOe3FBCsONFR0Nod4Oz2Ft',
  chicco: 'AABkmLeVrhMu5pVnq-LfYdomziTb9EWAbgSzeeHOWBADhrrBm8Nwn-yaXep5I2z7AYyWHsje1hZTYoIsAiclDyZgrrtKU7hB76YJyRy4EYXASwd-498TmZmB6R5D4hDBdHxWI7FKekUhpabXPSs',
  ortolana: 'AABkmLfCjkYweAsXuqcedE9fsaZnhVds47dvon7b2nEQRNHO-cdvdlQRxT395hHirI06L-cq6zO-SrTYdjq_ECJfJl-ppBK8QMfy1WFh8sL4WBw-quHW1U53NhqWOeNq2SMJX28k_lW-uQUzd79z',
  carbonara: 'AABkmLfGMEr3CYI8eoePn1oDMgTa0QKdNOwAIsOxSBKdtym8hF7Xy_f-KxDNzk3BOh_OsawgYDsrOa4RDJs4LyZKSl7eINBz-ydW-DjzNTLSVGWMe3Cxc21WNT4IYjFigZY0JY7aaqV748UI6W8',
  sacher: 'AABkmLfKY2JNWA8a8gxek6IhyfnKb3-SZJPdoI5_KG6LE1jUacZ1bCPbfzVjc1RaSu_KxWGh9TuM9ZgWRB9w7qMFjegkMFBx6hP4XXBz_HjQ0YOcASNoLKQpzkmJ19ibD7Zpk1kVPFZzIF7oUsEt',
  interior: 'AABkmLfjGJgs0jaXMjZnt4Cm7iU8eRQXFwEp-veRo3VWYl3ADgHzY8-V6sKapMvjg_n9YUjve2oYppOUAgJDhlVj_E59fxb4R46ApXLht4xByWyYZQZajqbEGWYMtdQ0Ab-i_BGe3Uh8WcFfDjf7',
  blackcrock: 'AABkmLfnu6V9jNx4K3pDPy3XcvHoQHmdC_oQ3iwczdZSzBCpLAqyFwI81TvTU4TkUvZtjeorNUdYvVDgp7aGyg9kwDhOWFNp0T5Ptlptt10ghqLEOalZHED83T6Ql96KLOp0P2K2HSoM8bxUmNN4',
  hanami: 'AABkmLd8QqM-uQoXi5lwZKCP7OXuo1wp8zdfdfdstR3Z6JeDQnw82I6xG6Q2HJI3F8DEv6DXfM9MTzSnxjb6ciOdUB3yQHehOzRCtfF1JZQHg2fXBk-agbPBVPe_TXXnJ3F8AhztuOx1tWiM8To',
};

export const sette: Prospect = {
  slug: 'sette',
  name: 'SETTE',
  branchSlug: 'schottenfeldgasse',
  branchName: 'Schottenfeldgasse',
  address: 'Schottenfeldgasse 7, 1070 Wien',
  accent: '#1D4D3A',
  logo: '🍕',
  logoImage: 'https://settewien.at/wp-content/uploads/2022/12/sette_logo-compresso.png',
  cover: G(P.interior, 1600, 1000),
  menu: [
    // ── Fritti ──
    { sku: 'tris', name: 'Tris di Fritti', price: 21, cat: 'Speisen', photo: G(P.tris), rep: 4.8, demand: 5 },
    { sku: 'suppli', name: 'Supplì Classico', price: 6.5, cat: 'Speisen', photo: G(P.suppli), rep: 4.7, demand: 3 },
    { sku: 'spaghettone', name: 'Spaghettone Cacio & Pepe', price: 7.5, cat: 'Speisen', photo: G(P.spaghettone), rep: 4.6, demand: 3 },
    // ── Blechpizza Sette Style ──
    { sku: 'blackcrock', name: "Black'n Crock", price: 26, cat: 'Speisen', photo: G(P.blackcrock), rep: 4.8, demand: 4 },
    { sku: 'diavolissima', name: 'Diavolissima', price: 18, cat: 'Speisen', photo: G(P.diavolissima), rep: 4.7, demand: 4 },
    { sku: 'fotonica', name: 'Marinara Fotonica', price: 16, cat: 'Speisen', photo: G(P.fotonica), rep: 4.4, demand: 2 },
    // ── Runde Pizza ──
    { sku: 'margherita', name: 'Margherita', price: 13.5, cat: 'Speisen', photo: G(P.margherita), rep: 4.6, demand: 4 },
    { sku: 'ortolana', name: 'Ortolana', price: 15.5, cat: 'Speisen', photo: G(P.ortolana), rep: 4.3, demand: 2 },
    // ── Autumn–Winter Collection 2026 ──
    { sku: 'capricciosa', name: 'Super Capricciosa', price: 26, cat: 'Speisen', photo: G(P.capricciosa), rep: 4.7, demand: 3 },
    { sku: 'nonna', name: 'Daje Nonna', price: 21, cat: 'Speisen', photo: G(P.nonna), rep: 4.6, demand: 3 },
    { sku: 'chicco', name: 'Chicco & Porro', price: 20, cat: 'Speisen', photo: G(P.chicco), rep: 3.6, demand: 2 },
    // ── Pasta ──
    { sku: 'carbonara', name: 'Carbonara', price: 18.5, cat: 'Speisen', photo: G(P.carbonara), rep: 4.5, demand: 3 },
    // ── Verkostung ──
    { sku: 'experience', name: 'SETTE Experience (5 Gänge, p. P.)', price: 55, cat: 'Speisen', photo: G(P.experience), rep: 4.8, demand: 2 },
    // ── Dessert ──
    { sku: 'tiramisu', name: 'Tiramisù al Bicchiere', price: 9, cat: 'Speisen', photo: G(P.tiramisu), rep: 4.6, demand: 3 },
    { sku: 'sacher', name: 'Sacher Padellino', price: 9.5, cat: 'Speisen', photo: G(P.sacher), rep: 4.0, demand: 2 },
    // ── Cocktails ──
    { sku: 'yuzu', name: 'Yuzu Mitsu', price: 19, cat: 'Getränke', photo: G(P.yuzu), rep: 4.8, demand: 3 },
    { sku: 'hanami', name: 'Hanami', price: 17, cat: 'Getränke', photo: G(P.hanami), rep: 4.4, demand: 2 },
  ],
  vouchers: [
    { title: 'Gratis Supplì Classico', points: 100, img: G(P.suppli, 1000, 500) },
    { title: 'Gratis Tiramisù', points: 200, img: G(P.tiramisu, 1000, 500) },
    { title: 'Gratis Yuzu Mitsu', points: 400, img: G(P.yuzu, 1000, 500) },
    { title: 'Tris di Fritti aufs Haus', points: 500, img: G(P.tris, 1000, 500) },
  ],
  reviews: [
    { table: 2, daysAgo: 10, items: [
      { sku: 'tris', stars: 5, note: 'Unbedingt alle drei probieren. Leicht, obwohl frittiert.' },
      { sku: 'yuzu', stars: 5, note: 'Der Schaum ist ein Erlebnis.' },
    ] },
    { table: 5, daysAgo: 8, items: [
      { sku: 'blackcrock', stars: 5, note: 'Ganz anders als jede Pizza, die ich kenne. Super knusprig.' },
      { sku: 'chicco', stars: 3, note: 'Kaffee-Crumble auf Pizza ist nichts für mich, zu bitter.' },
    ] },
    { table: 1, daysAgo: 7, items: [
      { sku: 'experience', stars: 5, note: 'Fünf Gänge, keiner davon auf der Karte. Großartig erklärt.' },
    ] },
    { table: 7, daysAgo: 5, items: [
      { sku: 'diavolissima', stars: 5, note: 'Die Nduja-Emulsion macht es.' },
      { sku: 'sacher', stars: 3, note: 'Idee nett, aber zu trocken und zu süß.' },
    ] },
    { table: 3, daysAgo: 4, items: [
      { sku: 'capricciosa', stars: 5, note: 'Beste Pizza der neuen Kollektion.' },
      { sku: 'chicco', stars: 4, note: 'Spannend, der Lauch passt. Kaffee eher weglassen.' },
    ] },
    { table: 4, daysAgo: 3, items: [
      { sku: 'margherita', stars: 5, note: 'Dünn, knusprig, perfekt.' },
      { sku: 'carbonara', stars: 4, note: 'Guanciale top, Sauce minimal zu dick.' },
    ] },
    { table: 6, daysAgo: 2, items: [
      { sku: 'nonna', stars: 5, note: 'Schmeckt wirklich nach Sonntag bei der Nonna.' },
      { sku: 'tiramisu', stars: 5, note: 'Klassisch und genau richtig.' },
    ] },
    { table: 8, daysAgo: 1, items: [
      { sku: 'suppli', stars: 5, note: 'Mozzarella zieht Fäden, wie in Rom.' },
      { sku: 'fotonica', stars: 4, note: 'Für vegan überraschend vollmundig.' },
    ] },
  ],
  notes: {
    tris: { good: ['Unbedingt alle drei probieren.', 'Außen knusprig, innen cremig.'], bad: ['Etwas zu salzig heute.'] },
    blackcrock: { good: ['Trüffel und Black Angus, ein Traum.', 'Superleichter Teig.'], bad: ['Für 26 Euro etwas wenig Fleisch.'] },
    chicco: {
      good: ['Mutig und spannend.'],
      bad: ['Kaffee-Crumble zu bitter.', 'Lauch dominiert alles.', 'Interessant, aber nicht nochmal.'],
    },
    sacher: { good: ['Schöne Idee.'], bad: ['Zu trocken.', 'Sehr süß.', 'Lauwarm serviert.'] },
    capricciosa: { good: ['Beste Pizza der Kollektion.'], bad: ['Etwas viel Ei-Emulsion.'] },
    nonna: { good: ['Wie bei der Nonna.'], bad: ['Pecorino-Fondue sehr schwer.'] },
    yuzu: { good: ['Der Schaum ist ein Erlebnis.', 'Frisch und ausgewogen.'], bad: ['Für 19 Euro recht klein.'] },
    experience: { good: ['Großartig erklärt, alles neu.', 'Jeder Gang eine Überraschung.'], bad: ['Zwischen den Gängen lange Pausen.'] },
    carbonara: { good: ['Guanciale knusprig.'], bad: ['Sauce zu dick.'] },
    ortolana: { good: ['Gemüse frisch.'], bad: ['Etwas fad.'] },
  },
  ordersPerDay: 34,
  reviewRate: 0.36,
  service: 4.8,
  weekendDip: 0.3,
  open: [12 * 60, 23 * 60],
  randomSeed: 0x53455454,
};
