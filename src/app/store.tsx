import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// ═══════════════════════════════════════════════════════════
// TYPES — spiegeln die vom Server serialisierten Dokumente
// (Mongo _id -> id: string). Jede Organisation lebt in einer
// eigenen Datenbank; diese Typen beschreiben den Zustand EINER
// Organisation, wie ihn GET /api/:orgSlug/state liefert.
// ═══════════════════════════════════════════════════════════

export interface Brand {
  name: string; accent: string; logo: string;
  logoImage?: string | null; coverImage?: string | null;
  font?: string; cardStyle?: 'standard' | 'kompakt' | 'editorial';
  // Hell/Dunkel der GASTANSICHT — Markenauftritt, getrennt vom Hell/Dunkel
  // der Verwaltung (das liegt lokal unter `bitely.theme`).
  guestTheme?: 'hell' | 'dunkel';
}

// Kuratierte Auswahl statt freier Schriftart-Eingabe — jede hier lädt zuverlässig via Google Fonts.
export const BRAND_FONTS = [
  { name: 'Inter', category: 'Modern & neutral', googleFamily: 'Inter:wght@400;500;600;700' },
  { name: 'Poppins', category: 'Freundlich & rund', googleFamily: 'Poppins:wght@400;500;600;700' },
  { name: 'DM Sans', category: 'Klar & sachlich', googleFamily: 'DM+Sans:wght@400;500;600;700' },
  { name: 'Fraunces', category: 'Editorial & warm', googleFamily: 'Fraunces:wght@400;500;600;700' },
  { name: 'Playfair Display', category: 'Elegant & gehoben', googleFamily: 'Playfair+Display:wght@400;600;700' },
  { name: 'Space Grotesk', category: 'Technisch & markant', googleFamily: 'Space+Grotesk:wght@400;500;600;700' },
] as const;

export const BRAND_CARD_STYLES: { id: NonNullable<Brand['cardStyle']>; label: string; desc: string }[] = [
  { id: 'standard', label: 'Standard', desc: 'Bild links, Infos rechts, kompakt und bewährt.' },
  { id: 'kompakt', label: 'Kompakt', desc: 'Kleineres Bild, engere Abstände, mehr Gerichte auf einen Blick.' },
  { id: 'editorial', label: 'Editorial', desc: 'Großes Bild oben, Text darunter, wirkt hochwertiger.' },
];

