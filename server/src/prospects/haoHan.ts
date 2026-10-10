import type { Prospect } from './engine.js';

// Hao Han — chinesisch/vietnamesisch, Gumpendorfer Straße 41, 1060 Wien.
// Google: 4,7 ★ bei 875 Rezensionen (Stand 10.10.2026).
//
// Was die Rezensionen tragen: hausgemachte Nudeln und Frühlingsrollen, große
// Portionen, schnelle und freundliche Bedienung, der Koch (Royce) fragt selbst
// am Tisch nach. Was sie bemängeln: das Ambiente ("kalt", "karg") — nichts an
// der Küche. Genau dort setzt gerichtsgenaues Feedback an: bei 60+ Gerichten
// sagt eine 4,7 nicht, welches davon die Note trägt und welches sie kostet.
//
// Karte und Preise: lieferando.at/speisekarte/haohan. Die Lieferando-Bilder sind
// KI-generiert (Wasserzeichen) und darum NICHT verwendet; alle Fotos hier sind
// echte Gäste-/Inhaberfotos aus dem Google-Eintrag.

const G = (path: string, w = 800, h = 800) => `https://lh3.googleusercontent.com/${path}=w${w}-h${h}-k-no`;
const WOLT = (id: string) => `https://imageproxy.wolt.com/assets/${id}`;

