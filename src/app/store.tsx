import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// ═══════════════════════════════════════════════════════════
// TYPES — spiegeln die vom Server serialisierten Dokumente
// (Mongo _id -> id: string). Jede Organisation lebt in einer
// eigenen Datenbank; diese Typen beschreiben den Zustand EINER
// Organisation, wie ihn GET /api/:orgSlug/state liefert.
// ═══════════════════════════════════════════════════════════

export interface Brand { name: string; accent: string; logo: string; }
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

async function api<T>(orgSlug: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${orgSlug}${path}`, {
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
  addItemToTable: (tableNumber: number, dishId: string, qty?: number) => Promise<void>;
  submitReview: (tableNumber: number, dishRatings: DishRatingInput[], overall: { service: number; ambience: number; speed: number }) => Promise<number>;
  redeemVoucher: (voucherId: string) => Promise<{ ok: boolean; error?: string }>;
  loginGuest: () => Promise<void>;
  resolveAlert: (alertId: string) => Promise<void>;
  addUser: (u: { name: string; email: string; role: AdminUser['role']; branchId: string | null }) => Promise<void>;
  removeUser: (id: string) => Promise<void>;
  updateBrand: (partial: Partial<Brand>) => Promise<void>;
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

  const value = useMemo<StoreApi>(() => ({
    ...state, orgSlug, loading, error,
    refresh, saveTableOrder, addItemToTable, submitReview, redeemVoucher,
    loginGuest, resolveAlert, addUser, removeUser, updateBrand,
  }), [state, orgSlug, loading, error, refresh, saveTableOrder, addItemToTable, submitReview, redeemVoucher, loginGuest, resolveAlert, addUser, removeUser, updateBrand]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore muss innerhalb von <StoreProvider> verwendet werden');
  return ctx;
}
