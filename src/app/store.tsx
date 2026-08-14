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
  ratingsSum: number; ratingsCount: number;
}

export interface TableItem { dishId: string; qty: number; }

export interface TableRow {
  id: string; branchId: string; number: number;
  status: 'frei' | 'offen' | 'abgeschlossen'; items: TableItem[]; openedAt: number | null;
}

export interface Voucher { id: string; title: string; points: number; expiry: string; img: string; }

export interface AdminUser {
  id: string; name: string; email: string; role: 'Admin' | 'Manager' | 'Kellner';
  branchId: string | null; status: 'aktiv' | 'eingeladen' | 'inaktiv';
}

export interface DishRatingInput { dishId: string; stars: number; note?: string; }

export interface Alert {
  id: string; tableId: string; tableNumber: number; dishName: string;
  stars: number; note?: string; createdAt: number; resolved: boolean;
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

async function api<T>(orgSlug: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/${orgSlug}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Anfrage fehlgeschlagen (${res.status})`);
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
  refresh: () => Promise<void>;
  saveTableOrder: (tableNumber: number, cart: Record<string, number>) => Promise<void>;
  closeTable: (tableNumber: number) => Promise<void>;
  addItemToTable: (tableNumber: number, dishId: string, qty?: number) => Promise<void>;
  submitReview: (tableNumber: number, dishRatings: DishRatingInput[], overall: { service: number; ambience: number; speed: number }) => Promise<number>;
  redeemVoucher: (voucherId: string) => Promise<{ ok: boolean; error?: string }>;
  loginGuest: () => Promise<void>;
  resolveAlert: (alertId: string) => Promise<void>;
  addUser: (u: { name: string; email: string; role: AdminUser['role']; branchId: string | null }) => Promise<void>;
  removeUser: (id: string) => Promise<void>;
  updateBrand: (partial: Partial<Brand>) => Promise<void>;
  updateDishImage: (dishId: string, img: string) => Promise<void>;
  addTables: (count: number) => Promise<void>;
  removeTable: (id: string) => Promise<void>;
}

const StoreContext = createContext<StoreApi | null>(null);

const EMPTY_STATE: OrgState = {
  brand: null, branches: [], dishes: [], tables: [], vouchers: [], users: [], alerts: [],
  guest: { loggedIn: false, points: 0, redeemed: [] },
};

export function StoreProvider({ orgSlug, children }: { orgSlug: string; children: ReactNode }) {
  const [state, setState] = useState<OrgState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await api<OrgState>(orgSlug, '/state');
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verbindung zum Server fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  const saveTableOrder = useCallback(async (tableNumber: number, cart: Record<string, number>) => {
    const data = await api<OrgState>(orgSlug, `/tables/${tableNumber}/order`, { method: 'POST', body: JSON.stringify({ cart }) });
    setState(data);
  }, [orgSlug]);

  // Der Server antwortet mit dem vollständigen neuen Zustand — die Oberfläche
  // übernimmt ihn direkt, statt lokal zu raten.
  const closeTable = useCallback(async (tableNumber: number) => {
    const data = await api<OrgState>(orgSlug, `/tables/${tableNumber}/close`, { method: 'POST' });
    setState(data);
  }, [orgSlug]);

  const addItemToTable = useCallback(async (tableNumber: number, dishId: string, qty = 1) => {
    const data = await api<OrgState>(orgSlug, `/tables/${tableNumber}/items`, { method: 'POST', body: JSON.stringify({ dishId, qty }) });
    setState(data);
  }, [orgSlug]);

  const submitReview = useCallback(async (
    tableNumber: number, dishRatings: DishRatingInput[], overall: { service: number; ambience: number; speed: number }
  ) => {
    const data = await api<OrgState & { pointsEarned: number }>(orgSlug, `/tables/${tableNumber}/review`, {
      method: 'POST', body: JSON.stringify({ dishRatings, overall }),
    });
    const { pointsEarned, ...rest } = data;
    setState(rest);
    return pointsEarned;
  }, [orgSlug]);

  const redeemVoucher = useCallback(async (voucherId: string) => {
    try {
      const data = await api<OrgState>(orgSlug, `/vouchers/${voucherId}/redeem`, { method: 'POST' });
      setState(data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Einlösen fehlgeschlagen.' };
    }
  }, [orgSlug]);

  const loginGuest = useCallback(async () => {
    const data = await api<OrgState>(orgSlug, '/guest/login', { method: 'POST' });
    setState(data);
  }, [orgSlug]);

  const resolveAlert = useCallback(async (alertId: string) => {
    const data = await api<OrgState>(orgSlug, `/alerts/${alertId}/resolve`, { method: 'POST' });
    setState(data);
  }, [orgSlug]);

  const addUser = useCallback(async (u: { name: string; email: string; role: AdminUser['role']; branchId: string | null }) => {
    const data = await api<OrgState>(orgSlug, '/users', { method: 'POST', body: JSON.stringify(u) });
    setState(data);
  }, [orgSlug]);

  const removeUser = useCallback(async (id: string) => {
    const data = await api<OrgState>(orgSlug, `/users/${id}`, { method: 'DELETE' });
    setState(data);
  }, [orgSlug]);

  const updateBrand = useCallback(async (partial: Partial<Brand>) => {
    const data = await api<OrgState>(orgSlug, '/settings/brand', { method: 'PATCH', body: JSON.stringify(partial) });
    setState(data);
  }, [orgSlug]);

  const updateDishImage = useCallback(async (dishId: string, img: string) => {
    const data = await api<OrgState>(orgSlug, `/dishes/${dishId}/image`, { method: 'PATCH', body: JSON.stringify({ img }) });
    setState(data);
  }, [orgSlug]);

  const addTables = useCallback(async (count: number) => {
    const data = await api<OrgState>(orgSlug, '/tables', { method: 'POST', body: JSON.stringify({ count }) });
    setState(data);
  }, [orgSlug]);

  const removeTable = useCallback(async (id: string) => {
    const data = await api<OrgState>(orgSlug, `/tables/${id}`, { method: 'DELETE' });
    setState(data);
  }, [orgSlug]);

  const value = useMemo<StoreApi>(() => ({
    ...state, orgSlug, loading, error,
    refresh, saveTableOrder, closeTable, addItemToTable, submitReview, redeemVoucher,
    loginGuest, resolveAlert, addUser, removeUser, updateBrand, updateDishImage, addTables, removeTable,
  }), [state, orgSlug, loading, error, refresh, saveTableOrder, closeTable, addItemToTable, submitReview, redeemVoucher, loginGuest, resolveAlert, addUser, removeUser, updateBrand, updateDishImage, addTables, removeTable]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore muss innerhalb von <StoreProvider> verwendet werden');
  return ctx;
}