// Verkleinert/komprimiert ein Bild im Browser vor dem Upload, damit die
// Dokumente in MongoDB klein bleiben. Ergebnis ist ein data:-URI (JPEG).
export function compressImageFile(file: File, maxDim = 480, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas wird nicht unterstützt.')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
export interface Branch {
  id: string; slug: string; name: string; address: string;
  // Der Google-Maps-Eintrag dieser Filiale. Ohne Wert baut der Server einen
  // Suchlink aus Name und Adresse — siehe mapsUrlFor in index.ts.
  googleMapsUrl?: string | null;
}

export interface Dish {
  id: string; name: string; img: string; price: number; cat: 'Speisen' | 'Getränke';
  // Welche Filialen es führen; null = alle. Die Stammdaten gehören der Kette,
  // die Verfügbarkeit der Filiale.
  branchIds: string[] | null;
  // Bereits auf die betrachtete Filiale heruntergerechnet (oder über die Kette
  // summiert) — der Server macht das, siehe serializeDish in index.ts.
  ratingsSum: number; ratingsCount: number;
}

/** Führt diese Filiale das Gericht bzw. gilt der Gutschein dort? */
export function availableIn(item: { branchIds: string[] | null }, branchId: string): boolean {
  return item.branchIds == null || item.branchIds.includes(branchId);
}

/**
 * Ist dieser Gutschein abgelaufen?
 *
 * `expiry` ist Freitext — der Admin tippt „31.12.2026" ins Formular —, deshalb
 * beide gebräuchlichen Formen: deutsch mit Punkten und ISO. Was sich nicht
 * lesen lässt, gilt als unbefristet; ein Gutschein, der wegen eines Tippfehlers
 * im Datum stillschweigend verschwindet, wäre schlimmer als einer, der zu lange
 * gilt. Gerechnet wird gegen das ENDE des genannten Tages: „gültig bis 31.12."
 * heißt den 31. über.
 *
 * Dieselbe Regel steht noch einmal auf dem Server (voucherExpired in index.ts).
 * Hier bestimmt sie, was der Gast SIEHT; dort, was er einlösen KANN — und nur
 * die zweite ist der Schutz.
 */
export function voucherExpired(v: { expiry: string }, now = Date.now()): boolean {
  const text = (v.expiry ?? '').trim();
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  let y: number, m: number, d: number;
  if (de) { d = +de[1]; m = +de[2]; y = +de[3]; }
  else if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else return false;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime() < now;
}

export interface TableItem { dishId: string; qty: number; }

export interface TableRow {
  id: string; branchId: string; number: number;
  // Zwei Zustände: 'offen' = Bestellung läuft, Bewertung steht aus; 'frei' =
  // nichts offen. Siehe TableDoc in server/src/types.ts.
  status: 'frei' | 'offen'; items: TableItem[]; openedAt: number | null;
}

export interface Voucher {
  id: string; title: string; points: number; expiry: string; img: string;
  // Wo er gilt; null = ganze Kette.
  branchIds: string[] | null;
}

export interface AdminUser {
  id: string; name: string; email: string; role: 'Admin' | 'Manager' | 'Kellner';
  branchId: string | null; status: 'aktiv' | 'eingeladen' | 'inaktiv';
  // Welche Anmeldewege dieses Konto hat. Weder Hash noch Googles Konto-ID
  // verlassen den Server — nur die Auskunft, ob es sie gibt.
  hasPassword?: boolean; hasGoogle?: boolean;
  // Eigener Anthropic-Key hinterlegt? Der Schlüssel selbst verlässt den
  // Server nie, siehe CLAUDE.md "KI-Funktionen".
  hasApiKey?: boolean;
}

// Wer gerade angemeldet ist. null = niemand (Gastansicht oder ausgeloggt).
export type AuthUser = AdminUser;

// Manager zählt überall als Admin — dieselbe Aufteilung wie serverseitig
// in index.ts (adminOnly / staffOrAdmin). Die Oberfläche darf davon nicht
// abweichen, sonst zeigt sie Schaltflächen, die der Server dann ablehnt.
export function isAdminRole(role: AuthUser['role'] | undefined): boolean {
  return role === 'Admin' || role === 'Manager';
}

export interface DishRatingInput { dishId: string; stars: number; note?: string; }

// Was der Admin beim Anlegen/Bearbeiten schickt — ohne die Felder, die
// ausschließlich der Server pflegt (id, ratingsSum, ratingsCount).
export type DishInput = Pick<Dish, 'name' | 'price' | 'cat'> & { img?: string; branchIds?: string[] | null };
export type VoucherInput = Pick<Voucher, 'title' | 'points' | 'expiry'> & { img?: string; branchIds?: string[] | null };
export type BranchInput = Pick<Branch, 'name' | 'address'> & { googleMapsUrl?: string | null };

export interface Alert {
  id: string; branchId: string; tableId: string; tableNumber: number; dishName: string;
  stars: number; note?: string; createdAt: number; resolved: boolean;
}

// Eine abgegebene Gast-Bewertung, wie sie der Server liefert. Enthält die
// Freitexte, die der Gast zu einzelnen Gerichten geschrieben hat.
export interface Review {
  id: string;
  tableNumber: number;
  dishRatings: DishRatingInput[];
  overall: { service: number; ambience: number; speed: number };
  createdAt: number;
}

/**
 * Eine Gutschein-Einlösung am Tisch. Der Wisch entwertet sofort und endgültig,
 * die Punkte sind damit weg. `entwertet` heißt: der Gast zeigt den Bildschirm,
 * die Ausgabe ist noch nicht eingetragen. `eingelöst` heißt: die Servicekraft
 * hat sie eingetragen.
 */
export interface Redemption {
  id: string;
  voucherId: string;
  voucherTitle: string;
  branchId: string;
  tableId: string | null;
  tableNumber: number | null;
  // Nur fürs Personal. Angezeigt wird er nirgends mehr — der Gast sieht nach
  // dem Wisch ein Häkchen statt einer Zahl —, er bleibt die Kennung der
  // Einlösung im Reporting der Verwaltung.
  code?: string;
  points: number;
  // 'entwertet' = gewischt, Punkte weg, Ausgabe steht aus. 'eingelöst' = die
  // Servicekraft hat sie eingetragen. Die drei anderen stammen aus der Zeit
  // der 60-Sekunden-Frist und entstehen nicht mehr neu.
  status: 'entwertet' | 'eingelöst' | 'offen' | 'verfallen' | 'abgebrochen';
  createdAt: number;
  expiresAt: number | null;
  redeemedAt: number | null;
  confirmedByName: string | null;
}

export interface GuestProfile {
  loggedIn: boolean; points: number; redeemed: string[];
  // Nur gesetzt, wenn ein Gastkonto angemeldet ist.
  name?: string | null; email?: string | null;
}

/** Das angemeldete Gastkonto — das Gegenstück zu AuthUser auf der Personalseite. */
export interface GuestAccount {
  id: string; email: string; name: string;
  points: number; redeemed: string[];
  hasPassword: boolean; hasGoogle: boolean;
  hasApiKey: boolean;
}

/** Welche Anmeldewege der Server anbietet. Google hängt an einer Client-ID. */
export interface AuthOptions {
  password: boolean; google: boolean; googleClientId: string | null;
}

/** Der fertig formulierte Rezensionstext samt Weg zum Google-Eintrag. */
export interface ReviewTextResult {
  text: string;
  mapsUrl: string;
}

/** Der KI-Wochenrückblick des Dashboards. */
export interface Highlight {
  text: string;
  generatedAt: number;
  source: 'llm' | 'fallback';
  reviewCount: number;
  /** Älter als ein Tag — dann lohnt ein neuer. */
  stale: boolean;
}

/**
 * Die Dashboard-Auswertung über einen Zeitraum. Kommt aus einer eigenen Route,
 * nicht aus dem Gesamtzustand: der trägt nur die letzten 100 Bewertungen, für
 * einen Wochenverlauf reicht das nicht.
 */
export interface Insights {
  range: { from: number | null; to: number | null };
  // `orders` = gebuchte Bestellungen im Zeitraum. Neben `reviews` gestellt
  // sagt es, welcher Anteil der Tische überhaupt Feedback hinterlässt.
  totals: { reviews: number; ratings: number; orders: number; avg: number; capped: boolean };
  overall: { service: number; ambience: number; speed: number; count: number } | null;
  /**
   * Der Verlauf, lückenlos und in der Einheit, die zum Zeitraum passt —
   * Tage bei kurzen Zeiträumen, sonst Wochen oder Monate. Der Server
   * entscheidet das, damit „letzte 7 Tage" nicht als ein einziger Balken
   * ankommt.
   */
  trend: { start: number; reviews: number; avg: number }[];
  trendUnit: 'day' | 'week' | 'month';
  dishes: { id: string; name: string; avg: number; count: number }[];
  highlight: Highlight | null;
  /** Ob auf dem Server ein Modell-Schlüssel hinterlegt ist. */
  aiAvailable: boolean;
}

interface OrgState {
  brand: Brand | null;
  // Ausgeblendete Dashboard-Kacheln. Liegt beim Server, weil eine Ansicht,
  // die sich beim Neuladen zurücksetzt, keine Einstellung ist.
  dashboard: { hiddenWidgets: string[] };
  branches: Branch[];
  dishes: Dish[];
  tables: TableRow[];
  vouchers: Voucher[];
  users: AdminUser[];
  alerts: Alert[];
  reviews: Review[];
  redemptions: Redemption[];
  guest: GuestProfile;
  /**
   * Was eine Bewertung wert ist. Kommt vom Server, wird hier nicht gerechnet:
   * die Punkte vergibt ohnehin nur er, und eine zweite Kopie der Zahlen liefe
   * irgendwann auseinander. Gebraucht wird sie, um dem Gast VOR dem Bewerten
   * zu sagen, wofür es Punkte gibt.
   */
  pointsRule: PointsRule;
}

export interface PointsRule {
  /** Punkte je bewertetem Gericht. */
  perDish: number;
  /** Punkte für die abgeschickte Bewertung an sich. */
  perReview: number;
}

/**
 * Was eine Bewertung mit so vielen bewerteten Gerichten einbringt. Dieselbe
 * Rechnung wie `pointsFor` auf dem Server, nur mit dessen Zahlen gefüttert.
 */
export function pointsFor(rule: PointsRule | undefined, ratedCount: number): number {
  // Ohne Regel keine Zusage: 0 heißt hier „wir wissen es nicht", und die
  // Oberfläche zeigt dann gar keinen Betrag an, statt einen falschen.
  if (!rule) return 0;
  return ratedCount * rule.perDish + rule.perReview;
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

export function dishAvg(d: Dish): number | undefined {
  return d.ratingsCount > 0 ? d.ratingsSum / d.ratingsCount : undefined;
}

export function sinceLabel(t: TableRow): string {
  if (t.openedAt == null) return '';
  const min = Math.max(0, Math.round((Date.now() - t.openedAt) / 60000));
  if (min < 60) return `${min} Min`;
  return `${Math.round(min / 60)} Std`;
}

export function tableItemCount(t: TableRow): number {
  return t.items.reduce((a, i) => a + i.qty, 0);
}

// Lokal (npm run dev) leitet der Vite-Proxy /api an localhost:4000 weiter, dafür bleibt das leer.
// Für einen Netlify-Build o. Ä. auf VITE_API_BASE_URL setzen (z. B. den Cloudflare-Tunnel oder eine echte Server-Domain) —
// der Server hat CORS bereits offen, ein Cross-Origin-Aufruf funktioniert also direkt.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

// Das Sitzungs-Token liegt pro Organisation getrennt, damit ein Wechsel zwischen
// zwei Mandanten im selben Browser nicht das jeweils andere Token überschreibt.
const tokenKey = (orgSlug: string) => `bitely.token.${orgSlug}`;

export function readToken(orgSlug: string): string | null {
  try { return localStorage.getItem(tokenKey(orgSlug)); } catch { return null; }
}

function writeToken(orgSlug: string, token: string | null) {
  try {
    if (token) localStorage.setItem(tokenKey(orgSlug), token);
    else localStorage.removeItem(tokenKey(orgSlug));
  } catch { /* privater Modus o. Ä. — dann gilt die Sitzung nur bis zum Reload */ }
}

// Das Gast-Token liegt getrennt vom Personal-Token: auf demselben Gerät kann
// eine Servicekraft angemeldet sein UND ein Gast — beide dürfen sich nicht
// gegenseitig abmelden. Es hält länger (90 Tage), weil ein Gast seine Punkte
// nicht bei jedem Besuch neu freischalten soll.
const guestTokenKey = (orgSlug: string) => `bitely.guest.${orgSlug}`;

export function readGuestToken(orgSlug: string): string | null {
  try { return localStorage.getItem(guestTokenKey(orgSlug)); } catch { return null; }
}

function writeGuestToken(orgSlug: string, token: string | null) {
  try {
    if (token) localStorage.setItem(guestTokenKey(orgSlug), token);
    else localStorage.removeItem(guestTokenKey(orgSlug));
  } catch { /* siehe oben */ }
}

/** Abgelaufene/ungültige Sitzung, damit die Oberfläche zurück zum Login kann. */
export class UnauthorizedError extends Error {}

/**
 * Wer die Anfrage stellt. Der Header trägt nur EIN Token, also muss die Ansicht
 * entscheiden: In der Gastansicht gilt das Gastkonto, in Kellner- und
 * Adminansicht das Personalkonto.
 *
 * Das ist keine Feinheit: Wer den Admin offen hat und daneben den QR-Code am
 * eigenen Handy öffnet, hat BEIDE Token im Browser. Ging dabei das
 * Personal-Token mit, sah der Server kein Gastkonto — die Anmeldung schien
 * wirkungslos und Bewertungen brachten keine Punkte.
 */
export type Audience = 'guest' | 'staff';

async function api<T>(orgSlug: string, path: string, init?: RequestInit, audience: Audience = 'staff'): Promise<T> {
  const token = audience === 'guest'
    ? (readGuestToken(orgSlug) ?? readToken(orgSlug))
    : (readToken(orgSlug) ?? readGuestToken(orgSlug));
  const res = await fetch(`${API_BASE}/api/${orgSlug}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.error ?? `Anfrage fehlgeschlagen (${res.status})`;
    throw res.status === 401 ? new UnauthorizedError(message) : new Error(message);
  }
  return res.json() as Promise<T>;
}

// ═══════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════

interface StoreApi extends OrgState {
  orgSlug: string;
  loading: boolean;
  error: string | null;
  // Angemeldeter Mitarbeiter (Admin/Manager/Kellner) oder null.
  // authLoading deckt das Nachprüfen eines gespeicherten Tokens beim Seitenaufruf
  // ab — ohne das würde die Login-Maske kurz aufblitzen, obwohl die Sitzung gilt.
  authUser: AuthUser | null;
  authLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  // Personal-Anmeldung über Google. Legt kein Konto an — sie findet nur eines,
  // das ein Admin schon eingeladen hat.
  googleLogin: (credential: string) => Promise<void>;
  logout: () => void;
  // Angemeldeter GAST (nicht Personal) oder null.
  guestUser: GuestAccount | null;
  authOptions: AuthOptions;
  guestRegister: (email: string, name: string, password: string) => Promise<void>;
  guestLogin: (email: string, password: string) => Promise<void>;
  guestGoogleLogin: (credential: string) => Promise<void>;
  guestLogout: () => Promise<void>;
  deleteGuestAccount: () => Promise<void>;
  // Eigener Anthropic-Key des Gastkontos — treibt danach den automatischen
  // Rezensionstext an. Der Klartext geht nie durch diesen Store zurück.
  setGuestApiKey: (apiKey: string) => Promise<void>;
  removeGuestApiKey: () => Promise<void>;
  refresh: () => Promise<void>;
  // Alle Tisch-Aufrufe tragen die Filiale: die Nummer allein ist mehrdeutig,
  // Tisch 5 gibt es in jeder Filiale einmal.
  saveTableOrder: (branchSlug: string, tableNumber: number, cart: Record<string, number>) => Promise<void>;
  closeTable: (branchSlug: string, tableNumber: number) => Promise<void>;
  addItemToTable: (branchSlug: string, tableNumber: number, dishId: string, qty?: number) => Promise<void>;
  // Liefert, was gutgeschrieben wurde UND was möglich gewesen wäre: ohne
  // Gastkonto gibt es keine Punkte, und der Gast soll erfahren, was er
  // liegenlässt.
  submitReview: (branchSlug: string, tableNumber: number, dishRatings: DishRatingInput[], overall: { service: number; ambience: number; speed: number }) => Promise<{ earned: number; possible: number; ticket: string | null; reviewTicket: string | null }>;
  // Holt den KI-Rezensionstext zu einer gerade abgegebenen Bewertung. Getrennt
  // vom Absenden, weil das Formulieren Sekunden dauert — der Gast soll nicht
  // vor einem hängenden „Wird gesendet…" warten.
  fetchReviewText: (ticket: string) => Promise<ReviewTextResult>;
  // Löst den Punkte-Gutschein einer Bewertung ein, die vor der Anmeldung
  // abgegeben wurde. Gibt zurück, wie viele Punkte tatsächlich ankamen.
  claimPoints: (ticket: string) => Promise<number>;
  // Einlösung eröffnen — gibt den kurzlebigen Code zurück, den die
  // Servicekraft in ihrer eigenen App gegenprüft.
  startRedemption: (branchSlug: string, voucherId: string, tableNumber?: number)
    => Promise<{ ok: true; redemption: Redemption } | { ok: false; error: string }>;
  confirmRedemption: (branchSlug: string, redemptionId: string) => Promise<void>;
  // Gericht in EINER Filiale führen oder nicht — der Hebel der Filialleitung.
  setDishAvailability: (branchSlug: string, dishId: string, active: boolean) => Promise<void>;
  resolveAlert: (alertId: string) => Promise<void>;
  addUser: (u: { name: string; email: string; role: AdminUser['role']; branchId: string | null }) => Promise<AdminUser | null>;
  removeUser: (id: string) => Promise<void>;
  // Rolle und Filiale eines bestehenden Kontos ändern. Nur der Ketten-Admin —
  // der Server lehnt alles andere ab (PATCH /users/:id).
  updateUser: (id: string, patch: { role?: AdminUser['role']; branchId?: string | null; name?: string }) => Promise<void>;
  setUserPassword: (id: string, password: string) => Promise<void>;
  // Eigener Anthropic-Key des angemeldeten Personal-Kontos — treibt danach
  // Wochenrückblick und Bon-Scan an, für jede Rolle (ein Kellner braucht ihn
  // für Letzteres genauso wie ein Admin).
  setMyApiKey: (apiKey: string) => Promise<void>;
  removeMyApiKey: () => Promise<void>;
  updateBrand: (partial: Partial<Brand>) => Promise<void>;
  setHiddenWidgets: (ids: string[]) => Promise<void>;
  updateDishImage: (dishId: string, img: string) => Promise<void>;
  addTables: (branchSlug: string, count: number) => Promise<void>;
  removeTable: (branchSlug: string, id: string) => Promise<void>;
  addDish: (d: DishInput) => Promise<void>;
  updateDish: (id: string, d: Partial<DishInput>) => Promise<void>;
  removeDish: (id: string) => Promise<void>;
  addVoucher: (v: VoucherInput) => Promise<void>;
  updateVoucher: (id: string, v: Partial<VoucherInput>) => Promise<void>;
  removeVoucher: (id: string) => Promise<void>;
  addBranch: (b: BranchInput) => Promise<void>;
  updateBranch: (id: string, b: Partial<BranchInput>) => Promise<void>;
  removeBranch: (id: string) => Promise<void>;
  // Dashboard-Auswertung über einen Zeitraum (ISO-Datum, beide optional).
  // `branchIds` grenzt zusätzlich auf einzelne Filialen ein — nur für Konten
  // OHNE feste Filiale von Belang, sonst gewinnt deren Bindung (siehe Server).
  fetchInsights: (from: string | null, to: string | null, branchIds?: string[] | null) => Promise<Insights>;
  // Den Wochenrückblick schreiben lassen. Ist der gespeicherte keinen Tag alt,
  // kommt er unverändert zurück statt eines zweiten Modellaufrufs.
  refreshHighlight: () => Promise<Highlight>;
  // Gerichte auf dem Foto eines Bons erkennen — Vorschlag, kein Buchen.
  scanReceipt: (branchSlug: string, image: string) => Promise<{ dishId: string; qty: number }[]>;
}

const StoreContext = createContext<StoreApi | null>(null);

/**
 * Fehlende Felder auffüllen, bevor die Oberfläche den Zustand zu sehen bekommt.
 *
 * `setState` ersetzt den Zustand VOLLSTÄNDIG durch die Antwort des Servers, an
 * über dreißig Stellen. Läuft die Oberfläche gegen einen älteren Server, fehlt
 * dort, was sie inzwischen liest, und ein `undefined` an der falschen Stelle
 * ist kein fehlendes Detail, sondern ein weißer Bildschirm: `pointsRule` nicht
 * gesetzt hieß, dass der Bewertungsbildschirm beim Öffnen abstürzte.
 *
 * Frontend und Backend gehen nicht immer im selben Moment raus (Netlify und
 * Render bauen getrennt, und Render Free schläft dazwischen ein). Das hier ist
 * die eine Stelle, die das aushält. Wer ein neues Feld in `OrgState` aufnimmt,
 * das die Oberfläche ohne Prüfung liest, trägt es hier ein.
 */
function withDefaults(s: OrgState): OrgState {
  return { ...s, pointsRule: s.pointsRule ?? EMPTY_STATE.pointsRule };
}

const EMPTY_STATE: OrgState = {
  brand: null, dashboard: { hiddenWidgets: [] },
  branches: [], dishes: [], tables: [], vouchers: [], users: [], alerts: [], reviews: [],
  redemptions: [],
  guest: { loggedIn: false, points: 0, redeemed: [] },
  // Bis der Server antwortet: keine Punkte versprechen, die es womöglich
  // anders gibt. Der Hinweis in der Gastansicht bleibt so lange aus.
  pointsRule: { perDish: 0, perReview: 0 },
};

/**
 * Welche Filiale der Zustand abbildet:
 *
 *   '<slug>'  genau diese Filiale
 *   'all'     alle Filialen (nur für Konten ohne feste Filiale)
 *   'self'    der Server entscheidet anhand des angemeldeten Kontos
 *   null      noch unbekannt — es wird gar nicht geladen
 *
 * 'self' löst das Henne-Ei-Problem beim Seitenaufruf: ob jemand an eine Filiale
 * gebunden ist, weiß nur der Server. Die Servicekraft bekommt so ihre Filiale,
 * der Ketten-Admin den Blick über alles — ohne dass die Oberfläche vorher
 * wissen muss, wer geladen hat.
 */
export type BranchScope = string | 'all' | 'self' | null;

export function StoreProvider({ orgSlug, scope, audience = 'staff', children }: {
  orgSlug: string; scope: BranchScope; audience?: Audience; children: ReactNode;
}) {
  const [state, setState] = useState<OrgState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [guestUser, setGuestUser] = useState<GuestAccount | null>(null);
  const [authOptions, setAuthOptions] = useState<AuthOptions>({
    password: true, google: false, googleClientId: null,
  });

  // Der Server liefert nur die Daten der angefragten Filiale — die Oberfläche
  // filtert nicht selbst. Ohne bekannte Filiale wird gar nicht erst geladen.
  const refresh = useCallback(async () => {
    if (!scope) return;
    try {
      setError(null);
      // 'self' lässt den Parameter weg — dann leitet der Server die Filiale aus
      // dem Token ab.
      const query = scope === 'self' ? '' : `?branch=${encodeURIComponent(scope)}`;
      const data = await api<OrgState>(orgSlug, `/state${query}`, undefined, audience);
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verbindung zum Server fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, scope, audience]);

  useEffect(() => { if (scope) setLoading(true); refresh(); }, [refresh, scope]);

  const logout = useCallback(() => {
    writeToken(orgSlug, null);
    setAuthUser(null);
    setState(EMPTY_STATE);
  }, [orgSlug]);

  const login = useCallback(async (email: string, password: string) => {
    // Der Aufruf selbst braucht kein Token — ein altes, abgelaufenes im Header
    // stört nicht, der Server ignoriert es auf dieser Route.
    const data = await api<{ token: string; user: AuthUser }>(orgSlug, '/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
    writeToken(orgSlug, data.token);
    setAuthUser(data.user);
    // Der bisherige Zustand galt für einen anonymen Aufruf und ist meist leer
    // (ohne Anmeldung lehnt /state ohne Filiale ab). Jetzt neu laden, damit die
    // Reichweite des frisch angemeldeten Kontos gilt.
    setLoading(true);
    await refresh();
  }, [orgSlug, refresh]);

  // Gespeichertes Token beim Seitenaufruf gegen den Server prüfen: nur er weiß,
  // ob es abgelaufen ist oder das Konto inzwischen deaktiviert wurde.
  useEffect(() => {
    let cancelled = false;
    if (!readToken(orgSlug)) { setAuthUser(null); setAuthLoading(false); return; }
    setAuthLoading(true);
    api<{ user: AuthUser }>(orgSlug, '/auth/me')
      .then(({ user }) => { if (!cancelled) setAuthUser(user); })
      .catch(() => { if (!cancelled) { writeToken(orgSlug, null); setAuthUser(null); } })
      .finally(() => { if (!cancelled) setAuthLoading(false); });
    return () => { cancelled = true; };
  }, [orgSlug]);

  // Jeder Aufruf außer /state und /auth/*. Läuft die Sitzung ab, während jemand
  // arbeitet, antwortet der Server mit 401 — dann wird das tote Token verworfen
  // und die Oberfläche fällt zurück auf die Anmeldung, statt stumm zu scheitern.
  const call = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    try {
      return await api<T>(orgSlug, path, init, audience);
    } catch (err) {
      // Nur eine abgelaufene PERSONAL-Sitzung führt zurück zur Anmeldung. Ein
      // 401 in der Gastansicht heißt meist "dafür brauchst du ein Konto" — das
      // darf die Servicekraft am selben Gerät nicht hinauswerfen.
      if (err instanceof UnauthorizedError && readToken(orgSlug)) logout();
      throw err;
    }
  }, [orgSlug, logout, audience]);

  // ── Gastkonten ────────────────────────────────────────────────
  // Eigene Sitzung, eigenes Token, eigener Zustand. Punkte gehören ab hier
  // einem Konto; ohne Anmeldung bewertet man weiterhin, bekommt aber nichts
  // gutgeschrieben.
  const applyGuestSession = useCallback(async (data: { token: string; guest: GuestAccount }) => {
    writeGuestToken(orgSlug, data.token);
    setGuestUser(data.guest);
    // Wie bei `login`: der Zustand galt bisher für einen anonymen Aufruf. Bis der
    // neue geladen ist, den Ladebildschirm zeigen — sonst blitzt kurz die
    // „Organisation nicht gefunden"-Meldung auf (leerer Zustand, brand === null).
    setLoading(true);
    await refresh();
  }, [orgSlug, refresh]);

  const guestRegister = useCallback(async (email: string, name: string, password: string) => {
    await applyGuestSession(await api<{ token: string; guest: GuestAccount }>(orgSlug, '/guest/register', {
      method: 'POST', body: JSON.stringify({ email, name, password }),
    }, 'guest'));
  }, [orgSlug, applyGuestSession]);

  const googleLogin = useCallback(async (credential: string) => {
    const data = await api<{ token: string; user: AuthUser }>(orgSlug, '/auth/google', {
      method: 'POST', body: JSON.stringify({ credential }),
    });
    writeToken(orgSlug, data.token);
    setAuthUser(data.user);
    // Wie bei `login`: bis der Zustand des angemeldeten Kontos geladen ist, den
    // Ladebildschirm zeigen statt die „Organisation nicht gefunden"-Meldung.
    setLoading(true);
    await refresh();
  }, [orgSlug, refresh]);

  const guestLogin = useCallback(async (email: string, password: string) => {
    await applyGuestSession(await api<{ token: string; guest: GuestAccount }>(orgSlug, '/guest/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }, 'guest'));
  }, [orgSlug, applyGuestSession]);

  const guestGoogleLogin = useCallback(async (credential: string) => {
    await applyGuestSession(await api<{ token: string; guest: GuestAccount }>(orgSlug, '/guest/google', {
      method: 'POST', body: JSON.stringify({ credential }),
    }, 'guest'));
  }, [orgSlug, applyGuestSession]);

  const claimPoints = useCallback(async (ticket: string) => {
    const data = await api<OrgState & { pointsClaimed: number }>(orgSlug, '/guest/claim-points', {
      method: 'POST', body: JSON.stringify({ ticket }),
    }, 'guest');
    const { pointsClaimed, ...rest } = data;
    setState(rest);
    return pointsClaimed;
  }, [orgSlug]);

  const guestLogout = useCallback(async () => {
    writeGuestToken(orgSlug, null);
    setGuestUser(null);
    await refresh();
  }, [orgSlug, refresh]);

  const deleteGuestAccount = useCallback(async () => {
    await api(orgSlug, '/guest/me', { method: 'DELETE' }, 'guest');
    await guestLogout();
  }, [orgSlug, guestLogout]);

  const setGuestApiKey = useCallback(async (apiKey: string) => {
    const { guest } = await api<{ guest: GuestAccount }>(orgSlug, '/guest/me/api-key', {
      method: 'PUT', body: JSON.stringify({ apiKey }),
    }, 'guest');
    setGuestUser(guest);
  }, [orgSlug]);

  const removeGuestApiKey = useCallback(async () => {
    const { guest } = await api<{ guest: GuestAccount }>(orgSlug, '/guest/me/api-key', { method: 'DELETE' }, 'guest');
    setGuestUser(guest);
  }, [orgSlug]);

  // Gespeicherte Gast-Sitzung beim Seitenaufruf prüfen — wie beim Personal
  // weiß nur der Server, ob sie noch gilt.
  useEffect(() => {
    let cancelled = false;
    if (!readGuestToken(orgSlug)) { setGuestUser(null); return; }
    api<{ guest: GuestAccount }>(orgSlug, '/guest/me', undefined, 'guest')
      .then(({ guest }) => { if (!cancelled) setGuestUser(guest); })
      .catch(() => { if (!cancelled) { writeGuestToken(orgSlug, null); setGuestUser(null); } });
    return () => { cancelled = true; };
  }, [orgSlug]);

  // Welche Anmeldewege es gibt, entscheidet der Server (Google nur mit
  // hinterlegter Client-ID) — nicht der Frontend-Build.
  useEffect(() => {
    let cancelled = false;
    api<AuthOptions>(orgSlug, '/auth-options')
      .then(opts => { if (!cancelled) setAuthOptions(opts); })
      .catch(() => { /* dann bleibt es beim Standard: nur E-Mail und Passwort */ });
    return () => { cancelled = true; };
  }, [orgSlug]);

  const saveTableOrder = useCallback(async (branchSlug: string, tableNumber: number, cart: Record<string, number>) => {
    setState(await call<OrgState>(`/branches/${branchSlug}/tables/${tableNumber}/order`, { method: 'POST', body: JSON.stringify({ cart }) }));
  }, [call]);

  // Der Server antwortet mit dem vollständigen neuen Zustand — die Oberfläche
  // übernimmt ihn direkt, statt lokal zu raten.
  const closeTable = useCallback(async (branchSlug: string, tableNumber: number) => {
    setState(await call<OrgState>(`/branches/${branchSlug}/tables/${tableNumber}/close`, { method: 'POST' }));
  }, [call]);

  const addItemToTable = useCallback(async (branchSlug: string, tableNumber: number, dishId: string, qty = 1) => {
    setState(await call<OrgState>(`/branches/${branchSlug}/tables/${tableNumber}/items`, { method: 'POST', body: JSON.stringify({ dishId, qty }) }));
  }, [call]);

  const submitReview = useCallback(async (
    branchSlug: string, tableNumber: number, dishRatings: DishRatingInput[], overall: { service: number; ambience: number; speed: number }
  ) => {
    const data = await call<OrgState & {
      pointsEarned: number; pointsPossible: number;
      pointsTicket: string | null; reviewTicket: string | null;
    }>(`/branches/${branchSlug}/tables/${tableNumber}/review`, {
      method: 'POST', body: JSON.stringify({ dishRatings, overall }),
    });
    const { pointsEarned, pointsPossible, pointsTicket, reviewTicket, ...rest } = data;
    setState(rest);
    return { earned: pointsEarned, possible: pointsPossible, ticket: pointsTicket, reviewTicket };
  }, [call]);

  const fetchReviewText = useCallback((ticket: string) =>
    api<ReviewTextResult>(orgSlug, '/guest/review-text', {
      method: 'POST', body: JSON.stringify({ ticket }),
    }, 'guest'), [orgSlug]);

  const startRedemption = useCallback(async (branchSlug: string, voucherId: string, tableNumber?: number) => {
    try {
      const data = await call<OrgState & { redemption: Redemption }>(
        `/branches/${branchSlug}/vouchers/${voucherId}/redeem`,
        { method: 'POST', body: JSON.stringify({ tableNumber }) }
      );
      const { redemption, ...rest } = data;
      setState(rest);
      return { ok: true as const, redemption };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'Einlösen fehlgeschlagen.' };
    }
  }, [call]);

  const confirmRedemption = useCallback(async (branchSlug: string, redemptionId: string) => {
    setState(await call<OrgState>(`/branches/${branchSlug}/redemptions/${redemptionId}/confirm`, { method: 'POST' }));
  }, [call]);

  const setDishAvailability = useCallback(async (branchSlug: string, dishId: string, active: boolean) => {
    setState(await call<OrgState>(`/branches/${branchSlug}/dishes/${dishId}/availability`, {
      method: 'PATCH', body: JSON.stringify({ active }),
    }));
  }, [call]);

  const resolveAlert = useCallback(async (alertId: string) => {
    setState(await call<OrgState>(`/alerts/${alertId}/resolve`, { method: 'POST' }));
  }, [call]);

  // Gibt den angelegten Benutzer zurück, damit der Aufrufer ihm direkt ein
  // Passwort geben kann — ohne das bliebe die Einladung wirkungslos.
  const addUser = useCallback(async (u: { name: string; email: string; role: AdminUser['role']; branchId: string | null }) => {
    const next = await call<OrgState>('/users', { method: 'POST', body: JSON.stringify(u) });
    setState(next);
    return next.users.find(x => x.email === u.email.trim().toLowerCase()) ?? null;
  }, [call]);

  const removeUser = useCallback(async (id: string) => {
    setState(await call<OrgState>(`/users/${id}`, { method: 'DELETE' }));
  }, [call]);

  // Befördern, herabstufen, in eine andere Filiale setzen. Vorher ging das nur
  // über Löschen und Neuanlegen — dabei verlor das Konto seine Kennung (an der
  // Alarme und Einlösungen hängen) und sein Passwort.
  const updateUser = useCallback(async (
    id: string,
    patch: { role?: AdminUser['role']; branchId?: string | null; name?: string },
  ) => {
    setState(await call<OrgState>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }));
  }, [call]);

  // Schaltet ein eingeladenes Konto frei oder setzt ein vergessenes Passwort
  // zurück. Ohne das bliebe eine Einladung ohne Wirkung.
  const setUserPassword = useCallback(async (id: string, password: string) => {
    setState(await call<OrgState>(`/users/${id}/password`, {
      method: 'PUT', body: JSON.stringify({ password }),
    }));
  }, [call]);

  // Selbstbedienung auf dem EIGENEN Konto — anders als setUserPassword, das
  // ein Admin auf einem fremden Konto auslöst, gibt es keine :id, und jede
  // Rolle darf es (ein Kellner braucht den Schlüssel für den Bon-Scan).
  const setMyApiKey = useCallback(async (apiKey: string) => {
    const { user } = await call<{ user: AuthUser }>('/account/api-key', {
      method: 'PUT', body: JSON.stringify({ apiKey }),
    });
    setAuthUser(user);
  }, [call]);

  const removeMyApiKey = useCallback(async () => {
    const { user } = await call<{ user: AuthUser }>('/account/api-key', { method: 'DELETE' });
    setAuthUser(user);
  }, [call]);

  const setHiddenWidgets = useCallback(async (ids: string[]) => {
    setState(await call<OrgState>('/settings/dashboard', {
      method: 'PATCH', body: JSON.stringify({ hiddenWidgets: ids }),
    }));
  }, [call]);

  const updateBrand = useCallback(async (partial: Partial<Brand>) => {
    setState(await call<OrgState>('/settings/brand', { method: 'PATCH', body: JSON.stringify(partial) }));
  }, [call]);

  const updateDishImage = useCallback(async (dishId: string, img: string) => {
    setState(await call<OrgState>(`/dishes/${dishId}/image`, { method: 'PATCH', body: JSON.stringify({ img }) }));
  }, [call]);

  const addTables = useCallback(async (branchSlug: string, count: number) => {
    setState(await call<OrgState>(`/branches/${branchSlug}/tables`, { method: 'POST', body: JSON.stringify({ count }) }));
  }, [call]);

  const removeTable = useCallback(async (branchSlug: string, id: string) => {
    setState(await call<OrgState>(`/branches/${branchSlug}/tables/${id}`, { method: 'DELETE' }));
  }, [call]);

  // Menü-, Gutschein- und Filialverwaltung: alle nach demselben Muster —
  // der Server antwortet mit dem vollständigen Zustand, der ihn hier ersetzt.
  // Fehler (z. B. eine Filiale mit Tischen) werden geworfen und von der
  // Oberfläche angezeigt.
  const write = useCallback(async (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => {
    setState(await call<OrgState>(path, {
      method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
  }, [call]);

  const addDish = useCallback((d: DishInput) => write('/dishes', 'POST', d), [write]);
  const updateDish = useCallback((id: string, d: Partial<DishInput>) => write(`/dishes/${id}`, 'PATCH', d), [write]);
  const removeDish = useCallback((id: string) => write(`/dishes/${id}`, 'DELETE'), [write]);

  const addVoucher = useCallback((v: VoucherInput) => write('/vouchers', 'POST', v), [write]);
  const updateVoucher = useCallback((id: string, v: Partial<VoucherInput>) => write(`/vouchers/${id}`, 'PATCH', v), [write]);
  const removeVoucher = useCallback((id: string) => write(`/vouchers/${id}`, 'DELETE'), [write]);

  const addBranch = useCallback((b: BranchInput) => write('/branches', 'POST', b), [write]);
  const updateBranch = useCallback((id: string, b: Partial<BranchInput>) => write(`/branches/${id}`, 'PATCH', b), [write]);
  const removeBranch = useCallback((id: string) => write(`/branches/${id}`, 'DELETE'), [write]);

  // Auswertung und Rückblick ersetzen den Zustand NICHT — sie sind eine Sicht
  // auf dieselben Daten, kein neuer Stand. Deshalb kein setState hier.
  const fetchInsights = useCallback((from: string | null, to: string | null, branchIds?: string[] | null) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (branchIds && branchIds.length > 0) params.set('branches', branchIds.join(','));
    const query = params.toString();
    return call<Insights>(`/insights${query ? `?${query}` : ''}`);
  }, [call]);

  const refreshHighlight = useCallback(async () => {
    const { highlight } = await call<{ highlight: Highlight }>('/insights/highlight', { method: 'POST' });
    return highlight;
  }, [call]);

  const scanReceipt = useCallback(async (branchSlug: string, image: string) => {
    const { items } = await call<{ items: { dishId: string; qty: number }[] }>(
      `/branches/${branchSlug}/scan-receipt`, { method: 'POST', body: JSON.stringify({ image }) }
    );
    return items;
  }, [call]);

  const value = useMemo<StoreApi>(() => ({
    ...withDefaults(state), orgSlug, loading, error, authUser, authLoading, login, googleLogin, logout,
    guestUser, authOptions, guestRegister, guestLogin, guestGoogleLogin,
    guestLogout, deleteGuestAccount, setGuestApiKey, removeGuestApiKey, claimPoints,
    refresh, saveTableOrder, closeTable, addItemToTable, submitReview, fetchReviewText,
    startRedemption, confirmRedemption,
    setDishAvailability,
    resolveAlert, addUser, removeUser, updateUser, setUserPassword, setMyApiKey, removeMyApiKey, setHiddenWidgets, updateBrand, updateDishImage, addTables, removeTable,
    addDish, updateDish, removeDish, addVoucher, updateVoucher, removeVoucher,
    addBranch, updateBranch, removeBranch,
    fetchInsights, refreshHighlight, scanReceipt,
  }), [state, orgSlug, loading, error, authUser, authLoading, login, googleLogin, logout,
    guestUser, authOptions, guestRegister, guestLogin, guestGoogleLogin, guestLogout, deleteGuestAccount, setGuestApiKey, removeGuestApiKey, claimPoints,
    refresh, saveTableOrder, closeTable, addItemToTable, submitReview, fetchReviewText,
    startRedemption, confirmRedemption, setDishAvailability, resolveAlert, addUser, removeUser, updateUser, setUserPassword, setMyApiKey, removeMyApiKey, setHiddenWidgets, updateBrand, updateDishImage, addTables, removeTable, addDish, updateDish, removeDish, addVoucher, updateVoucher, removeVoucher, addBranch, updateBranch, removeBranch,
    fetchInsights, refreshHighlight, scanReceipt]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore muss innerhalb von <StoreProvider> verwendet werden');
  return ctx;
}
