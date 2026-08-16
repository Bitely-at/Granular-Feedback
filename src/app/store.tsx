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
  { id: 'standard', label: 'Standard', desc: 'Bild links, Infos rechts — kompakt und bewährt.' },
  { id: 'kompakt', label: 'Kompakt', desc: 'Kleineres Bild, engere Abstände — mehr Gerichte auf einen Blick.' },
  { id: 'editorial', label: 'Editorial', desc: 'Großes Bild oben, Text darunter — wirkt hochwertiger.' },
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
export interface Branch { id: string; slug: string; name: string; address: string; }

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

export interface TableItem { dishId: string; qty: number; }

export interface TableRow {
  id: string; branchId: string; number: number;
  status: 'frei' | 'offen' | 'abgeschlossen'; items: TableItem[]; openedAt: number | null;
}

export interface Voucher {
  id: string; title: string; points: number; expiry: string; img: string;
  // Wo er gilt; null = ganze Kette.
  branchIds: string[] | null;
}

export interface AdminUser {
  id: string; name: string; email: string; role: 'Admin' | 'Manager' | 'Kellner';
  branchId: string | null; status: 'aktiv' | 'eingeladen' | 'inaktiv';
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
export type BranchInput = Pick<Branch, 'name' | 'address'>;

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

export interface GuestProfile { loggedIn: boolean; points: number; redeemed: string[]; }

interface OrgState {
  brand: Brand | null;
  branches: Branch[];
  dishes: Dish[];
  tables: TableRow[];
  vouchers: Voucher[];
  users: AdminUser[];
  alerts: Alert[];
  reviews: Review[];
  guest: GuestProfile;
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

/** Abgelaufene/ungültige Sitzung, damit die Oberfläche zurück zum Login kann. */
export class UnauthorizedError extends Error {}

async function api<T>(orgSlug: string, path: string, init?: RequestInit): Promise<T> {
  const token = readToken(orgSlug);
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
  logout: () => void;
  refresh: () => Promise<void>;
  // Alle Tisch-Aufrufe tragen die Filiale: die Nummer allein ist mehrdeutig,
  // Tisch 5 gibt es in jeder Filiale einmal.
  saveTableOrder: (branchSlug: string, tableNumber: number, cart: Record<string, number>) => Promise<void>;
  closeTable: (branchSlug: string, tableNumber: number) => Promise<void>;
  addItemToTable: (branchSlug: string, tableNumber: number, dishId: string, qty?: number) => Promise<void>;
  submitReview: (branchSlug: string, tableNumber: number, dishRatings: DishRatingInput[], overall: { service: number; ambience: number; speed: number }) => Promise<number>;
  redeemVoucher: (branchSlug: string, voucherId: string) => Promise<{ ok: boolean; error?: string }>;
  // Gericht in EINER Filiale führen oder nicht — der Hebel der Filialleitung.
  setDishAvailability: (branchSlug: string, dishId: string, active: boolean) => Promise<void>;
  loginGuest: () => Promise<void>;
  resolveAlert: (alertId: string) => Promise<void>;
  addUser: (u: { name: string; email: string; role: AdminUser['role']; branchId: string | null }) => Promise<void>;
  removeUser: (id: string) => Promise<void>;
  updateBrand: (partial: Partial<Brand>) => Promise<void>;
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
}

const StoreContext = createContext<StoreApi | null>(null);

const EMPTY_STATE: OrgState = {
  brand: null, branches: [], dishes: [], tables: [], vouchers: [], users: [], alerts: [], reviews: [],
  guest: { loggedIn: false, points: 0, redeemed: [] },
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

export function StoreProvider({ orgSlug, scope, children }: {
  orgSlug: string; scope: BranchScope; children: ReactNode;
}) {
  const [state, setState] = useState<OrgState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Der Server liefert nur die Daten der angefragten Filiale — die Oberfläche
  // filtert nicht selbst. Ohne bekannte Filiale wird gar nicht erst geladen.
  const refresh = useCallback(async () => {
    if (!scope) return;
    try {
      setError(null);
      // 'self' lässt den Parameter weg — dann leitet der Server die Filiale aus
      // dem Token ab.
      const query = scope === 'self' ? '' : `?branch=${encodeURIComponent(scope)}`;
      const data = await api<OrgState>(orgSlug, `/state${query}`);
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verbindung zum Server fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, scope]);

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
      return await api<T>(orgSlug, path, init);
    } catch (err) {
      if (err instanceof UnauthorizedError) logout();
      throw err;
    }
  }, [orgSlug, logout]);

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
    const data = await call<OrgState & { pointsEarned: number }>(`/branches/${branchSlug}/tables/${tableNumber}/review`, {
      method: 'POST', body: JSON.stringify({ dishRatings, overall }),
    });
    const { pointsEarned, ...rest } = data;
    setState(rest);
    return pointsEarned;
  }, [call]);

  const redeemVoucher = useCallback(async (branchSlug: string, voucherId: string) => {
    try {
      setState(await call<OrgState>(`/branches/${branchSlug}/vouchers/${voucherId}/redeem`, { method: 'POST' }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Einlösen fehlgeschlagen.' };
    }
  }, [call]);

  const setDishAvailability = useCallback(async (branchSlug: string, dishId: string, active: boolean) => {
    setState(await call<OrgState>(`/branches/${branchSlug}/dishes/${dishId}/availability`, {
      method: 'PATCH', body: JSON.stringify({ active }),
    }));
  }, [call]);

  const loginGuest = useCallback(async () => {
    setState(await call<OrgState>('/guest/login', { method: 'POST' }));
  }, [call]);

  const resolveAlert = useCallback(async (alertId: string) => {
    setState(await call<OrgState>(`/alerts/${alertId}/resolve`, { method: 'POST' }));
  }, [call]);

  const addUser = useCallback(async (u: { name: string; email: string; role: AdminUser['role']; branchId: string | null }) => {
    setState(await call<OrgState>('/users', { method: 'POST', body: JSON.stringify(u) }));
  }, [call]);

  const removeUser = useCallback(async (id: string) => {
    setState(await call<OrgState>(`/users/${id}`, { method: 'DELETE' }));
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

  const value = useMemo<StoreApi>(() => ({
    ...state, orgSlug, loading, error, authUser, authLoading, login, logout,
    refresh, saveTableOrder, closeTable, addItemToTable, submitReview, redeemVoucher,
    setDishAvailability,
    loginGuest, resolveAlert, addUser, removeUser, updateBrand, updateDishImage, addTables, removeTable,
    addDish, updateDish, removeDish, addVoucher, updateVoucher, removeVoucher,
    addBranch, updateBranch, removeBranch,
  }), [state, orgSlug, loading, error, authUser, authLoading, login, logout, refresh, saveTableOrder, closeTable, addItemToTable, submitReview, redeemVoucher, setDishAvailability, loginGuest, resolveAlert, addUser, removeUser, updateBrand, updateDishImage, addTables, removeTable, addDish, updateDish, removeDish, addVoucher, updateVoucher, removeVoucher, addBranch, updateBranch, removeBranch]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore muss innerhalb von <StoreProvider> verwendet werden');
  return ctx;
}