const P = {
  rindsuppe: 'gps-cs-s/ANWiy9Q1iuZNasIoXASeu4tf0yfVCYYbCzpioGttev9U9dmJNt-ZUEq6PWIPcGrptO-jVfrINugxtC2dEDa0f_gsMkkojxB9ANT9PVLfcn2NFDyUxybGrN8GDp31WPZcFusrJkSAxUiV_9d0a98w',
  pho: 'gps-cs-s/ANWiy9TQnoHSZ-EqR2TzhPZmDpDjuP8cMUbg9lfPqIUYCFXtB0jXtF9oaSH8FKHvc4kKAsF_sB6xEghA0gPQnqw3pY-PknQo260KQRT4RtRYQJahuhYHG80jT26XeRmqy99B24x_QRWYAA',
  interior: 'gps-cs-s/ANWiy9TK-A75raBi6NkCOMMgfUOOnu-rOrJUSIh4SXNtEuWHIPKwUiEzUzncHZXnSl-8D9wQjO1Lc_XI05kNx_DY3e-3JBK6d_AWU_xNj1DgV_gdYlY6l2jg1CLe021nEICZrX9D-4_Q',
  rindkalt: 'grass-cs/AABkmLc-Ju2Lon90LiRFHXBnAGEY64gaZ0LGNk2skHw61qAhXVNiauhPyRz4Q6QkcMkL0Jxe6TO6fQTChVb7BZF_eltLvHuRmwr1_Ro8fIGxdYlW58E_QOOI-FrpNRaiGEFTl2GoXDBBVoAMxD_c',
  germ: 'grass-cs/AABkmLc8Q-c9XekBboG97J_O3PbClpL5BNoy55SfVo0_BPUcn22F8D4Vgakl0rcQ2EIR1Y4M-3Zr_Sm5Iu62B1M3NB8on3Uyfxo5MKRi9APzsP7wui0SyN80RS5WUF4zipN78OFCq7f_bZEtd1F7',
  calamari: 'grass-cs/AABkmLcR_hsnMTDwZaU9eSGe40vWMmRXX_laFCr9odFqehrpGom5peve-rzFAlgxddT22YGkvKC8CMU3tb8Z8drgNb-9hTD3txB6lcNErg-6aaJwJq1aDTpRob7JbO4948er2DBCS3VpslYlxBTH',
  pfefferoni: 'grass-cs/AABkmLcjPbcddNkxY-eGRCAOXx3iLV_q1-kUP1IgdU6C8g4m9mNRoXeIihj6aeXIxfLaP3SZUA_gSIggh3Ab4qlUSYVU1s0EdhyupTndhhBkyl8k7mNAwKYGT7pf70dXN_prPxgEUU_mmM_rIEaJ',
  gonbao: 'grass-cs/AABkmLcwwvgkmW2will0CP6eBFaPxuZr9GwSulhR-pz3qirQY00FVCXPxNNhf5Rt692mF2HWwU57tH11kqVomb76k_YtXH_mQbGvwj4T_aKsFJkURnUa2MZuit436c6JWuH7fED4_8-X57gDUkDf',
  vietroll: 'grass-cs/AABkmLd22-dUU_M5TVEVJPKIYLYXsBivPSbHKf5SRqSAnFJmg93Nj2rM-Kq30ENTZ4KgHAlfUP-AIINRcwttgYshKmV9PZd7CZJXvbci4DWlWEh9Q4e256Rac0hZlp091gP1zu0pEbiW2h8XQOs',
  rainbow: 'grass-cs/AABkmLd_Siey0yyEqDmEnFvA7bKENNzIsaNk348Ju0fAb8ZI-KIC4BlQdw8jylZdpWo4zDyYy2F-J_wOjA8ijhG8FQwJDK6oOqdweyYdn-61BHhCkqr_UovS9Kd861iKsKH2MY9bHInOYhkAoYnf',
  seafood: 'grass-cs/AABkmLdgrE4pk93DkzvEluyDkL1UliTvp_rsrWxvv2o7XwKvBkW_9-rZc2hUYPsZcZvzUvaiozx7wbaYuUz0RFtTTtB7MFGiK6_Fr6uG2ouLeqVknFzUfil444neHNnJXDT1jG3UlAyQcodFLmJP',
  ente: 'grass-cs/AABkmLdiPZHrQ2vRBI2iOyhlZ1aT8EhG9dScr9yWGDEWm89wxs4XOviWkB2vz15-r6gkIoCSFNzcxhM5cpI89tEvD73docgX4_GefhEyEuydkcMDSH9EchEnWamwbsKuEymd9furdkHokLlbQQBy',
  huiguorou: 'grass-cs/AABkmLeO1_oJmjR7yHHHXfSTM1Ta72UR5y1fJlIb0_XqnjnAbJG_F9Xw85LWb4fmlDHnZZkSf0nfBsfgRnLsa7XxVB8iBzeQUbGqGlkG74UpK8puuSPk9Az7MtWwC6yQOYsyAIM046lRi4ZQkbSV',
  salzgarnelen: 'grass-cs/AABkmLeYxhQIN7AuPIjKmYThKRfOj1Oic1XGL7n3taGqt2n9I3IzmNvxDfAvkXUU_CHApflfK1iJoWFeDIOy_Nyqcz2eO_gck8rjdooMk7Thz2qhOwD8seA7CnRpPJ5HSIzn33t_olaQ44utEUpX',
  pinkgyoza: 'grass-cs/AABkmLfTdwe9Y1KLy0uVKyxgPY6oWa8l_MziY5rOLsq3IpYPIuCMUmaJk1tmzoslKhDi4tP5NCOxc4DIbfPGdfy8TPwLv_sgzyMicR4NzlnXizFMsTKtHFl-NT1lIpDPcAY5JRhIRQxYonafC7xB',
  wantan: 'grass-cs/AABkmLfjBoQhTI5dUwIvSBcosgVYLjV3ZZkIC6n_84-0pMSsWe8a1kxsrwkRUCLIEmr3bnYAyl97w39FBV5RSP5w0JagIYOFpWLKUQlyvwYxO9SSOAXnMLlREMDIxunnjjFfUZr6KzvJU0gWD7sd',
  melanzani: 'grass-cs/AABkmLfjDHF8Mi11wYCpbQfAtp-aftYH5o3_iuuCN7RAUtNVXxKFdMaA4seocb2kPyHevtp-t5UDMyFlvIqEiTITfGNOwWLp8NqQFab7kFAOtTfpKjCs_v1lAlUKRShAa5FVMG2KlZS6aaIWaAgK',
  dandan: 'grass-cs/AABkmLfyo3pijdqePgxDCSiLEpzPmXDEbkkZzAs3aDz2l0mlhh6F0YlpENhEq0cY5ajTuFGimeOMb8XhZe7QIUbhfC_MqKlISNE5Zp65_902OLwCAIerZ4a8dt6iqJ5rFQQnLbzDC2FuS7Zv15dx',
};

export const haoHan: Prospect = {
  slug: 'hao-han',
  name: 'Hao Han',
  branchSlug: 'gumpendorfer-strasse',
  branchName: 'Gumpendorfer Straße',
  address: 'Gumpendorfer Straße 41, 1060 Wien',
  accent: '#B3261E',
  logo: '🥢',
  cover: G(P.interior, 1600, 1000),
  menu: [
    // ── Dim Sum & Teigtaschen ──
    { sku: 'vietroll', name: 'Vietnamesische Frühlingsrollen (3 Stk.)', price: 6.9, cat: 'Speisen', photo: G(P.vietroll), rep: 4.8, demand: 5 },
    { sku: 'germ', name: 'Germteigtaschen mit Chashu (2 Stk.)', price: 7.5, cat: 'Speisen', photo: G(P.germ), rep: 4.5, demand: 3 },
    { sku: 'rainbow', name: 'Mixed Rainbow Gyoza (12 Stk.)', price: 13.9, cat: 'Speisen', photo: G(P.rainbow), rep: 4.6, demand: 4 },
    { sku: 'pinkgyoza', name: 'Pink Gyoza (6 Stk.)', price: 7.5, cat: 'Speisen', photo: G(P.pinkgyoza), rep: 4.3, demand: 2 },
    { sku: 'wantan', name: 'Wan Tan in Chiliöl (6 Stk.)', price: 6.9, cat: 'Speisen', photo: G(P.wantan), rep: 4.4, demand: 3 },
    { sku: 'rindkalt', name: 'Geschmortes Rindfleisch mit Sojasauce', price: 7.9, cat: 'Speisen', photo: G(P.rindkalt), rep: 3.7, demand: 2 },
    // ── Nudeln & Suppen ──
    { sku: 'rindsuppe', name: 'Nudelsuppe mit zartem Rindfleisch', price: 15.9, cat: 'Speisen', photo: G(P.rindsuppe), rep: 4.8, demand: 5 },
    { sku: 'pho', name: 'Pho', price: 15.9, cat: 'Speisen', photo: G(P.pho), rep: 4.6, demand: 4 },
    { sku: 'seafood', name: 'Nudelsuppe mit Meeresfrüchten', price: 15.9, cat: 'Speisen', photo: G(P.seafood), rep: 4.2, demand: 2 },
    { sku: 'dandan', name: 'Dan Dan Nudeln', price: 12.9, cat: 'Speisen', photo: G(P.dandan), rep: 4.0, demand: 3 },
    { sku: 'ente', name: 'Gebratene Nudeln mit knuspriger Ente', price: 15.9, cat: 'Speisen', photo: G(P.ente), rep: 3.6, demand: 4 },
    // ── Wok ──
    { sku: 'calamari', name: 'Calamari mit Knoblauchsprossen', price: 16.9, cat: 'Speisen', photo: G(P.calamari), rep: 4.4, demand: 2 },
    { sku: 'pfefferoni', name: 'Rindfleisch mit Pfefferoni', price: 14.9, cat: 'Speisen', photo: G(P.pfefferoni), rep: 4.3, demand: 3 },
    { sku: 'gonbao', name: 'Gon Bao Garnelen', price: 17.9, cat: 'Speisen', photo: G(P.gonbao), rep: 4.0, demand: 3 },
    { sku: 'salzgarnelen', name: 'Garnelen mit geröstetem Salz', price: 17.9, cat: 'Speisen', photo: G(P.salzgarnelen), rep: 4.5, demand: 2 },
    { sku: 'huiguorou', name: 'Hui Guo Rou', price: 14.9, cat: 'Speisen', photo: G(P.huiguorou), rep: 4.2, demand: 2 },
    { sku: 'melanzani', name: 'Gebratene Melanzani süß-sauer', price: 13.9, cat: 'Speisen', photo: G(P.melanzani), rep: 3.9, demand: 3 },
    // ── Getränke ──
    { sku: 'tsingtao', name: 'Tsingtao 0,33 l', price: 4.5, cat: 'Getränke', photo: WOLT('67bf2259c37c12770f813aa2'), rep: 4.3, demand: 3 },
    { sku: 'roemerquelle', name: 'Römerquelle prickelnd 0,5 l', price: 3.5, cat: 'Getränke', photo: WOLT('684165c80cce83d9326082da'), rep: 4.2, demand: 2 },
  ],
  vouchers: [
    { title: 'Gratis Frühlingsrollen', points: 100, img: G(P.vietroll, 1000, 500) },
    { title: 'Gratis Wan Tan in Chiliöl', points: 150, img: G(P.wantan, 1000, 500) },
    { title: '10 % auf die ganze Rechnung', points: 250, img: G(P.interior, 1000, 500) },
    { title: 'Gratis Rainbow Gyoza', points: 400, img: G(P.rainbow, 1000, 500) },
  ],
  reviews: [
    { table: 2, daysAgo: 10, items: [
      { sku: 'vietroll', stars: 5, note: 'Man merkt, dass alles handgemacht ist, und richtig gut gefüllt.' },
      { sku: 'ente', stars: 3, note: 'Ente war eher trocken, die Haut nicht mehr knusprig.' },
    ] },
    { table: 5, daysAgo: 8, items: [
      { sku: 'rindsuppe', stars: 5, note: 'Die Suppennudeln sind sicher selbst gemacht. Riesige Portion.' },
      { sku: 'rindkalt', stars: 3, note: 'Für 7,90 recht wenig und zu salzig.' },
    ] },
    { table: 1, daysAgo: 6, items: [
      { sku: 'rainbow', stars: 5, note: 'Jede Farbe schmeckt anders, die gelbe mit Curry ist mein Favorit.' },
      { sku: 'gonbao', stars: 4, note: 'Garnelen super, Sauce hätte schärfer sein dürfen.' },
    ] },
    { table: 7, daysAgo: 5, items: [
      { sku: 'pho', stars: 5, note: 'Brühe klar und kräftig, kam sehr schnell.' },
    ] },
    { table: 3, daysAgo: 4, items: [
      { sku: 'calamari', stars: 5, note: 'Knoblauchsprossen knackig, Calamari zart.' },
      { sku: 'melanzani', stars: 3, note: 'Zu süß und sehr ölig.' },
    ] },
    { table: 4, daysAgo: 3, items: [
      { sku: 'ente', stars: 3, note: 'Nudeln gut, aber die Ente war lauwarm.' },
      { sku: 'wantan', stars: 5, note: 'Chiliöl mit richtig Tiefe, nicht nur scharf.' },
    ] },
    { table: 6, daysAgo: 2, items: [
      { sku: 'rindsuppe', stars: 5, note: 'Der Koch kam selbst fragen, ob alles passt. Top.' },
      { sku: 'dandan', stars: 4, note: 'Gut, aber etwas wenig Sesam.' },
    ] },
    { table: 8, daysAgo: 1, items: [
      { sku: 'germ', stars: 5, note: 'Fluffig, Chashu-Füllung schön würzig.' },
      { sku: 'tsingtao', stars: 4, note: 'Kalt, passt.' },
    ] },
  ],
  notes: {
    vietroll: { good: ['Handgemacht und gut gefüllt.', 'Außen knusprig, innen saftig.'], bad: ['Etwas zu fettig heute.'] },
    rindsuppe: { good: ['Hausgemachte Nudeln, große Portion.', 'Brühe mit richtig Tiefe.'], bad: ['Heute zu salzig.'] },
    pho: { good: ['Brühe klar und kräftig.', 'Viele Kräuter, frisch.'], bad: ['Wenig Fleisch für 15,90.'] },
    rainbow: { good: ['Jede Sorte anders, toll zum Teilen.'], bad: ['Teig an einigen eingerissen.'] },
    ente: {
      good: ['Haut knusprig, Nudeln gut.'],
      bad: ['Ente trocken.', 'Haut nicht mehr knusprig.', 'Lauwarm serviert.', 'Zu viel Teriyaki, alles süß.'],
    },
    rindkalt: { good: ['Zart, schön aromatisch.'], bad: ['Kleine Portion für den Preis.', 'Zu salzig.'] },
    melanzani: { good: ['Schön weich, gute Sauce.'], bad: ['Zu süß.', 'Sehr ölig.'] },
    gonbao: { good: ['Garnelen groß und saftig.'], bad: ['Zu wenig Schärfe.', 'Sauce zu dick.'] },
    calamari: { good: ['Zart, Knoblauchsprossen knackig.'], bad: ['Etwas zäh.'] },
    wantan: { good: ['Chiliöl mit Tiefe.'], bad: ['Zu scharf für mich.'] },
    dandan: { good: ['Schön nussig.'], bad: ['Zu wenig Sesam.', 'Nudeln verklebt.'] },
  },
  ordersPerDay: 26,
  reviewRate: 0.38,
  service: 4.6,
  weekendDip: 0.3,
  open: [11 * 60 + 30, 22 * 60 + 30],
  randomSeed: 0x48414f48,
};
