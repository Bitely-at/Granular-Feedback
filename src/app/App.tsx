import { useState, useEffect, useRef, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import {
  Star, Search, Camera, Check, ChevronLeft, Plus, Minus, X,
  LayoutDashboard, UtensilsCrossed, Users, Settings,
  MoreHorizontal, Download, QrCode, Pencil, AlertTriangle, TrendingUp,
  TrendingDown, Sun, Moon, Bell, ChevronDown, Clock, CheckCircle2,
  Shield, LogOut, Upload, Palette, MapPin, Zap, BarChart3, RefreshCw,
  Eye, Filter, Trash2, UserPlus, Lock, Building2, ImagePlus,
  AlertOctagon, Loader2, MessageSquare, Ticket,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ReferenceLine, Cell,
} from 'recharts';
import {
  StoreProvider, useStore, dishAvg, sinceLabel, tableItemCount, compressImageFile, isAdminRole,
  BRAND_FONTS, BRAND_CARD_STYLES,
  availableIn,
  type Dish, type TableRow, type Voucher, type AdminUser, type Alert, type DishRatingInput, type Brand,
  type Branch, type BranchScope, type Redemption,
} from './store';
import { LoginScreen } from './components/auth/LoginScreen';
import { SwipeToRedeem } from './components/SwipeToRedeem';

// ═══════════════════════════════════════════════════════════
// DECORATIVE / REFERENCE DATA (kein Mandanten-Bezug)
// ═══════════════════════════════════════════════════════════

const CHART_DATA = [
  { day: 'Mo', avg: 4.1 }, { day: 'Di', avg: 4.3 }, { day: 'Mi', avg: 3.8 },
  { day: 'Do', avg: 4.5 }, { day: 'Fr', avg: 4.2 }, { day: 'Sa', avg: 4.6 }, { day: 'So', avg: 4.4 },
];

const PERMISSIONS = [
  { label: 'Bewertungen einsehen', admin: true, manager: true, waiter: false },
  { label: 'Berichte exportieren', admin: true, manager: true, waiter: false },
  { label: 'Menü bearbeiten', admin: true, manager: true, waiter: false },
  { label: 'Benutzer verwalten', admin: true, manager: false, waiter: false },
  { label: 'Einstellungen ändern', admin: true, manager: false, waiter: false },
  { label: 'Tische verwalten', admin: true, manager: true, waiter: true },
  { label: 'Gutscheine prüfen', admin: true, manager: true, waiter: true },
];

// ═══════════════════════════════════════════════════════════
// DESIGN SYSTEM PRIMITIVES
// ═══════════════════════════════════════════════════════════

function Sk({ h = 16, w = '100%', r = 8 }: { h?: number; w?: string | number; r?: number }) {
  return <div className="animate-pulse bg-gray-200 dark:bg-gray-700" style={{ height: h, width: w, borderRadius: r }} />;
}

function StarRating({ value, onChange, size = 22 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const [hov, setHov] = useState(0);
  const fill = hov || value;
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s} onClick={() => onChange?.(s)}
          onMouseEnter={() => onChange && setHov(s)} onMouseLeave={() => onChange && setHov(0)}
          className={`p-0.5 transition-transform active:scale-90 ${onChange ? 'cursor-pointer' : 'cursor-default'}`}>
          <Star size={size} fill={s <= fill ? 'var(--ba, #16A34A)' : 'none'}
            stroke={s <= fill ? 'var(--ba, #16A34A)' : '#D1D5DB'} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, full = true, sm }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; full?: boolean; sm?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${full ? 'w-full' : ''} ${sm ? 'py-2 px-4 text-[13px]' : 'py-3 px-6 text-[15px]'} rounded-xl font-medium text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed`}
      style={{ backgroundColor: disabled ? '#9CA3AF' : 'var(--ba, #16A34A)' }}>
      {children}
    </button>
  );
}

function SecondaryBtn({ children, onClick, full }: { children: React.ReactNode; onClick?: () => void; full?: boolean }) {
  return (
    <button onClick={onClick}
      className={`${full ? 'w-full' : ''} py-3 px-6 rounded-xl text-[15px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-[0.98]`}>
      {children}
    </button>
  );
}

function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex border-b border-gray-200 dark:border-gray-800">
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)}
          className={`px-4 py-2.5 text-[13px] font-medium transition-colors relative ${active === t ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
          {t}
          {active === t && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: 'var(--ba, #16A34A)' }} />
          )}
        </button>
      ))}
    </div>
  );
}

function SField({ value, onChange, placeholder, large }: { value: string; onChange: (v: string) => void; placeholder: string; large?: boolean }) {
  return (
    <div className="relative">
      <Search size={large ? 20 : 16} strokeWidth={1.5}
        className={`absolute ${large ? 'left-4' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-400`} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full ${large ? 'pl-12 pr-5 py-4 text-[17px]' : 'pl-9 pr-4 py-2.5 text-[15px]'} bg-gray-100 dark:bg-gray-800 rounded-xl outline-none placeholder:text-gray-400 dark:text-white border border-transparent focus:border-gray-300 dark:focus:border-gray-600 transition-colors`} />
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Icon size={26} className="text-gray-400" strokeWidth={1.5} />
      </div>
      <p className="text-[15px] font-semibold text-gray-800 dark:text-gray-200 mb-1">{title}</p>
      <p className="text-[13px] text-gray-500 dark:text-gray-400 max-w-[260px] leading-relaxed">{desc}</p>
    </div>
  );
}

// Erzeugt eine CSV-Datei im Browser und lädt sie herunter — ohne Serverroute
// und ohne zusätzliche Abhängigkeit.
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const s = String(value ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Semikolon als Trenner und ein vorangestelltes BOM: so öffnet Excel im
  // deutschsprachigen Raum die Datei direkt und mit korrekten Umlauten.
  const csv = '﻿' + rows.map(r => r.map(escape).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

function BrandLogo({ brand, size = 40, textSize = 20, rounded = 'rounded-2xl' }: {
  brand: Pick<Brand, 'logo' | 'logoImage'> | null | undefined; size?: number; textSize?: number; rounded?: string;
}) {
  if (brand?.logoImage) {
    return <img src={brand.logoImage} alt="Logo" className={`${rounded} object-cover flex-shrink-0`} style={{ width: size, height: size }} />;
  }
  return (
    <span className="flex-shrink-0 flex items-center justify-center" style={{ width: size, height: size, fontSize: textSize, lineHeight: 1 }}>
      {brand?.logo ?? '🍽️'}
    </span>
  );
}

// Lädt eine kuratierte Google-Schriftart nach, sobald sie gebraucht wird (idempotent).
function useGoogleFont(fontName: string | undefined) {
  useEffect(() => {
    const entry = BRAND_FONTS.find(f => f.name === fontName);
    if (!entry) return;
    const id = `bitely-font-${entry.name.replace(/\s+/g, '-')}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${entry.googleFamily}&display=swap`;
    document.head.appendChild(link);
  }, [fontName]);
}

function FullScreenMessage({ children, error, action }: { children: React.ReactNode; error?: boolean; action?: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F7F8FA] dark:bg-[#0D1117] p-8 text-center">
      {error ? (
        <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950 flex items-center justify-center">
          <AlertOctagon size={24} className="text-red-500" strokeWidth={1.5} />
        </div>
      ) : (
        <Loader2 size={24} className="animate-spin text-gray-400" />
      )}
      <p className="text-[14px] text-gray-600 dark:text-gray-300 max-w-sm leading-relaxed">{children}</p>
      {action}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GERICHTE-BEWERTUNGSKARTE — drei Layout-Varianten (Design-Studio),
// gemeinsam genutzt vom echten Gast-Flow und der Live-Vorschau im Admin.
// ═══════════════════════════════════════════════════════════

function DishRatingCard({ dish, stars, note, expanded, cardStyle = 'standard', onRate, onToggleExpand, onNoteChange }: {
  dish: Dish; stars: number; note: string; expanded: boolean; cardStyle?: NonNullable<Brand['cardStyle']>;
  onRate: (v: number) => void; onToggleExpand: () => void; onNoteChange: (v: string) => void;
}) {
  const notesBlock = (
    <AnimatePresence>
      {expanded && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
          <div className="px-4 pb-4">
            <textarea rows={2} value={note} onChange={e => onNoteChange(e.target.value)}
              placeholder={stars > 0 && stars <= 3 ? 'Was war nicht gut? (optional)' : 'Anmerkung hinzufügen… (optional)'}
              className="w-full text-[13px] text-gray-700 dark:text-gray-200 placeholder:text-gray-400 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 outline-none resize-none focus:border-gray-400 transition-colors" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (cardStyle === 'editorial') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <img src={dish.img} alt={dish.name} className="w-full h-32 object-cover" />
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="text-[16px] font-semibold text-gray-900 dark:text-white">{dish.name}</p>
              <p className="text-[12px] text-gray-400">{dish.price.toFixed(2)} €</p>
            </div>
            <button onClick={onToggleExpand} className="p-1.5 -mt-1 -mr-1 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 transition-colors flex-shrink-0">
              <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <StarRating value={stars} onChange={onRate} size={26} />
        </div>
        {notesBlock}
      </div>
    );
  }

  if (cardStyle === 'kompakt') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 p-2.5">
          <img src={dish.img} alt={dish.name} className="w-11 h-11 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-gray-900 dark:text-white leading-tight truncate">{dish.name}</p>
            <StarRating value={stars} onChange={onRate} size={18} />
          </div>
          <button onClick={onToggleExpand} className="p-1 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 transition-colors flex-shrink-0">
            <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {notesBlock}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex gap-3 p-4">
        <img src={dish.img} alt={dish.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-gray-900 dark:text-white">{dish.name}</p>
          <p className="text-[12px] text-gray-400 mb-2">{dish.price.toFixed(2)} €</p>
          <StarRating value={stars} onChange={onRate} size={24} />
        </div>
        <button onClick={onToggleExpand} className="self-start p-1.5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 transition-colors">
          <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {notesBlock}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GUEST APP
// ═══════════════════════════════════════════════════════════

type GuestScreen = 'welcome' | 'review' | 'overall' | 'thanks' | 'vouchers';

function GuestApp({ branch, tableNumber }: { branch: Branch; tableNumber: number }) {
  const store = useStore();
  const [screen, setScreen] = useState<GuestScreen>('welcome');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [overall, setOverall] = useState({ service: 0, ambience: 0, speed: 0 });
  const [showSheet, setShowSheet] = useState(false);
  const [sheetTab, setSheetTab] = useState('Speisen');
  const [sheetQ, setSheetQ] = useState('');
  const [vTab, setVTab] = useState('Verfügbar');
  const [pts, setPts] = useState(0);
  const [earnedPts, setEarnedPts] = useState(0);
  // Was ohne Konto liegengeblieben ist (0, wenn angemeldet).
  const [missedPts, setMissedPts] = useState(0);
  // Anmeldung/Registrierung als Gast — von mehreren Stellen aus zu öffnen.
  const [authOpen, setAuthOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Nur Tische DIESER Filiale: die Nummer allein trifft seit T-2 in jeder
  // Filiale einen anderen Tisch.
  const table = store.tables.find(t => t.branchId === branch.id && t.number === tableNumber);
  const tableDishes = (table?.items ?? [])
    .map(i => store.dishes.find(d => d.id === i.dishId))
    .filter((d): d is Dish => Boolean(d));

  const ratedCount = tableDishes.filter(d => (ratings[d.id] ?? 0) > 0).length;
  const allRated = tableDishes.length > 0 && ratedCount >= tableDishes.length;
  const allOverall = Object.values(overall).every(v => v > 0);

  useEffect(() => {
    if (screen === 'thanks' && earnedPts > 0) {
      let n = 0;
      const step = Math.max(1, Math.round(earnedPts / 30));
      const iv = setInterval(() => {
        n += step;
        if (n >= earnedPts) { setPts(earnedPts); clearInterval(iv); } else setPts(n);
      }, 18);
      return () => clearInterval(iv);
    }
  }, [screen, earnedPts]);

  const go = (s: GuestScreen) => setScreen(s);

  const handleSubmitReview = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const dishRatings: DishRatingInput[] = tableDishes.map(d => ({
        dishId: d.id, stars: ratings[d.id] ?? 0, note: notes[d.id]?.trim() || undefined,
      }));
      const { earned, possible } = await store.submitReview(branch.slug, tableNumber, dishRatings, overall);
      setEarnedPts(earned);
      // Ohne Konto ist earned 0 — dann zeigt der Dank-Bildschirm, was mit einem
      // Konto drin gewesen wäre, statt die Punkte stillschweigend zu verschlucken.
      setMissedPts(earned === 0 ? possible : 0);
      setPts(0);
      go('thanks');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Absenden fehlgeschlagen. Bitte versuch es erneut.');
    } finally {
      setSubmitting(false);
    }
  };

  // Einlösen läuft über den Wisch-Bildschirm — von hier aus wird er nur geöffnet.
  const [redeeming, setRedeeming] = useState<Voucher | null>(null);

  const redeemedIds = store.guest.redeemed;
  const notRedeemed = store.vouchers.filter(v => !redeemedIds.includes(v.id));
  const unlockedVouchers = notRedeemed.filter(v => store.guest.points >= v.points);
  const lockedVouchers = notRedeemed.filter(v => store.guest.points < v.points);
  const redeemedVouchers = store.vouchers.filter(v => redeemedIds.includes(v.id));
  const nextRewardPoints = notRedeemed.length > 0 ? Math.min(...notRedeemed.map(v => v.points)) : 300;

  if (!table) {
    return (
      <FullScreenMessage error>
        Tisch {tableNumber} gibt es in der Filiale {branch.name} nicht. Bitte scanne den QR-Code am Tisch erneut.
      </FullScreenMessage>
    );
  }

  // Auf dem Willkommensbildschirm trägt der Einleitungstext selbst die
  // Information, ob es etwas zu bewerten gibt — dafür braucht es keine eigene
  // Leerzustands-Box, die den Hero-Aufbau sprengen würde.
  const welcomeText = tableDishes.length > 0
    ? 'In unter 30 Sekunden erledigt — teile dein Feedback und sichere dir Treuepunkte.'
    : 'Für diesen Tisch liegt gerade keine offene Bestellung vor. Sobald dein Service-Team Gerichte einträgt, kannst du sie hier einzeln bewerten.';

  return (
    <div className="relative flex flex-col flex-1 min-h-0 bg-[#F7F8FA] dark:bg-[#0D1117]">

      {screen === 'welcome' && (
          <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex-1 min-h-0 bg-white dark:bg-gray-900">
            {/* Scrollen übernimmt dieser Container, das Verteilen der innere mit
                min-h-full. "flex-1 + justify-center" direkt im Scroll-Container
                zentriert über beide Ränder hinaus, sobald der Inhalt höher wird
                als der Bildschirm: man scrollt durch Leerraum und kommt an den
                oberen Teil nicht mehr heran. */}
            <div className="h-full overflow-y-auto">
              <div className="min-h-full flex flex-col px-6">
                {/* Hero — wächst und hält seinen Inhalt mittig */}
                <div className="flex-1 flex flex-col items-center justify-center text-center pt-10">
                  <div className="mb-6">
                    <BrandLogo brand={store.brand} size={64} textSize={60} rounded="rounded-2xl" />
                  </div>
                  <p className="text-[26px] font-bold text-gray-900 dark:text-white leading-tight">{store.brand?.name}</p>
                  {/* Die Tischnummer steht bewusst klein hier: der Gast sitzt
                      bereits am Tisch und muss sie nur kurz gegenprüfen, falls
                      er den falschen QR-Code erwischt hat. */}
                  <p className="text-[15px] text-gray-500 dark:text-gray-400 mt-1">
                    {branch.name} · Tisch {tableNumber}
                  </p>
                  <p className="text-[16px] text-gray-600 dark:text-gray-300 max-w-[280px] mt-5 leading-relaxed">
                    {welcomeText}
                  </p>
                </div>
                {/* Fuß — bleibt unten, ohne den Hero zu stauchen */}
                <div className="w-full max-w-sm mx-auto pt-4 pb-10 flex-shrink-0">
                  {tableDishes.length > 0 && <PrimaryBtn onClick={() => go('review')}>Feedback geben</PrimaryBtn>}
                  {!store.guest.loggedIn && (
                    <button onClick={() => setAuthOpen(true)}
                      className="w-full text-[15px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 py-3 transition-colors">
                      Anmelden, um Punkte zu sichern
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
      )}

      {screen === 'review' && (
        <motion.div key="review" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col flex-1 min-h-0">
          <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
            <div className="flex items-center gap-2 px-4 py-3">
              <button onClick={() => go('welcome')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <ChevronLeft size={20} strokeWidth={1.5} className="text-gray-600 dark:text-gray-300" />
              </button>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Deine Gerichte</p>
                <p className="text-[12px] text-gray-400">Tisch {tableNumber} · {store.brand?.name}</p>
              </div>
              <span className="text-[13px] text-gray-400">{ratedCount}/{tableDishes.length}</span>
            </div>
            <div className="h-0.5 bg-gray-100 dark:bg-gray-800">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${tableDishes.length ? (ratedCount / tableDishes.length) * 100 : 0}%`, backgroundColor: 'var(--ba, #16A34A)' }} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {tableDishes.map(dish => (
              <DishRatingCard key={dish.id} dish={dish} stars={ratings[dish.id] || 0} note={notes[dish.id] ?? ''}
                expanded={expanded.has(dish.id)} cardStyle={store.brand?.cardStyle ?? 'standard'}
                onRate={v => {
                  setRatings(p => ({ ...p, [dish.id]: v }));
                  if (v > 0 && v <= 3) setExpanded(p => new Set(p).add(dish.id));
                }}
                onToggleExpand={() => setExpanded(p => { const n = new Set(p); n.has(dish.id) ? n.delete(dish.id) : n.add(dish.id); return n; })}
                onNoteChange={v => setNotes(p => ({ ...p, [dish.id]: v }))} />
            ))}
            <button onClick={() => setShowSheet(true)}
              className="w-full py-3.5 text-[13px] text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 transition-colors flex items-center justify-center gap-2">
              <Plus size={14} strokeWidth={2} /> Etwas vergessen?
            </button>
          </div>
          <div className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 p-4">
            <PrimaryBtn onClick={() => go('overall')} disabled={!allRated}>Weiter →</PrimaryBtn>
          </div>
        </motion.div>
      )}

      {screen === 'overall' && (
        <motion.div key="overall" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col flex-1 min-h-0">
          <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
            <div className="flex items-center gap-2 px-4 py-3">
              <button onClick={() => go('review')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <ChevronLeft size={20} strokeWidth={1.5} className="text-gray-600 dark:text-gray-300" />
              </button>
              <div>
                <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Gesamteindruck</p>
                <p className="text-[12px] text-gray-400">Schritt 2 von 2</p>
              </div>
            </div>
            <div className="h-0.5 bg-gray-100 dark:bg-gray-800">
              <div className="h-full rounded-full" style={{ width: '66%', backgroundColor: 'var(--ba, #16A34A)' }} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {([
              { key: 'service', label: 'Service', emoji: '🤝' },
              { key: 'ambience', label: 'Ambiente', emoji: '✨' },
              { key: 'speed', label: 'Schnelligkeit', emoji: '⚡' },
            ] as const).map(({ key, label, emoji }) => (
              <div key={key} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{emoji}</span>
                    <p className="text-[15px] font-medium text-gray-900 dark:text-white">{label}</p>
                  </div>
                  <span className="text-[12px] text-gray-400">{overall[key] > 0 ? `${overall[key]}/5` : 'Nicht bewertet'}</span>
                </div>
                <StarRating value={overall[key]} onChange={v => setOverall(p => ({ ...p, [key]: v }))} size={30} />
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 p-4 space-y-2">
            <p className="text-[11px] text-gray-400 text-center">Deinen Gutschein bekommst du unabhängig von deiner Bewertung.</p>
            {submitError && <p className="text-[12px] text-red-500 text-center">{submitError}</p>}
            <PrimaryBtn onClick={handleSubmitReview} disabled={!allOverall || submitting}>
              {submitting ? 'Wird gesendet…' : 'Absenden & Punkte sichern'}
            </PrimaryBtn>
          </div>
        </motion.div>
      )}

      {screen === 'thanks' && (
        <motion.div key="thanks" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                <Check size={28} strokeWidth={2.5} className="text-white" />
              </motion.div>
              <p className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Vielen Dank!</p>
              <p className="text-[13px] text-gray-500 dark:text-gray-400">Dein Feedback hilft uns, noch besser zu werden.</p>
              {/* Ohne Konto gibt es keine Punkte — das gehört hierher gesagt,
                  und zwar mit dem Betrag, um den es geht. */}
              {missedPts > 0 ? (
                <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700 space-y-3">
                  <p className="text-[13px] text-gray-600 dark:text-gray-300 leading-relaxed">
                    Deine Bewertung ist angekommen. <strong>{missedPts} Punkte</strong> warten
                    auf ein Konto — ohne Anmeldung können wir sie niemandem gutschreiben.
                  </p>
                  <PrimaryBtn onClick={() => setAuthOpen(true)}>Anmelden und Punkte sichern</PrimaryBtn>
                </div>
              ) : (
              <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700">
                <p className="text-[12px] text-gray-400 mb-1">Verdiente Punkte</p>
                <p className="text-4xl font-bold mb-3" style={{ color: 'var(--ba, #16A34A)' }}>+{pts}</p>
                <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden mb-2">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (store.guest.points / nextRewardPoints) * 100)}%` }} transition={{ delay: 0.6, duration: 1.2 }}
                    className="h-full rounded-full" style={{ backgroundColor: 'var(--ba, #16A34A)' }} />
                </div>
                <div className="flex justify-between text-[11px] text-gray-400">
                  <span>{store.guest.points} Pkt. insgesamt</span><span>{nextRewardPoints} Pkt. = nächste Belohnung</span>
                </div>
              </div>
              )}
            </div>
            {!store.guest.loggedIn ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={15} strokeWidth={1.5} style={{ color: 'var(--ba)' }} />
                    <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Punkte sichern</p>
                  </div>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400">Melde dich an, um deine Punkte dauerhaft zu speichern.</p>
                </div>
                <PrimaryBtn onClick={() => setAuthOpen(true)}>Anmelden oder Konto anlegen</PrimaryBtn>
                <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                  Ohne Konto kannst du weiterhin alles bewerten — die Punkte dafür
                  werden aber nirgends gutgeschrieben.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] font-semibold text-gray-600 dark:text-gray-300 px-1">Deine Gutscheine</p>
                {unlockedVouchers.length === 0 ? (
                  <p className="text-[13px] text-gray-400 px-1">Noch kein Gutschein freigeschaltet — {nextRewardPoints - store.guest.points} Punkte fehlen.</p>
                ) : unlockedVouchers.map(v => (
                  <VoucherCard key={v.id} v={v} state="available" onAction={() => go('vouchers')} />
                ))}
                <button onClick={() => go('vouchers')} className="w-full text-[13px] py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Alle Gutscheine →</button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {screen === 'vouchers' && (
        <motion.div key="vouchers" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col flex-1 min-h-0">
          <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
            <div className="flex items-center gap-2 px-4 py-3">
              <button onClick={() => go('thanks')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <ChevronLeft size={20} strokeWidth={1.5} className="text-gray-600 dark:text-gray-300" />
              </button>
              <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Deine Gutscheine</p>
              <span className="ml-auto text-[13px] font-semibold" style={{ color: 'var(--ba)' }}>{store.guest.points} Pkt.</span>
            </div>
            <div className="px-4 pb-3"><TabBar tabs={['Verfügbar', 'Gesperrt', 'Eingelöst']} active={vTab} onChange={setVTab} /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Ohne Konto ist hier nichts zu holen: einlösen setzt eines voraus,
                weil die Punkte einem Konto gehören. Das gehört an den Anfang
                der Liste, nicht erst in die Fehlermeldung nach dem Wischen. */}
            {!store.guest.loggedIn ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-3 text-center">
                <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Gutscheine brauchen ein Konto</p>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  Punkte sammeln und einlösen geht nur mit Anmeldung — sonst wüssten
                  wir nicht, wem die Punkte gehören.
                </p>
                <PrimaryBtn onClick={() => setAuthOpen(true)}>Anmelden oder Konto anlegen</PrimaryBtn>
              </div>
            ) : (
              <div className="flex items-center justify-between px-1 pb-1">
                <p className="text-[12px] text-gray-400 truncate">
                  Angemeldet als <span className="text-gray-600 dark:text-gray-300">{store.guest.name ?? store.guest.email}</span>
                </p>
                <button onClick={() => store.guestLogout()} className="text-[12px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0">
                  Abmelden
                </button>
              </div>
            )}

            {vTab === 'Verfügbar' && (unlockedVouchers.length === 0
              ? <EmptyState icon={Zap} title="Noch nichts verfügbar" desc="Sammle weiter Punkte durch Bewertungen — dein nächster Gutschein wartet." />
              : unlockedVouchers.map(v => <VoucherCard key={v.id} v={v} state="available" onAction={() => setRedeeming(v)} />))}
            {vTab === 'Gesperrt' && lockedVouchers.map(v => <VoucherCard key={v.id} v={v} state="locked" pointsMissing={v.points - store.guest.points} />)}
            {vTab === 'Eingelöst' && (redeemedVouchers.length === 0
              ? <EmptyState icon={CheckCircle2} title="Noch nichts eingelöst" desc="Eingelöste Gutscheine erscheinen hier." />
              : redeemedVouchers.map(v => <VoucherCard key={v.id} v={v} state="redeemed" />))}
          </div>
        </motion.div>
      )}

      {/* GUTSCHEIN EINLÖSEN — wischen, Countdown, Quittung durch die Servicekraft */}
      <AnimatePresence>
        {redeeming && (
          <RedemptionSheet branch={branch} voucher={redeeming} tableNumber={tableNumber}
            onClose={() => setRedeeming(null)} />
        )}
      </AnimatePresence>

      {/* GASTKONTO — anmelden oder anlegen. Punkte hängen daran. */}
      <AnimatePresence>
        {authOpen && <GuestAuthSheet onClose={() => setAuthOpen(false)} />}
      </AnimatePresence>

      {/* BOTTOM SHEET */}
      <AnimatePresence>
        {showSheet && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSheet(false)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl z-50 max-h-[80vh] flex flex-col"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
              <div className="p-4 pb-0">
                <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-4" />
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Gericht hinzufügen</p>
                  <button onClick={() => setShowSheet(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                    <X size={16} className="text-gray-500" />
                  </button>
                </div>
                <SField value={sheetQ} onChange={setSheetQ} placeholder="Gericht suchen…" />
                <div className="mt-3"><TabBar tabs={['Speisen', 'Getränke']} active={sheetTab} onChange={setSheetTab} /></div>
              </div>
              <div className="overflow-y-auto p-4 pt-3 space-y-1">
                {store.dishes.filter(d => d.cat === sheetTab && (sheetQ === '' || d.name.toLowerCase().includes(sheetQ.toLowerCase()))).map(dish => (
                  <div key={dish.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
                    <img src={dish.img} alt={dish.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
                    <div className="flex-1">
                      <p className="text-[14px] font-medium text-gray-900 dark:text-white">{dish.name}</p>
                      <p className="text-[12px] text-gray-400">{dish.price.toFixed(2)} €</p>
                    </div>
                    <button onClick={async () => { await store.addItemToTable(branch.slug, tableNumber, dish.id, 1); setShowSheet(false); }}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                      <Plus size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function VoucherCard({ v, state, onAction, pointsMissing }: {
  v: Voucher; state: 'available' | 'locked' | 'redeemed'; onAction?: () => void; pointsMissing?: number;
}) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden ${state !== 'available' ? 'opacity-70' : ''}`}>
      <div className="h-28 relative">
        <img src={v.img} alt={v.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        {state === 'locked' && <div className="absolute inset-0 flex items-center justify-center"><div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"><Lock size={18} className="text-white" strokeWidth={1.5} /></div></div>}
        {state === 'redeemed' && <div className="absolute inset-0 flex items-center justify-center"><div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"><CheckCircle2 size={18} className="text-white" strokeWidth={1.5} /></div></div>}
        <span className="absolute bottom-2 right-3 text-[11px] text-white/80 bg-black/30 px-2 py-0.5 rounded-full">bis {v.expiry}</span>
      </div>
      <div className="p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-gray-900 dark:text-white">{v.title}</p>
          <p className="text-[12px] text-gray-400">{v.points} Punkte</p>
        </div>
        {state === 'locked' && <span className="text-[12px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-lg whitespace-nowrap">noch {pointsMissing} Pkt.</span>}
        {state === 'redeemed' && <span className="text-[12px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-lg whitespace-nowrap">Eingelöst</span>}
        {state === 'available' && <button onClick={onAction} className="text-[13px] font-medium px-4 py-2 rounded-xl text-white whitespace-nowrap" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>Einlösen</button>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// WAITER APP
// ═══════════════════════════════════════════════════════════

type WaiterScreen = 'tables' | 'detail' | 'photo';

function WaiterApp({ branch }: { branch: Branch }) {
  const store = useStore();
  const [screen, setScreen] = useState<WaiterScreen>('tables');
  // Nur die Nummer festhalten, nicht den Tisch selbst: der Tisch wird bei jedem
  // Render frisch aus dem Server-Zustand gelesen. Eine Kopie im lokalen State
  // würde nach dem Speichern weiter die alten Positionen anzeigen.
  const [activeTableNumber, setActiveTableNumber] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('Speisen');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [confirm, setConfirm] = useState<null | 'save' | 'close'>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [photoStep, setPhotoStep] = useState<'scan' | 'confirm'>('scan');
  const [chips, setChips] = useState(['Spicy Tuna Roll', 'Miso Suppe', 'Asahi Bier']);
  const cartTotal = Object.values(cart).reduce((a, b) => a + b, 0);

  // Alles in dieser Ansicht bezieht sich auf GENAU eine Filiale — sonst träfe
  // eine Tischnummer mehrere Tische.
  const branchTables = store.tables.filter(t => t.branchId === branch.id);

  const activeTable = activeTableNumber == null
    ? null
    : branchTables.find(t => t.number === activeTableNumber) ?? null;

  // Zwei Zustände, und der eine ist der, der Arbeit bedeutet: eine Bestellung
  // liegt an, deren Bewertung noch aussteht. Der wird farbig hervorgehoben,
  // der freie Tisch bleibt ruhig.
  const statusCls: Record<TableRow['status'], string> = {
    frei: 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500',
    offen: 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300',
  };

  const openAlerts = store.alerts.filter(a => !a.resolved && a.branchId === branch.id);
  const openRedemptions = store.redemptions.filter(r => r.status === 'offen');

  // Laufende Einlösungen sind sekundenaktuell relevant — solange eine offen ist,
  // regelmäßig nachladen, damit sie erscheint, ohne dass jemand neu lädt.
  useEffect(() => {
    const iv = setInterval(() => { store.refresh(); }, openRedemptions.length > 0 ? 3000 : 12000);
    return () => clearInterval(iv);
  }, [openRedemptions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTableByNumber = (number: number) => {
    const t = branchTables.find(x => x.number === number);
    if (t) { setActiveTableNumber(t.number); setScreen('detail'); }
  };

  // Bestellung buchen: Gerichte aus dem Warenkorb auf den Tisch schreiben.
  const handleSaveOrder = async () => {
    if (!activeTable || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      await store.saveTableOrder(branch.slug, activeTable.number, cart);
      setConfirm(null);
      setCart({});
      setScreen('tables');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Bestellung konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  // Tisch schließen: laufende Bestellung abräumen, Tisch wieder freigeben.
  const handleCloseTable = async () => {
    if (!activeTable || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      await store.closeTable(branch.slug, activeTable.number);
      setConfirm(null);
      setCart({});
      setScreen('tables');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Tisch konnte nicht geschlossen werden.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePhotoScan = async () => {
    if (activeTable) {
      const matches = chips
        .map(name => store.dishes.find(d => d.name === name)?.id)
        .filter((id): id is string => Boolean(id));
      try {
        for (const id of matches) await store.addItemToTable(branch.slug, activeTable.number, id, 1);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Erkannte Gerichte konnten nicht gespeichert werden.');
        return;
      }
    }
    setScreen(activeTable ? 'detail' : 'tables');
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0D1117] flex flex-col">
      <AnimatePresence>
        {openAlerts.map(a => (
          <motion.div key={a.id} initial={{ y: -56 }} animate={{ y: 0 }} exit={{ y: -56 }}
            className="bg-amber-100 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-900 px-5 py-2.5 flex items-center gap-3 z-40 relative">
            <AlertTriangle size={16} className="text-amber-700 dark:text-amber-400 flex-shrink-0" />
            <p className="text-[13px] text-amber-900 dark:text-amber-200 flex-1">
              Tisch {a.tableNumber} · {a.dishName} · {a.stars}★{a.note ? ` · „${a.note}"` : ''}
            </p>
            <button onClick={() => openTableByNumber(a.tableNumber)} className="text-amber-800 dark:text-amber-300 text-[12px] font-medium underline">Ansehen</button>
            <button onClick={() => store.resolveAlert(a.id)} className="text-amber-800 dark:text-amber-300 text-[12px] font-medium underline">Erledigt</button>
          </motion.div>
        ))}

        {/* Laufende Gutschein-Einlösungen. Hier — in der Kellner-App — wird
            quittiert, nicht auf dem Display des Gastes. Genau deshalb bringt
            ein Screenshot dem Gast nichts. */}
        {openRedemptions.map(r => (
          <RedemptionBanner key={r.id} redemption={r} branch={branch} />
        ))}
      </AnimatePresence>

      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-20">
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 h-14">
          {screen !== 'tables' && (
            <button onClick={() => { setScreen('tables'); setConfirm(null); setActionError(null); }} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
              <ChevronLeft size={20} strokeWidth={1.5} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}
          <span className="flex items-center gap-2 text-[15px] sm:text-[17px] font-semibold text-gray-900 dark:text-white truncate min-w-0">
            <BrandLogo brand={store.brand} size={22} textSize={16} rounded="rounded-md" />
            <span className="truncate">{store.brand?.name}</span>
          </span>
          <span className="hidden md:inline text-[14px] text-gray-400 flex-shrink-0">· {branch.name}</span>
          {activeTable && screen === 'detail' && <span className="hidden sm:inline text-[15px] text-gray-400 flex-shrink-0">· Tisch {activeTable.number}</span>}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button onClick={() => { setScreen('photo'); setPhotoStep('scan'); }}
              className="flex items-center gap-1.5 text-[13px] px-2 sm:px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <Camera size={13} strokeWidth={1.5} /> <span className="hidden sm:inline">Foto-Scan</span>
            </button>
          </div>
        </div>
      </header>

      {screen === 'tables' && (
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
            <div>
              <p className="text-[18px] font-semibold text-gray-900 dark:text-white">Tischübersicht</p>
              <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
                {branch.name} · {branchTables.length} {branchTables.length === 1 ? 'Tisch' : 'Tische'}
              </p>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 text-[12px] sm:text-[13px] text-gray-500">
              {([['bg-gray-300', 'Frei'], ['bg-amber-400', 'Bewertung offen']] as const).map(([cls, l]) => (
                <span key={l} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${cls}`} />{l}</span>
              ))}
            </div>
          </div>
          {branchTables.length === 0 && (
            <EmptyState icon={LayoutDashboard} title="Noch keine Tische"
              desc={`Für ${branch.name} ist noch kein Tisch angelegt. Das macht der Admin unter "Tische & QR-Codes".`} />
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
            {[...branchTables].sort((a, b) => a.number - b.number).map(t => (
              <button key={t.id} onClick={() => { setActiveTableNumber(t.number); setScreen('detail'); }}
                className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center p-3 transition-all hover:scale-105 active:scale-95 relative ${statusCls[t.status]}`}>
                {openAlerts.some(a => a.tableNumber === t.number) && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-amber-500" />
                )}
                <span className="text-2xl font-bold">{t.number}</span>
                <span className="text-[10px] font-semibold mt-0.5 uppercase tracking-wide opacity-70">
                  {t.status === 'frei' ? 'Frei' : 'Bewertung offen'}
                </span>
                {t.status !== 'frei' && (
                  <>
                    <span className="text-[11px] mt-0.5">{tableItemCount(t)} Ger.</span>
                    <span className="text-[11px] opacity-60 flex items-center gap-0.5"><Clock size={9} />{sinceLabel(t)}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === 'detail' && activeTable && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Am Handy bekommt die Gerichteliste den ganzen Rest; der Warenkorb
              darunter wächst nur so weit, wie er Inhalt hat (max. 45 % Höhe). */}
          <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 md:pr-3 overflow-hidden">
            <div className="mb-4"><SField value={search} onChange={setSearch} placeholder="Gericht oder Getränk suchen…" large /></div>
            <div className="mb-4"><TabBar tabs={['Speisen', 'Getränke', 'Favoriten']} active={tab} onChange={setTab} /></div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {tab === 'Favoriten' ? (
                <EmptyState icon={Star} title="Noch keine Favoriten" desc="Tippe auf ★ bei einem Gericht, um es hier zu speichern." />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {store.dishes.filter(d => d.cat === tab && (search === '' || d.name.toLowerCase().includes(search.toLowerCase()))).map(dish => (
                    <button key={dish.id} onClick={() => setCart(p => ({ ...p, [dish.id]: (p[dish.id] || 0) + 1 }))}
                      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-3 text-left relative hover:border-gray-300 dark:hover:border-gray-600 transition-all active:scale-95 shadow-sm">
                      {(cart[dish.id] || 0) > 0 && (
                        <span className="absolute top-2 right-2 w-6 h-6 rounded-full text-white text-[12px] font-bold flex items-center justify-center" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                          {cart[dish.id]}
                        </span>
                      )}
                      <img src={dish.img} alt={dish.name} className="w-full h-20 object-cover rounded-xl mb-2.5 bg-gray-100" />
                      <p className="text-[13px] font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug">{dish.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{dish.price.toFixed(2)} €</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex-none max-h-[45vh] md:max-h-none md:w-72 min-h-0 bg-white dark:bg-gray-900 border-t md:border-t-0 md:border-l border-gray-100 dark:border-gray-800 flex flex-col flex-shrink-0">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between md:block">
              <div>
                <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Tisch {activeTable.number}</p>
                <p className="text-[13px] text-gray-400">{cartTotal > 0 ? `${cartTotal} Gerichte` : 'Noch leer'}</p>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
              {activeTable.items.length > 0 && (
                <div className="pb-2 mb-2 border-b border-gray-50 dark:border-gray-800">
                  <p className="text-[11px] text-gray-400 px-1 pb-1.5">Bereits bestellt</p>
                  {activeTable.items.map(i => {
                    const dish = store.dishes.find(d => d.id === i.dishId);
                    if (!dish) return null;
                    return (
                      <div key={i.dishId} className="flex items-center gap-2.5 py-1.5">
                        <img src={dish.img} alt={dish.name} className="w-7 h-7 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                        <p className="text-[12px] text-gray-500 dark:text-gray-400 flex-1 line-clamp-1">{dish.name}</p>
                        <span className="text-[12px] text-gray-400">×{i.qty}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {cartTotal === 0 ? (
                <p className="text-[13px] text-gray-400 text-center py-10">Wähle Gerichte aus der Liste</p>
              ) : (
                Object.entries(cart).filter(([, q]) => q > 0).map(([dishId, qty]) => {
                  const dish = store.dishes.find(d => d.id === dishId);
                  if (!dish) return null;
                  return (
                    <div key={dishId} className="flex items-center gap-2.5 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                      <img src={dish.img} alt={dish.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                      <p className="text-[13px] text-gray-700 dark:text-gray-300 flex-1 line-clamp-2 leading-snug">{dish.name}</p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => setCart(p => ({ ...p, [dishId]: Math.max(0, p[dishId] - 1) }))}
                          className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <Minus size={10} strokeWidth={2} className="text-gray-600 dark:text-gray-400" />
                        </button>
                        <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 w-4 text-center">{qty}</span>
                        <button onClick={() => setCart(p => ({ ...p, [dishId]: p[dishId] + 1 }))}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                          <Plus size={10} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {/* Zwei getrennte Aktionen: Buchen braucht einen gefüllten Warenkorb,
                Schließen nicht — vorher war beides derselbe Button. */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
              {actionError && (
                <p className="text-[12px] text-red-600 dark:text-red-400 text-center leading-snug px-1">{actionError}</p>
              )}
              <div className="flex gap-2 md:flex-col">
                <button onClick={() => setConfirm('save')} disabled={cartTotal === 0 || saving}
                  className="flex-1 py-3.5 rounded-xl text-[14px] font-medium text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                  <span className="md:hidden">Speichern</span>
                  <span className="hidden md:inline">Bestellung speichern</span>
                </button>
                <button onClick={() => setConfirm('close')}
                  disabled={saving || (activeTable.status === 'frei' && activeTable.items.length === 0)}
                  className="flex-1 py-3.5 rounded-xl text-[14px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <span className="md:hidden">Schließen</span>
                  <span className="hidden md:inline">Tisch schließen</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {screen === 'photo' && (
        <div className="flex-1 overflow-y-auto">
          {/* Gleiches Muster wie im Gast-Willkommensbildschirm: zentriert wird
              innen mit min-h-full, gescrollt außen. */}
          <div className="min-h-full flex items-center justify-center p-4 sm:p-10">
          {photoStep === 'scan' ? (
            <div className="w-full max-w-lg space-y-5">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">Bon fotografieren</p>
                <p className="text-[15px] text-gray-500 mt-1">Fotografiere den POS-Bon — Gerichte werden automatisch erkannt.</p>
              </div>
              <div className="bg-gray-900 rounded-2xl overflow-hidden flex items-center justify-center relative" style={{ aspectRatio: '4/3' }}>
                <div style={{ width: '75%', height: '75%', border: '2px solid rgba(255,255,255,0.3)', borderRadius: 12, position: 'relative' }}>
                  {(['tl', 'tr', 'bl', 'br'] as const).map(c => (
                    <span key={c} style={{
                      position: 'absolute', width: 20, height: 20,
                      borderTop: c.startsWith('b') ? 'none' : '2.5px solid white',
                      borderBottom: c.startsWith('t') ? 'none' : '2.5px solid white',
                      borderLeft: c.endsWith('r') ? 'none' : '2.5px solid white',
                      borderRight: c.endsWith('l') ? 'none' : '2.5px solid white',
                      top: c.startsWith('t') ? -1 : 'auto', bottom: c.startsWith('b') ? -1 : 'auto',
                      left: c.endsWith('l') ? -1 : 'auto', right: c.endsWith('r') ? -1 : 'auto',
                    }} />
                  ))}
                </div>
                <p style={{ position: 'absolute', bottom: 16, color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Kamerabild</p>
              </div>
              <button onClick={() => setPhotoStep('confirm')}
                className="w-full py-4 rounded-xl text-[15px] font-medium text-white flex items-center justify-center gap-2" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                <Camera size={18} strokeWidth={1.5} /> Aufnehmen
              </button>
            </div>
          ) : (
            <div className="w-full max-w-lg space-y-5">
              <div>
                <CheckCircle2 size={28} className="mb-3" style={{ color: 'var(--ba)' }} strokeWidth={1.5} />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">Gerichte erkannt</p>
                <p className="text-[15px] text-gray-500 mt-1">Überprüfe und bearbeite die erkannten Gerichte.</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
                <p className="text-[13px] text-gray-500 mb-3">Erkannte Gerichte ({chips.length})</p>
                <div className="flex flex-wrap gap-2">
                  {chips.map(c => (
                    <span key={c} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-[13px] rounded-full">
                      {c}
                      <button onClick={() => setChips(p => p.filter(x => x !== c))} className="hover:text-gray-900 dark:hover:text-white transition-colors"><X size={12} strokeWidth={2} /></button>
                    </span>
                  ))}
                </div>
              </div>
              {!activeTable && <p className="text-[12px] text-gray-400">Ohne ausgewählten Tisch werden erkannte Gerichte nicht gespeichert — nur zur Ansicht.</p>}
              <div className="flex gap-3">
                <SecondaryBtn onClick={() => setPhotoStep('scan')}>Neu aufnehmen</SecondaryBtn>
                <PrimaryBtn onClick={handleSavePhotoScan}>Speichern</PrimaryBtn>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {confirm && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="fixed inset-0 flex items-center justify-center z-50 p-4 sm:p-8"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--ba, #16A34A) 15%, transparent)' }}>
                  <CheckCircle2 size={22} strokeWidth={1.5} style={{ color: 'var(--ba)' }} />
                </div>
                <div>
                  <p className="text-[18px] font-semibold text-gray-900 dark:text-white">
                    {confirm === 'save'
                      ? `Bestellung für Tisch ${activeTable?.number} speichern?`
                      : `Tisch ${activeTable?.number} schließen?`}
                  </p>
                  <p className="text-[14px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                    {confirm === 'save'
                      ? `${cartTotal} Gerichte · Die Gäste erhalten den Feedback-Link per QR-Code.`
                      : 'Die laufende Bestellung wird abgeräumt und der Tisch wieder freigegeben. Noch nicht abgegebene Bewertungen sind damit nicht mehr möglich.'}
                  </p>
                </div>
                {actionError && (
                  <p className="text-[13px] text-red-600 dark:text-red-400 leading-snug">{actionError}</p>
                )}
                <div className="flex gap-3 pt-1">
                  <SecondaryBtn onClick={() => setConfirm(null)}>Abbrechen</SecondaryBtn>
                  {confirm === 'save' ? (
                    <PrimaryBtn onClick={handleSaveOrder} disabled={saving}>{saving ? 'Speichert…' : 'Speichern'}</PrimaryBtn>
                  ) : (
                    <PrimaryBtn onClick={handleCloseTable} disabled={saving}>{saving ? 'Schließt…' : 'Schließen'}</PrimaryBtn>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ECHTER QR-CODE — kodiert die tatsächliche Tisch-URL, scanbar,
// mit funktionierendem PNG-Download.
// ═══════════════════════════════════════════════════════════

// Die Filiale steht mit in der Adresse: Tisch 5 in Filiale A und Tisch 5 in
// Filiale B sind verschiedene Tische und brauchen verschiedene QR-Codes.
function tableUrl(orgSlug: string, branchSlug: string, tableNumber: number): string {
  return `${window.location.origin}/${orgSlug}/${branchSlug}/table/${tableNumber}`;
}

function TableQRCode({ orgSlug, branchSlug, tableNumber, onDelete }: {
  orgSlug: string; branchSlug: string; tableNumber: number; onDelete?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = tableUrl(orgSlug, branchSlug, tableNumber);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 176, margin: 1, color: { dark: '#111827', light: '#ffffff' } }).catch(() => {});
  }, [url]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      // Filiale im Dateinamen: sonst sind die Downloads zweier Filialen
      // im Ordner nicht auseinanderzuhalten (beide "tisch-5-qr.png").
      a.download = `${branchSlug}-tisch-${tableNumber}-qr.png`;
      a.click();
      URL.revokeObjectURL(href);
    }, 'image/png');
  };

  return (
    <>
      <canvas ref={canvasRef} className="w-24 h-24 rounded-lg" />
      <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">Tisch {tableNumber}</p>
      <p className="text-[10px] text-gray-400 font-mono break-all text-center">/{orgSlug}/{branchSlug}/table/{tableNumber}</p>
      {/* Beide Aktionen als beschriftete Knöpfe mit Rahmen. Vorher war das
          Löschen ein hellgraues 12-Pixel-Symbol ohne Text in der Ecke der
          Kachel — wer es nicht kannte, fand es nicht. */}
      <div className="flex items-center gap-2 w-full pt-0.5">
        <button onClick={download}
          className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 transition-colors">
          <Download size={13} strokeWidth={1.5} /> PNG
        </button>
        {onDelete && (
          <button onClick={onDelete}
            className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
            <Trash2 size={13} strokeWidth={1.5} /> Löschen
          </button>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// GERICHTSFOTO-UPLOAD — kleines, immer sichtbares Upload-Badge
// auf dem Thumbnail (funktioniert auch ohne Hover, also auf Touch).
// ═══════════════════════════════════════════════════════════

function DishImageUpload({ dish, size = 36 }: { dish: Dish; size?: number }) {
  const store = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(false);
    try {
      const dataUri = await compressImageFile(file, 480, 0.78);
      await store.updateDishImage(dish.id, dataUri);
    } catch {
      setError(true);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <img src={dish.img} alt={dish.name} className="w-full h-full rounded-xl object-cover bg-gray-100" />
      <button type="button" onClick={() => inputRef.current?.click()} title="Foto ändern"
        className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center shadow-sm border ${error ? 'bg-red-500 border-red-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600'}`}>
        {uploading ? <Loader2 size={9} className="animate-spin text-gray-500" /> : <ImagePlus size={9} className={error ? 'text-white' : 'text-gray-500 dark:text-gray-300'} />}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ADMIN-DIALOGE — Menü, Gutscheine, Filialen
//
// Alle drei folgen demselben Ablauf: lokales Formular, beim Speichern der
// Aufruf im Store, der mit dem vollständigen Serverzustand antwortet. Fehler
// (abgewiesene Eingabe, belegte Filiale) bleiben im Dialog stehen, damit die
// Eingaben nicht verloren gehen.
// ═══════════════════════════════════════════════════════════

/**
 * Dialograhmen. Gescrollt wird AUSSEN, zentriert INNEN per min-h-full —
 * andernfalls schiebt ein hoher Dialog seinen eigenen Kopf über den oberen
 * Rand hinaus und wird am Handy unerreichbar.
 */
function AdminModal({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <>
      <motion.div className="fixed inset-0 bg-black/50 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-8">
        <div className="min-h-full flex items-center justify-center">
          <motion.div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-[18px] font-semibold text-gray-900 dark:text-white">{title}</p>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} className="text-gray-500" /></button>
            </div>
            {children}
            <div className="flex gap-3 pt-1">{footer}</div>
          </motion.div>
        </div>
      </div>
    </>
  );
}

const FIELD_CLASS = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[14px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors';

function Field({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string;
}) {
  return (
    <div>
      <label className="text-[12px] text-gray-500 mb-1 block">{label}</label>
      <input type={type} value={value} placeholder={placeholder} inputMode={type === 'number' ? 'decimal' : undefined}
        onChange={e => onChange(e.target.value)} className={FIELD_CLASS} />
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

/** Foto auswählen und im Browser verkleinern, bevor es als Base64 mitgeschickt wird. */
function ImageField({ label, value, onChange, aspect = 'square' }: {
  label: string; value: string | null; onChange: (v: string) => void; aspect?: 'square' | 'wide';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    setFailed(false);
    try {
      onChange(await compressImageFile(file, aspect === 'wide' ? 800 : 480, 0.78));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="text-[12px] text-gray-500 mb-1 block">{label}</label>
      <div className="flex items-center gap-3">
        <div className={`${aspect === 'wide' ? 'w-24 h-14' : 'w-14 h-14'} rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden flex-shrink-0`}>
          {value && <img src={value} alt="" className="w-full h-full object-cover" />}
        </div>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 disabled:opacity-50 transition-colors">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} strokeWidth={1.5} />}
          {value ? 'Foto ändern' : 'Foto wählen'}
        </button>
      </div>
      {failed && <p className="text-[11px] text-red-500 mt-1">Das Bild konnte nicht gelesen werden.</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
    </div>
  );
}

/** Fehlermeldung des Servers im Dialog. */
function DialogError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2.5">
      <AlertOctagon size={14} className="text-red-500 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
      <p className="text-[12px] text-red-700 dark:text-red-300 leading-relaxed">{message}</p>
    </div>
  );
}

/**
 * In welchen Filialen etwas gilt. `null` heißt "überall" und ist bewusst nicht
 * dasselbe wie "alle einzeln angehakt": nur so gilt eine später hinzukommende
 * Filiale automatisch mit.
 */
function BranchScopeField({ label, hint, value, onChange }: {
  label: string; hint: string; value: string[] | null; onChange: (v: string[] | null) => void;
}) {
  const store = useStore();
  if (store.branches.length < 2) return null;

  const everywhere = value == null;
  const toggle = (id: string) => {
    const current = value ?? store.branches.map(b => b.id);
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    if (next.length === 0) return; // mindestens eine muss bleiben
    onChange(next.length === store.branches.length ? null : next);
  };

  return (
    <div>
      <label className="text-[12px] text-gray-500 mb-1 block">{label}</label>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={everywhere} onChange={() => onChange(everywhere ? [store.branches[0].id] : null)} />
          In allen Filialen
        </label>
        {!everywhere && (
          <div className="pl-5 space-y-1">
            {store.branches.map(b => (
              <label key={b.id} className="flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={value!.includes(b.id)} onChange={() => toggle(b.id)} />
                {b.name}
              </label>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">{hint}</p>
    </div>
  );
}

/** Gemeinsame Speicher-Mechanik der drei Dialoge: sperren, Fehler behalten, schließen. */
function useDialogSave(onClose: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (run: () => Promise<void>) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await run();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, save };
}

function DishDialog({ dish, onClose }: { dish: Dish | null; onClose: () => void }) {
  const store = useStore();
  const { saving, error, save } = useDialogSave(onClose);
  const [form, setForm] = useState({
    name: dish?.name ?? '',
    price: dish ? String(dish.price) : '',
    cat: (dish?.cat ?? 'Speisen') as Dish['cat'],
    img: dish?.img ?? null as string | null,
    branchIds: dish?.branchIds ?? null as string[] | null,
  });

  const price = Number(form.price.replace(',', '.'));
  const valid = form.name.trim() !== '' && Number.isFinite(price) && price >= 0;

  const handleSave = () => save(async () => {
    const payload = {
      name: form.name.trim(), price, cat: form.cat, img: form.img ?? undefined,
      branchIds: form.branchIds,
    };
    if (dish) await store.updateDish(dish.id, payload);
    else await store.addDish(payload);
  });

  return (
    <AdminModal title={dish ? 'Gericht bearbeiten' : 'Gericht hinzufügen'} onClose={onClose}
      footer={<>
        <SecondaryBtn onClick={onClose}>Abbrechen</SecondaryBtn>
        <PrimaryBtn onClick={handleSave} disabled={!valid || saving}>{saving ? 'Speichern…' : 'Speichern'}</PrimaryBtn>
      </>}>
      <div className="space-y-3">
        <Field label="Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Spicy Tuna Roll" />
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Preis (€)" type="text" value={form.price} onChange={v => setForm(p => ({ ...p, price: v }))} placeholder="14.50" />
          </div>
          <div className="flex-1">
            <label className="text-[12px] text-gray-500 mb-1 block">Kategorie</label>
            <select value={form.cat} onChange={e => setForm(p => ({ ...p, cat: e.target.value as Dish['cat'] }))}
              className={FIELD_CLASS}>
              {(['Speisen', 'Getränke'] as const).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <ImageField label="Foto" value={form.img} onChange={v => setForm(p => ({ ...p, img: v }))} />
        <BranchScopeField label="Wird geführt in" value={form.branchIds}
          hint="Die Filialleitung kann das Gericht später für ihre Filiale zusätzlich ab- oder anschalten."
          onChange={v => setForm(p => ({ ...p, branchIds: v }))} />
        <DialogError message={error} />
      </div>
    </AdminModal>
  );
}

function VoucherDialog({ voucher, onClose }: { voucher: Voucher | null; onClose: () => void }) {
  const store = useStore();
  const { saving, error, save } = useDialogSave(onClose);
  const [form, setForm] = useState({
    title: voucher?.title ?? '',
    points: voucher ? String(voucher.points) : '100',
    expiry: voucher?.expiry ?? '',
    img: voucher?.img ?? null as string | null,
    branchIds: voucher?.branchIds ?? null as string[] | null,
  });

  const points = Number(form.points);
  const valid = form.title.trim() !== '' && form.expiry.trim() !== '' && Number.isInteger(points) && points >= 0;

  const handleSave = () => save(async () => {
    const payload = {
      title: form.title.trim(), points, expiry: form.expiry.trim(),
      img: form.img ?? undefined, branchIds: form.branchIds,
    };
    if (voucher) await store.updateVoucher(voucher.id, payload);
    else await store.addVoucher(payload);
  });

  return (
    <AdminModal title={voucher ? 'Gutschein bearbeiten' : 'Gutschein hinzufügen'} onClose={onClose}
      footer={<>
        <SecondaryBtn onClick={onClose}>Abbrechen</SecondaryBtn>
        <PrimaryBtn onClick={handleSave} disabled={!valid || saving}>{saving ? 'Speichern…' : 'Speichern'}</PrimaryBtn>
      </>}>
      <div className="space-y-3">
        <Field label="Titel" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} placeholder="Gratis Miso Suppe" />
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Punkte" type="number" value={form.points} onChange={v => setForm(p => ({ ...p, points: v }))} placeholder="100" />
          </div>
          <div className="flex-1">
            <Field label="Gültig bis" value={form.expiry} onChange={v => setForm(p => ({ ...p, expiry: v }))} placeholder="31.12.2026" />
          </div>
        </div>
        <ImageField label="Bild" value={form.img} onChange={v => setForm(p => ({ ...p, img: v }))} aspect="wide" />
        <BranchScopeField label="Einlösbar in" value={form.branchIds}
          hint="Punkte sammelt der Gast in der ganzen Kette — ein Gutschein nur für eine Filiale sollte die Ausnahme bleiben."
          onChange={v => setForm(p => ({ ...p, branchIds: v }))} />
        <DialogError message={error} />
      </div>
    </AdminModal>
  );
}

function BranchDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const store = useStore();
  const { saving, error, save } = useDialogSave(onClose);
  const [form, setForm] = useState({ name: branch?.name ?? '', address: branch?.address ?? '' });
  const valid = form.name.trim() !== '' && form.address.trim() !== '';

  const handleSave = () => save(async () => {
    const payload = { name: form.name.trim(), address: form.address.trim() };
    if (branch) await store.updateBranch(branch.id, payload);
    else await store.addBranch(payload);
  });

  return (
    <AdminModal title={branch ? 'Filiale bearbeiten' : 'Filiale hinzufügen'} onClose={onClose}
      footer={<>
        <SecondaryBtn onClick={onClose}>Abbrechen</SecondaryBtn>
        <PrimaryBtn onClick={handleSave} disabled={!valid || saving}>{saving ? 'Speichern…' : 'Speichern'}</PrimaryBtn>
      </>}>
      <div className="space-y-3">
        <Field label="Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Herrengasse" />
        <Field label="Adresse" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="Herrengasse 12, 8010 Graz" />
        <DialogError message={error} />
      </div>
    </AdminModal>
  );
}

// ═══════════════════════════════════════════════════════════
// ADMIN APP
// ═══════════════════════════════════════════════════════════

type AdminPage = 'dashboard' | 'reviews' | 'menu' | 'vouchers' | 'redemptions' | 'design' | 'users' | 'settings';

// branch === null heißt "alle Filialen": der Ketten-Admin sieht die Zahlen
// aller Standorte zusammen. Alles Filialgebundene (Tische, QR-Codes) braucht
// dann erst eine Auswahl.
function AdminApp({ orgSlug, branch, canSwitchBranch, onPick }: {
  orgSlug: string; branch: Branch | null; canSwitchBranch: boolean;
  onPick: (p: string | 'all') => void;
}) {
  const store = useStore();
  const [page, setPage] = useState<AdminPage>('dashboard');
  const [editMode, setEditMode] = useState(false);
  // Ausgeblendete Kacheln kommen aus dem Server-Zustand, nicht aus lokalem
  // State — sonst stand nach jedem Neuladen wieder alles da.
  const hidden = useMemo(() => new Set(store.dashboard.hiddenWidgets), [store.dashboard.hiddenWidgets]);
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());
  const [userMenuOpen, setUserMenuOpen] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'Kellner' as AdminUser['role'], branchId: '', password: '' });
  const [inviteError, setInviteError] = useState<string | null>(null);
  // Passwort eines bestehenden Kontos setzen (Freischalten oder Zurücksetzen).
  const [pwDialog, setPwDialog] = useState<{ user: AdminUser; value: string; error: string | null } | null>(null);
  const [branchDrop, setBranchDrop] = useState(false);
  const [loading, setLoading] = useState(false);
  const [brandForm, setBrandForm] = useState({
    name: store.brand?.name ?? '', accent: store.brand?.accent ?? '#16A34A',
    logoImage: store.brand?.logoImage ?? null as string | null,
    coverImage: store.brand?.coverImage ?? null as string | null,
    font: store.brand?.font ?? 'Inter',
    cardStyle: (store.brand?.cardStyle ?? 'standard') as NonNullable<Brand['cardStyle']>,
  });
  const [brandSaved, setBrandSaved] = useState(false);
  const [previewStars, setPreviewStars] = useState(4);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [addTableCount, setAddTableCount] = useState(1);
  const [addingTables, setAddingTables] = useState(false);
  // Der Server liefert bereits nur die passenden Tische; im Ketten-Blick sind
  // es alle. Das Filtern hier ist die zweite Sicherung, damit die Tischliste
  // niemals Tische einer anderen Filiale zeigt als die Überschrift behauptet.
  const branchTables = branch ? store.tables.filter(t => t.branchId === branch.id) : [];
  // Nur der Ketten-Admin verwaltet Filialen, Branding, Stammkarte und Rollen.
  const isChainAdmin = store.authUser?.role === 'Admin';
  // Offener Dialog: { dish: null } heißt "neu anlegen", { dish } heißt "bearbeiten".
  const [dishDialog, setDishDialog] = useState<{ dish: Dish | null } | null>(null);
  const [voucherDialog, setVoucherDialog] = useState<{ voucher: Voucher | null } | null>(null);
  const [branchDialog, setBranchDialog] = useState<{ branch: Branch | null } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (store.brand) setBrandForm({
      name: store.brand.name, accent: store.brand.accent, logoImage: store.brand.logoImage ?? null,
      coverImage: store.brand.coverImage ?? null,
      font: store.brand.font ?? 'Inter', cardStyle: store.brand.cardStyle ?? 'standard',
    });
  }, [store.brand]);

  useGoogleFont(brandForm.font);

  const toggleMenu = (id: string) => setOpenMenus(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const hideWidget = (id: string) => {
    setOpenMenus(new Set());
    if (hidden.has(id)) return;
    runAction(() => store.setHiddenWidgets([...hidden, id]));
  };
  const showAllWidgets = () => runAction(() => store.setHiddenWidgets([]));

  const ratedDishes = store.dishes.filter(d => d.ratingsCount > 0);
  const totalRatings = ratedDishes.reduce((a, d) => a + d.ratingsCount, 0);
  const avgRating = totalRatings > 0 ? ratedDishes.reduce((a, d) => a + d.ratingsSum, 0) / totalRatings : 0;
  const worstDish = ratedDishes.length > 0 ? [...ratedDishes].sort((a, b) => (dishAvg(a) ?? 0) - (dishAvg(b) ?? 0))[0] : null;
  const pointsRedeemed = store.vouchers.filter(v => store.guest.redeemed.includes(v.id)).reduce((a, v) => a + v.points, 0);
  const pointsIssued = store.guest.points + pointsRedeemed;
  const openOutstandingAlerts = store.alerts.filter(a => !a.resolved).length;

  const kpis = [
    { id: 'avg', label: 'Ø Bewertung', value: totalRatings > 0 ? avgRating.toFixed(1) : '—', sub: totalRatings > 0 ? undefined : 'Noch keine Bewertungen', Icon: Star },
    { id: 'total', label: 'Bewertungen', value: String(totalRatings), Icon: BarChart3 },
    { id: 'worst', label: 'Schlechtestes Gericht', value: worstDish?.name ?? '—', sub: worstDish ? `${(dishAvg(worstDish) ?? 0).toFixed(1)} ★` : undefined, Icon: AlertTriangle },
    { id: 'alerts', label: 'Offene Alarme', value: String(openOutstandingAlerts), Icon: RefreshCw },
    { id: 'pts', label: 'Punkte ausgegeben', value: String(pointsIssued), sub: `${pointsRedeemed} eingelöst`, Icon: Zap },
    { id: 'vouchers', label: 'Eingelöste Gutscheine', value: String(store.guest.redeemed.length), Icon: CheckCircle2 },
  ];

  // Die Filialleitung sieht nur, was ihre Filiale betrifft. Stammkarte,
  // Gutscheine und Einstellungen sind Sache der Kette — sie auszublenden ist
  // Bequemlichkeit, den Schutz macht der Server (chainAdmin in index.ts).
  // Die Filialleitung bekommt das Menü, um Gerichte für ihre Filiale an- und
  // abzuschalten — die Stammkarte selbst (anlegen, umbenennen, löschen) bleibt
  // ihr auf der Seite verwehrt. Gutscheine sind reine Kettensache.
  const nav: { id: AdminPage; label: string; Icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'reviews', label: 'Bewertungen', Icon: MessageSquare },
    { id: 'menu', label: 'Menü', Icon: UtensilsCrossed },
    // Einlösungen sieht auch die Filialleitung — es sind ihre eigenen.
    { id: 'redemptions', label: 'Einlösungen', Icon: CheckCircle2 },
    ...(isChainAdmin ? [
      { id: 'vouchers' as const, label: 'Gutscheine', Icon: Ticket },
      // Design-Studio vorerst ausgeblendet — die Seite selbst bleibt im Code.
      // Zum Zurückholen die folgende Zeile wieder einkommentieren:
      // { id: 'design' as const, label: 'Design', Icon: Palette },
    ] : []),
    { id: 'users', label: 'Benutzer', Icon: Users },
    { id: 'settings', label: 'Einstellungen', Icon: Settings },
  ];

  // Anlegen und Freischalten in einem Zug. Getrennt wäre es eine Sackgasse:
  // das Projekt verschickt keine E-Mails, ein Konto ohne Passwort könnte sich
  // also nie anmelden.
  const handleInviteSubmit = async () => {
    if (!inviteForm.name || !inviteForm.email) return;
    if (inviteForm.password.length < 8) {
      setInviteError('Das Passwort muss mindestens 8 Zeichen haben.');
      return;
    }
    setInviteError(null);
    try {
      const created = await store.addUser({
        name: inviteForm.name, email: inviteForm.email, role: inviteForm.role,
        branchId: inviteForm.branchId || null,
      });
      if (created) await store.setUserPassword(created.id, inviteForm.password);
      setInviteForm({ name: '', email: '', role: 'Kellner', branchId: '', password: '' });
      setShowInvite(false);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen.');
    }
  };

  const handleSetPassword = async () => {
    if (!pwDialog) return;
    if (pwDialog.value.length < 8) {
      setPwDialog(p => p && { ...p, error: 'Das Passwort muss mindestens 8 Zeichen haben.' });
      return;
    }
    try {
      await store.setUserPassword(pwDialog.user.id, pwDialog.value);
      setPwDialog(null);
    } catch (err) {
      setPwDialog(p => p && { ...p, error: err instanceof Error ? err.message : 'Fehlgeschlagen.' });
    }
  };

  const handleSaveBrand = async () => {
    await store.updateBrand({
      name: brandForm.name, accent: brandForm.accent,
      logoImage: brandForm.logoImage, coverImage: brandForm.coverImage,
      font: brandForm.font, cardStyle: brandForm.cardStyle,
    });
    setBrandSaved(true);
    setTimeout(() => setBrandSaved(false), 2000);
  };

  const handleLogoFile = async (file: File) => {
    const dataUri = await compressImageFile(file, 240, 0.85);
    setBrandForm(p => ({ ...p, logoImage: dataUri }));
  };

  const handleCoverFile = async (file: File) => {
    const dataUri = await compressImageFile(file, 960, 0.8);
    setBrandForm(p => ({ ...p, coverImage: dataUri }));
  };

  const previewDish = store.dishes[0];

  const exportDishesCsv = () => {
    downloadCsv(`gerichte-${today()}.csv`, [
      ['Gericht', 'Kategorie', 'Preis', 'Anzahl Bewertungen', 'Durchschnitt'],
      ...store.dishes.map(d => [
        d.name, d.cat, d.price.toFixed(2), d.ratingsCount,
        d.ratingsCount > 0 ? (dishAvg(d) ?? 0).toFixed(2) : '',
      ]),
    ]);
  };

  // Eine Zeile je bewertetem Gericht, damit sich die Datei in Excel filtern
  // und pivotieren lässt.
  const exportReviewsCsv = () => {
    const rows: (string | number)[][] = [
      ['Datum', 'Tisch', 'Gericht', 'Sterne', 'Anmerkung', 'Service', 'Ambiente', 'Tempo'],
    ];
    for (const rv of store.reviews) {
      const when = new Date(rv.createdAt).toLocaleString('de-AT');
      for (const d of rv.dishRatings) {
        rows.push([
          when, rv.tableNumber,
          store.dishes.find(x => x.id === d.dishId)?.name ?? 'Gelöschtes Gericht',
          d.stars, d.note ?? '',
          rv.overall.service, rv.overall.ambience, rv.overall.speed,
        ]);
      }
    }
    downloadCsv(`bewertungen-${today()}.csv`, rows);
  };

  // Die Skeleton-Anzeigen hingen zuvor an einem Testschalter mit Attrappen-Timer.
  // Jetzt zeigen sie das, was sie sollen: ein tatsächlich laufendes Nachladen.
  const handleRefresh = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await store.refresh();
    } finally {
      setLoading(false);
    }
  };

  // Neue Tische landen immer in der oben gewählten Filiale — ein zweiter
  // Filial-Wähler direkt am Formular wäre eine zweite Wahrheit daneben.
  const handleAddTables = async () => {
    if (addingTables || !branch) return;
    setAddingTables(true);
    try {
      await store.addTables(branch.slug, addTableCount);
      setAddTableCount(1);
    } finally {
      setAddingTables(false);
    }
  };

  // Löschen und andere Sofortaktionen: der Server kann sie begründet ablehnen
  // (z. B. eine Filiale, an der noch Tische hängen). Diese Begründung gehört
  // sichtbar auf die Seite, statt still verschluckt zu werden.
  const runAction = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0D1117] flex" onClick={() => { setBranchDrop(false); setOpenMenus(new Set()); setUserMenuOpen(null); }}>
      <aside className="hidden lg:flex w-56 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex-col fixed top-10 bottom-0 z-20">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <BrandLogo brand={store.brand} size={32} textSize={22} rounded="rounded-lg" />
            <div>
              <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight">{store.brand?.name}</p>
              <p className="text-[11px] text-gray-400">Admin Panel</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setPage(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors ${page === id ? 'text-white font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}
              style={page === id ? { backgroundColor: 'var(--ba, #16A34A)' } : {}}>
              <Icon size={15} strokeWidth={1.5} />{label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100 dark:border-gray-800">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <LogOut size={15} strokeWidth={1.5} /> Abmelden
          </button>
        </div>
      </aside>

      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen min-w-0">
        <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-10 z-10">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-8 h-14">
            <div className="relative min-w-0" onClick={e => e.stopPropagation()}>
              <button onClick={() => canSwitchBranch && setBranchDrop(p => !p)}
                disabled={!canSwitchBranch}
                className="flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors min-w-0 disabled:hover:text-gray-700 dark:disabled:hover:text-gray-300">
                <Building2 size={14} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                <span className="font-medium truncate">{store.brand?.name}</span>
                <span className="hidden sm:inline text-gray-400 mx-0.5">›</span>
                <span className="hidden sm:inline text-gray-500 dark:text-gray-400 truncate">
                  {branch ? branch.name : 'Alle Filialen'}
                </span>
                {canSwitchBranch && (
                  <ChevronDown size={13} className={`text-gray-400 transition-transform flex-shrink-0 ${branchDrop ? 'rotate-180' : ''}`} />
                )}
              </button>
              <AnimatePresence>
                {branchDrop && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                    className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden min-w-[280px] z-50">
                    {/* Der Umschalter lädt neu: der Server liefert die Daten
                        genau einer Filiale (oder aller), die Oberfläche filtert
                        nicht selbst. */}
                    <button onClick={() => { onPick('all'); setBranchDrop(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700">
                      <span className="text-xl">🏢</span>
                      <div className="flex-1">
                        <p className="text-[14px] font-medium text-gray-900 dark:text-white">Alle Filialen</p>
                        <p className="text-[12px] text-gray-400">Zahlen der ganzen Kette zusammen</p>
                      </div>
                      {!branch && <Check size={14} strokeWidth={2.5} style={{ color: 'var(--ba)' }} />}
                    </button>
                    {store.branches.map(b => (
                      <button key={b.id} onClick={() => { onPick(b.slug); setBranchDrop(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <span className="text-xl">🏠</span>
                        <div className="flex-1">
                          <p className="text-[14px] font-medium text-gray-900 dark:text-white">{b.name}</p>
                          <p className="text-[12px] text-gray-400">{b.address}</p>
                        </div>
                        {b.id === branch?.id && <Check size={14} strokeWidth={2.5} style={{ color: 'var(--ba)' }} />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <button onClick={handleRefresh} disabled={loading}
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors" title="Daten neu laden">
                <RefreshCw size={16} strokeWidth={1.5} className={`text-gray-600 dark:text-gray-400 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setPage('dashboard')} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 relative" title={`${openOutstandingAlerts} offene Alarme`}>
                <Bell size={17} strokeWidth={1.5} className="text-gray-600 dark:text-gray-400" />
                {openOutstandingAlerts > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />}
              </button>
              <div className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-white text-[13px] font-bold" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>H</div>
            </div>
          </div>
          <nav className="lg:hidden flex gap-1 px-3 pb-2 overflow-x-auto">
            {nav.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setPage(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${page === id ? 'text-white' : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'}`}
                style={page === id ? { backgroundColor: 'var(--ba, #16A34A)' } : {}}>
                <Icon size={13} strokeWidth={1.5} />{label}
              </button>
            ))}
          </nav>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0" onClick={() => { setBranchDrop(false); setOpenMenus(new Set()); setUserMenuOpen(null); }}>
          <>
              {actionError && (
                <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 mb-5">
                  <AlertOctagon size={15} className="text-red-500 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  <p className="flex-1 text-[13px] text-red-700 dark:text-red-300 leading-relaxed">{actionError}</p>
                  <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0"><X size={14} /></button>
                </div>
              )}

              {page === 'dashboard' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</p>
                      {/* Der Server hat die Zahlen bereits auf diese Reichweite
                          eingegrenzt — die Beschriftung sagt, welche es ist. */}
                      <p className="text-[13px] text-gray-400 mt-0.5">
                        Alle bisherigen Bewertungen · {branch ? branch.name : 'alle Filialen'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {hidden.size > 0 && (
                        <button onClick={showAllWidgets}
                          className="flex items-center gap-1.5 text-[13px] px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 transition-colors">
                          <Eye size={13} strokeWidth={1.5} /> Alles einblenden
                        </button>
                      )}
                      <button onClick={() => setEditMode(p => !p)}
                        className={`flex items-center gap-1.5 text-[13px] px-4 py-2 rounded-xl border transition-colors ${editMode ? 'text-white border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}
                        style={editMode ? { backgroundColor: 'var(--ba)' } : {}}>
                        <Pencil size={13} strokeWidth={1.5} /> {editMode ? 'Fertig' : 'Bearbeiten'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {kpis.filter(k => !hidden.has(k.id)).map(kpi => (
                      <div key={kpi.id} className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm p-5 relative transition-all ${editMode ? 'border-dashed border-gray-300 dark:border-gray-600' : 'border-gray-100 dark:border-gray-700'}`}>
                        {editMode ? (
                          <button onClick={() => hideWidget(kpi.id)} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900 transition-colors group">
                            <X size={12} className="text-gray-400 group-hover:text-red-500" />
                          </button>
                        ) : (
                          <div className="absolute top-3 right-3" onClick={e => e.stopPropagation()}>
                            <button onClick={() => toggleMenu(kpi.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                              <MoreHorizontal size={14} strokeWidth={1.5} />
                            </button>
                            {openMenus.has(kpi.id) && (
                              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden z-20 min-w-[140px]">
                                <button onClick={() => hideWidget(kpi.id)} className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Ausblenden</button>
                                <button onClick={() => { setOpenMenus(new Set()); exportReviewsCsv(); }} className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Bewertungen als CSV</button>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                          <kpi.Icon size={15} strokeWidth={1.5} className="text-gray-500 dark:text-gray-400" />
                        </div>
                        {loading ? (
                          <div className="space-y-2"><Sk h={12} w="55%" /><Sk h={26} w="65%" /><Sk h={11} w="40%" /></div>
                        ) : (
                          <>
                            <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-1">{kpi.label}</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</p>
                            {'sub' in kpi && kpi.sub && <p className="text-[12px] text-gray-400 mt-1">{kpi.sub}</p>}
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {!hidden.has('chart') && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Bewertungsverlauf</p>
                          <p className="text-[12px] text-gray-400">Ø Bewertung der letzten 7 Tage (Referenzwerte)</p>
                        </div>
                        <div onClick={e => e.stopPropagation()}>
                          <button onClick={() => toggleMenu('chart')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                            <MoreHorizontal size={16} strokeWidth={1.5} />
                          </button>
                          {openMenus.has('chart') && (
                            <div className="absolute mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden z-20 min-w-[140px]">
                              <button onClick={() => hideWidget('chart')} className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Ausblenden</button>
                            </div>
                          )}
                        </div>
                      </div>
                      {loading ? <Sk h={200} /> : (
                        <div style={{ height: 200 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={CHART_DATA} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                              <defs>
                                <linearGradient id="admin-area-grad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="var(--ba, #16A34A)" stopOpacity={0.18} />
                                  <stop offset="95%" stopColor="var(--ba, #16A34A)" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid key="grid" strokeDasharray="3 0" stroke="#f1f5f9" vertical={false} />
                              <XAxis key="x" dataKey="day" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                              <YAxis key="y" domain={[3.5, 5]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={28} />
                              <Tooltip key="tip" contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [v.toFixed(1), 'Ø Bewertung']} />
                              <Area key="area" type="monotone" dataKey="avg" stroke="var(--ba, #16A34A)" strokeWidth={2} fill="url(#admin-area-grad)" dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  )}

                  {!hidden.has('dishes') && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Gerichte im Überblick</p>
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <button className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"><Filter size={11} strokeWidth={1.5} /> Filter</button>
                          <button onClick={() => toggleMenu('dishes')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                            <MoreHorizontal size={16} strokeWidth={1.5} />
                          </button>
                          {openMenus.has('dishes') && (
                            <div className="absolute mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden z-20 min-w-[150px]">
                              <button onClick={() => hideWidget('dishes')} className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Ausblenden</button>
                              <button onClick={() => { setOpenMenus(new Set()); exportDishesCsv(); }} className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">CSV exportieren</button>
                            </div>
                          )}
                        </div>
                      </div>
                      {loading ? (
                        <div className="p-6 space-y-4">
                          {[...Array(4)].map((_, i) => <div key={i} className="flex items-center gap-4"><Sk h={36} w={36} r={8} /><div className="flex-1 space-y-2"><Sk h={13} w="40%" /><Sk h={11} w="25%" /></div><Sk h={20} w={80} r={999} /></div>)}
                        </div>
                      ) : ratedDishes.length === 0 ? (
                        <div className="p-6"><EmptyState icon={Star} title="Noch keine Bewertungen" desc="Sobald Gäste Gerichte bewerten, erscheinen sie hier." /></div>
                      ) : (
                        <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                              {['#', 'Gericht', 'Kategorie', 'Ø Bewertung', 'Bewertungen', 'Preis'].map(h => (
                                <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ratedDishes.sort((a, b) => (dishAvg(a) ?? 0) - (dishAvg(b) ?? 0)).map((dish, i) => {
                              const avg = dishAvg(dish) ?? 0;
                              return (
                                <tr key={dish.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                                  <td className="px-5 py-3 text-[13px] text-gray-400 dark:text-gray-600">{i + 1}</td>
                                  <td className="px-5 py-3">
                                    <div className="flex items-center gap-3">
                                      <DishImageUpload dish={dish} size={32} />
                                      <p className="text-[14px] font-medium text-gray-900 dark:text-white">{dish.name}</p>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3">
                                    <span className="text-[11px] px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{dish.cat}</span>
                                  </td>
                                  <td className="px-5 py-3">
                                    <div className="flex items-center gap-2">
                                      <StarRating value={Math.round(avg)} size={12} />
                                      <span className={`text-[14px] font-semibold ${avg < 3 ? 'text-red-600' : avg < 4 ? 'text-amber-700' : 'text-emerald-700'}`}>{avg.toFixed(1)}</span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3 text-[14px] text-gray-600 dark:text-gray-400">{dish.ratingsCount}</td>
                                  <td className="px-5 py-3 text-[14px] text-gray-600 dark:text-gray-400">{dish.price.toFixed(2)} €</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {page === 'design' && (
                <div className="space-y-5">
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">Design</p>
                    <p className="text-[13px] text-gray-400 mt-0.5">Wie deine Gäste die App sehen — Änderungen wirken sich auf Gast, Kellner &amp; Admin aus.</p>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
                    <div className="space-y-5">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-5">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Palette size={15} strokeWidth={1.5} className="text-gray-400" /> Logo &amp; Name</p>
                        <div className="flex flex-col sm:flex-row gap-6">
                          <div className="flex-shrink-0">
                            <p className="text-[12px] text-gray-400 mb-2">Logo</p>
                            <button type="button" onClick={() => logoInputRef.current?.click()}
                              className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors overflow-hidden">
                              <BrandLogo brand={{ logo: store.brand?.logo ?? '🍽️', logoImage: brandForm.logoImage }} size={80} textSize={36} rounded="rounded-none" />
                            </button>
                            <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = ''; }} />
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <button onClick={() => logoInputRef.current?.click()} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1"><Upload size={10} /> Hochladen</button>
                              {brandForm.logoImage && (
                                <button onClick={() => setBrandForm(p => ({ ...p, logoImage: null }))} className="text-[11px] text-gray-400 hover:text-red-500">Entfernen</button>
                              )}
                            </div>
                          </div>
                          <div className="flex-1 space-y-4">
                            <div>
                              <p className="text-[12px] text-gray-400 mb-1.5">Restaurantname</p>
                              <input value={brandForm.name} onChange={e => setBrandForm(p => ({ ...p, name: e.target.value }))}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-700 text-[14px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors" />
                            </div>
                            <div>
                              <p className="text-[12px] text-gray-400 mb-1.5">Akzentfarbe — wird auf Gast, Kellner &amp; Admin übernommen</p>
                              <div className="flex items-center gap-3 flex-wrap">
                                <input type="color" value={brandForm.accent} onChange={e => setBrandForm(p => ({ ...p, accent: e.target.value }))}
                                  className="w-10 h-10 rounded-xl border border-gray-200 cursor-pointer p-0.5" />
                                <input value={brandForm.accent} onChange={e => setBrandForm(p => ({ ...p, accent: e.target.value }))}
                                  className="flex-1 min-w-[120px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-700 text-[14px] text-gray-900 dark:text-white outline-none font-mono uppercase" />
                                <div className="flex gap-1.5">
                                  {['#16A34A', '#DC2626', '#7C3AED', '#2563EB', '#D97706'].map(c => (
                                    <button key={c} onClick={() => setBrandForm(p => ({ ...p, accent: c }))}
                                      className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 shadow hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                        <div>
                          <p className="text-[15px] font-semibold text-gray-900 dark:text-white flex items-center gap-2"><ImagePlus size={15} strokeWidth={1.5} className="text-gray-400" /> Titelbild</p>
                          <p className="text-[12px] text-gray-400 mt-0.5">Erscheint oben auf dem Willkommensbildschirm deiner Gäste — macht aus der Logo-Box eine echte Restaurant-Ansicht.</p>
                        </div>
                        <button type="button" onClick={() => coverInputRef.current?.click()}
                          className="relative w-full h-32 rounded-xl overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 transition-colors bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                          {brandForm.coverImage ? (
                            <img src={brandForm.coverImage} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="flex flex-col items-center gap-1.5 text-gray-400">
                              <ImagePlus size={22} strokeWidth={1.5} />
                              <span className="text-[12px]">Titelbild hochladen</span>
                            </span>
                          )}
                        </button>
                        <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); e.target.value = ''; }} />
                        {brandForm.coverImage && (
                          <div className="flex items-center gap-3">
                            <button onClick={() => coverInputRef.current?.click()} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1"><Upload size={10} /> Ersetzen</button>
                            <button onClick={() => setBrandForm(p => ({ ...p, coverImage: null }))} className="text-[11px] text-gray-400 hover:text-red-500">Entfernen</button>
                          </div>
                        )}
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Schriftart</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {BRAND_FONTS.map(f => (
                            <button key={f.name} onClick={() => setBrandForm(p => ({ ...p, font: f.name }))}
                              className="text-left px-4 py-3 rounded-xl border-2 transition-colors border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"
                              style={brandForm.font === f.name ? { borderColor: brandForm.accent, backgroundColor: `color-mix(in srgb, ${brandForm.accent} 8%, transparent)` } : {}}>
                              <p className="text-[16px] text-gray-900 dark:text-white" style={{ fontFamily: `'${f.name}', system-ui, sans-serif` }}>{f.name}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{f.category}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Kartenlayout — Gerichte bewerten</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {BRAND_CARD_STYLES.map(cs => (
                            <button key={cs.id} onClick={() => setBrandForm(p => ({ ...p, cardStyle: cs.id }))}
                              className="text-left p-4 rounded-xl border-2 transition-colors border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"
                              style={brandForm.cardStyle === cs.id ? { borderColor: brandForm.accent, backgroundColor: `color-mix(in srgb, ${brandForm.accent} 8%, transparent)` } : {}}>
                              <p className="text-[13px] font-semibold text-gray-900 dark:text-white mb-1">{cs.label}</p>
                              <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">{cs.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <PrimaryBtn full={false} sm onClick={handleSaveBrand}>Änderungen speichern</PrimaryBtn>
                        {brandSaved && <span className="text-[12px] text-emerald-600 flex items-center gap-1"><Check size={13} /> Gespeichert</span>}
                      </div>
                    </div>

                    <div className="xl:sticky xl:top-24">
                      <p className="text-[12px] text-gray-400 mb-2 uppercase tracking-wide">Live-Vorschau</p>
                      <div className="bg-gray-200 dark:bg-gray-950 rounded-[32px] p-3 shadow-inner">
                        <div className="relative rounded-[24px] overflow-hidden bg-[#F7F8FA] dark:bg-[#0D1117]"
                          style={{ fontFamily: `'${brandForm.font}', system-ui, sans-serif`, '--ba': brandForm.accent } as React.CSSProperties}>
                          {brandForm.coverImage ? (
                            <>
                              <img src={brandForm.coverImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/60" />
                            </>
                          ) : (
                            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--ba, #16A34A) 16%, transparent), transparent 55%)' }} />
                          )}
                          <div className="relative flex flex-col items-center px-5 pt-24 pb-5">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden mb-2.5 ${brandForm.coverImage ? 'bg-white/95 shadow-lg' : 'bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700'}`}>
                              <BrandLogo brand={{ logo: store.brand?.logo ?? '🍽️', logoImage: brandForm.logoImage }} size={48} textSize={22} rounded="rounded-none" />
                            </div>
                            <p className={`text-[15px] font-semibold text-center ${brandForm.coverImage ? 'text-white' : 'text-gray-900 dark:text-white'}`}
                              style={brandForm.coverImage ? { textShadow: '0 1px 4px rgba(0,0,0,0.4)' } : undefined}>{brandForm.name || 'Dein Restaurant'}</p>
                            <p className={`text-[11px] mb-4 ${brandForm.coverImage ? 'text-white/85' : 'text-gray-400'}`}>{branch?.name ?? store.branches[0]?.name}</p>
                            {previewDish ? (
                              <DishRatingCard dish={previewDish} stars={previewStars} note="" expanded={false} cardStyle={brandForm.cardStyle}
                                onRate={setPreviewStars} onToggleExpand={() => {}} onNoteChange={() => {}} />
                            ) : (
                              <div className="w-full h-24 rounded-xl bg-white/50 dark:bg-gray-800/50" />
                            )}
                            <button className="w-full mt-4 py-3 rounded-xl font-medium text-white text-[14px]" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>Weiter →</button>
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">Tippe auf die Sterne in der Vorschau, um die Akzentfarbe zu testen — noch ungespeicherte Änderungen.</p>
                    </div>
                  </div>
                </div>
              )}

              {page === 'users' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">Benutzer</p>
                      <p className="text-[13px] text-gray-400 mt-0.5">{store.users.length} Benutzer · {store.brand?.name}</p>
                    </div>
                    <button onClick={() => setShowInvite(true)}
                      className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl text-white font-medium" style={{ backgroundColor: 'var(--ba)' }}>
                      <UserPlus size={13} strokeWidth={1.5} /> Einladen
                    </button>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                          {['Name', 'Rolle', 'Filiale', 'Status', ''].map(h => <th key={h} className="text-left px-6 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {store.users.map(u => (
                          <tr key={u.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0" style={{ backgroundColor: 'var(--ba)' }}>{u.name[0]}</div>
                                <div><p className="text-[14px] font-medium text-gray-900 dark:text-white">{u.name}</p><p className="text-[12px] text-gray-400">{u.email}</p></div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${u.role === 'Admin' ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : u.role === 'Manager' ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>{u.role}</span>
                            </td>
                            <td className="px-6 py-3.5 text-[14px] text-gray-600 dark:text-gray-400">{store.branches.find(b => b.id === u.branchId)?.name ?? 'Alle Filialen'}</td>
                            <td className="px-6 py-3.5">
                              <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${u.status === 'aktiv' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : u.status === 'eingeladen' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>{u.status}</span>
                              {u.status === 'eingeladen' && (
                                <p className="text-[11px] text-gray-400 mt-1">kann sich noch nicht anmelden</p>
                              )}
                            </td>
                            <td className="px-6 py-3.5 relative" onClick={e => e.stopPropagation()}>
                              <button onClick={() => setUserMenuOpen(p => p === u.id ? null : u.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><MoreHorizontal size={16} strokeWidth={1.5} /></button>
                              {userMenuOpen === u.id && (
                                <div className="absolute right-6 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden z-20 min-w-[190px]">
                                  <button onClick={() => { setPwDialog({ user: u, value: '', error: null }); setUserMenuOpen(null); }}
                                    className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                                    <Lock size={12} /> {u.status === 'eingeladen' ? 'Freischalten' : 'Passwort ändern'}
                                  </button>
                                  <button onClick={() => { store.removeUser(u.id); setUserMenuOpen(null); }} className="w-full text-left px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950 flex items-center gap-2">
                                    <Trash2 size={12} /> Entfernen
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                      <Shield size={14} strokeWidth={1.5} className="text-gray-400" />
                      <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Berechtigungsmatrix</p>
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                          <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Berechtigung</th>
                          {['Admin', 'Manager', 'Kellner'].map(r => <th key={r} className="text-center px-6 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{r}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {PERMISSIONS.map((p, i) => (
                          <tr key={i} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                            <td className="px-6 py-3 text-[14px] text-gray-700 dark:text-gray-300">{p.label}</td>
                            {[p.admin, p.manager, p.waiter].map((has, j) => (
                              <td key={j} className="px-6 py-3 text-center">
                                {has ? <Check size={16} strokeWidth={2.5} className="mx-auto" style={{ color: 'var(--ba)' }} /> : <X size={14} strokeWidth={2} className="mx-auto text-gray-300 dark:text-gray-600" />}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
              )}

              {page === 'settings' && (
                <div className="space-y-5 max-w-3xl">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">Einstellungen</p>
                  {/* Filialen anzulegen oder zu löschen ist Sache der Kette. Die
                      Filialleitung sieht ihre eigene, kann sie aber nicht ändern. */}
                  {isChainAdmin && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Building2 size={15} strokeWidth={1.5} className="text-gray-400" /> Filialen</p>
                        <button onClick={() => setBranchDialog({ branch: null })}
                          className="flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-xl text-white" style={{ backgroundColor: 'var(--ba)' }}>
                          <Plus size={12} strokeWidth={2} /> Hinzufügen
                        </button>
                      </div>
                      {store.branches.map(b => {
                        // Im Ketten-Blick sind alle Tische da; bei gewählter
                        // Filiale liefert der Server nur deren — dann steht die
                        // Zahl nur bei der eigenen.
                        const tableCount = store.tables.filter(t => t.branchId === b.id).length;
                        return (
                          <div key={b.id} className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
                            <span className="text-2xl">🏠</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-medium text-gray-900 dark:text-white">{b.name}</p>
                              <p className="text-[12px] text-gray-400 flex items-center gap-1"><MapPin size={10} />{b.address}</p>
                              {!branch && (
                                <p className="text-[11px] text-gray-400 mt-0.5">{tableCount} {tableCount === 1 ? 'Tisch' : 'Tische'}</p>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => setBranchDialog({ branch: b })} title="Filiale bearbeiten"
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={13} /></button>
                              <button title="Filiale löschen"
                                onClick={() => { if (confirm(`Filiale „${b.name}" wirklich löschen?`)) runAction(() => store.removeBranch(b.id)); }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 size={13} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                    <p className="text-[15px] font-semibold text-gray-900 dark:text-white flex items-center gap-2"><QrCode size={15} strokeWidth={1.5} className="text-gray-400" /> QR-Codes per Tisch</p>
                    <p className="text-[13px] text-gray-500 dark:text-gray-400">
                      Jeder QR-Code zeigt auf <code className="text-[12px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">/{orgSlug}/&lt;filiale&gt;/table/&lt;nummer&gt;</code> — das ist die Route, die Gäste beim Scannen öffnen. Die Filiale steht mit drin: Tisch 5 in der einen ist ein anderer Tisch als Tisch 5 in der anderen.
                    </p>
                    {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                      <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
                        <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                        <p className="text-[12px] text-amber-800 dark:text-amber-200 leading-relaxed">
                          Diese QR-Codes zeigen auf <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">localhost</code> — die funktionieren nur auf diesem Rechner, nicht wenn ein Handy sie scannt.
                          Öffne diese Admin-Seite stattdessen über die Netzwerk-Adresse deines Rechners (z. B. <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">http://192.168.x.x:5173/…</code>), dann werden die QR-Codes automatisch mit dieser Adresse erzeugt. Für den echten Einsatz später: eine öffentliche Domain statt der lokalen IP verwenden.
                        </p>
                      </div>
                    )}
                    {/* Tische und QR-Codes gehören immer GENAU einer Filiale.
                        Im Ketten-Blick gibt es deshalb nichts anzulegen — erst
                        die Filiale wählen. */}
                    {!branch ? (
                      <EmptyState icon={Building2} title="Erst eine Filiale wählen"
                        desc={'QR-Codes gehören zu einer bestimmten Filiale. Wechsle oben links von „Alle Filialen" auf eine einzelne, um ihre Tische zu sehen und neue anzulegen.'} />
                    ) : (
                      <>
                        <div className="flex items-end gap-3 flex-wrap pb-1 border-b border-gray-100 dark:border-gray-800">
                          <div>
                            <p className="text-[12px] text-gray-400 mb-1.5">Neue Tische</p>
                            <input type="number" min={1} max={50} value={addTableCount}
                              onChange={e => setAddTableCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                              className="w-24 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-700 text-[13px] text-gray-700 dark:text-gray-300 outline-none" />
                          </div>
                          <button onClick={handleAddTables} disabled={addingTables}
                            className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl text-white font-medium disabled:opacity-50 mb-0"
                            style={{ backgroundColor: 'var(--ba)' }}>
                            <Plus size={14} strokeWidth={2} /> {addingTables ? 'Wird angelegt…' : 'Tisch(e) anlegen'}
                          </button>
                          <p className="text-[11px] text-gray-400">
                            {branchTables.length} {branchTables.length === 1 ? 'Tisch' : 'Tische'} in {branch.name}
                          </p>
                        </div>
                        {branchTables.length === 0 ? (
                          <EmptyState icon={QrCode} title={`Noch keine Tische in ${branch.name}`}
                            desc="Lege oben Tische an — jeder bekommt eine eigene Nummer und einen QR-Code, der nur zu dieser Filiale führt." />
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                            {[...branchTables].sort((a, b) => a.number - b.number).map(t => (
                              <div key={t.id} className="relative bg-gray-50 dark:bg-gray-900 rounded-2xl p-4 flex flex-col items-center gap-3 border border-gray-100 dark:border-gray-800">
                                <TableQRCode orgSlug={orgSlug} branchSlug={branch.slug} tableNumber={t.number}
                                  onDelete={() => { if (confirm(`Tisch ${t.number} in ${branch.name} und seinen QR-Code wirklich löschen?`)) store.removeTable(branch.slug, t.id); }} />
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {page === 'reviews' && (
                <div className="space-y-5 max-w-3xl">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">Bewertungen</p>
                      <p className="text-[13px] text-gray-400 mt-0.5">
                        Was Gäste zu einzelnen Gerichten geschrieben haben — neueste zuerst · {branch ? branch.name : 'alle Filialen'}
                      </p>
                    </div>
                    {store.reviews.length > 0 && (
                      <button onClick={exportReviewsCsv}
                        className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 transition-colors">
                        <Download size={13} strokeWidth={1.5} /> CSV
                      </button>
                    )}
                  </div>

                  {store.reviews.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                      <EmptyState icon={MessageSquare} title="Noch keine Bewertungen"
                        desc="Sobald Gäste über den QR-Code Feedback abgeben, erscheinen die Rückmeldungen hier — inklusive der Freitexte zu einzelnen Gerichten." />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {store.reviews.map(rv => {
                        const rated = rv.dishRatings.filter(d => d.stars > 0);
                        const avg = rated.length > 0 ? rated.reduce((a, d) => a + d.stars, 0) / rated.length : 0;
                        return (
                          <div key={rv.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-gray-50 dark:border-gray-700/60 flex-wrap">
                              <div className="flex items-center gap-2.5">
                                <span className="text-[13px] font-semibold text-gray-900 dark:text-white">Tisch {rv.tableNumber}</span>
                                <span className="text-[12px] text-gray-400">
                                  {new Date(rv.createdAt).toLocaleString('de-AT', {
                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              {rated.length > 0 && (
                                <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--ba)' }}>
                                  <Star size={13} fill="currentColor" strokeWidth={0} />{avg.toFixed(1)}
                                </span>
                              )}
                            </div>

                            <div className="px-4 sm:px-5 py-3 space-y-3">
                              {rated.map(d => {
                                const dish = store.dishes.find(x => x.id === d.dishId);
                                return (
                                  <div key={d.dishId} className="flex items-start gap-3">
                                    {dish && (
                                      <img src={dish.img} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-[13px] font-medium text-gray-900 dark:text-white">
                                          {dish?.name ?? 'Gelöschtes Gericht'}
                                        </p>
                                        <StarRating value={d.stars} size={13} />
                                      </div>
                                      {d.note && (
                                        <p className="text-[13px] text-gray-600 dark:text-gray-300 mt-1 leading-relaxed border-l-2 border-gray-200 dark:border-gray-600 pl-2.5">
                                          „{d.note}"
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="px-4 sm:px-5 py-2.5 bg-gray-50 dark:bg-gray-900/40 flex gap-4 sm:gap-6 flex-wrap">
                              {([
                                ['Service', rv.overall.service],
                                ['Ambiente', rv.overall.ambience],
                                ['Tempo', rv.overall.speed],
                              ] as const).map(([label, value]) => (
                                <span key={label} className="flex items-center gap-1.5 text-[12px] text-gray-500 dark:text-gray-400">
                                  {label}
                                  <span className="font-semibold text-gray-700 dark:text-gray-200">{value > 0 ? `${value}/5` : '—'}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {page === 'menu' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">Menü</p>
                      <p className="text-[13px] text-gray-400 mt-0.5">
                        {store.dishes.length} Gerichte · {isChainAdmin
                          ? 'Stammkarte der Kette'
                          : `Verfügbarkeit in ${branch?.name ?? 'deiner Filiale'}`}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={exportDishesCsv}
                        className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 transition-colors">
                        <Download size={13} strokeWidth={1.5} /> Export
                      </button>
                      {isChainAdmin && (
                        <button onClick={() => setDishDialog({ dish: null })}
                          className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl text-white font-medium" style={{ backgroundColor: 'var(--ba)' }}>
                          <Plus size={13} strokeWidth={2} /> Gericht
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
                    <div className="mb-4">
                      <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Gerichts-Matrix</p>
                      <p className="text-[12px] text-gray-400 mt-0.5">Bewertung vs. Anzahl Rezensionen</p>
                    </div>
                    {ratedDishes.length === 0 ? (
                      <EmptyState icon={BarChart3} title="Noch keine Auswertung möglich" desc="Sobald genug Bewertungen eingehen, erscheint hier die Gerichts-Matrix." />
                    ) : (
                      <>
                        <div className="flex gap-4 text-[11px] text-gray-400 mb-4 flex-wrap">
                          {[
                            { label: 'Stars', color: 'bg-emerald-500' },
                            { label: 'Geheimtipps', color: 'bg-gray-400' },
                            { label: 'Verbesserungsbedarf', color: 'bg-amber-400' },
                            { label: 'Problemfälle', color: 'bg-red-400' },
                          ].map(q => (
                            <span key={q.label} className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${q.color}`} />{q.label}
                            </span>
                          ))}
                        </div>
                        <div style={{ height: 320 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                              <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis key="x" type="number" dataKey="avg" domain={[1, 5.2]} name="Bewertung"
                                tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                                label={{ value: 'Ø Bewertung', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#94a3b8' }} />
                              <YAxis key="y" type="number" dataKey="ratings" name="Bewertungen"
                                tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                                label={{ value: 'Anzahl', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#94a3b8' }} />
                              <ZAxis key="z" range={[60, 60]} />
                              <Tooltip key="tip" cursor={{ strokeDasharray: '3 3' }}
                                content={({ payload }) => {
                                  if (!payload?.length) return null;
                                  const d = payload[0].payload as { name: string; avg: number; ratings: number };
                                  return (
                                    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-[12px]">
                                      <p className="font-semibold text-gray-900">{d.name}</p>
                                      <p className="text-gray-500">{d.avg.toFixed(1)} ★ · {d.ratings} Bewertungen</p>
                                    </div>
                                  );
                                }} />
                              <ReferenceLine key="refx" x={3.7} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="4 3" />
                              <ReferenceLine key="refy" y={55} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="4 3" />
                              <Scatter key="scatter" data={ratedDishes.map(d => ({ name: d.name, avg: dishAvg(d) ?? 0, ratings: d.ratingsCount }))} shape={(props: any) => {
                                const { cx, cy, payload } = props;
                                const avg = payload.avg ?? 0;
                                const ratings = payload.ratings ?? 0;
                                const color = avg >= 3.7 && ratings >= 55 ? '#059669'
                                  : avg >= 3.7 ? '#9ca3af'
                                  : ratings >= 55 ? '#d97706'
                                  : '#dc2626';
                                return <circle cx={cx} cy={cy} r={9} fill={color} fillOpacity={0.85} stroke="white" strokeWidth={2} />;
                              }}>
                                {ratedDishes.map(d => <Cell key={d.id} />)}
                              </Scatter>
                            </ScatterChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                          {[
                            { q: 'Stars', desc: 'Hohe Bewertung, viele Rezensionen', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950' },
                            { q: 'Geheimtipps', desc: 'Hohe Bewertung, wenige Rezensionen', color: 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800' },
                            { q: 'Verbesserungsbedarf', desc: 'Niedrige Bewertung, viele Rezensionen', color: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950' },
                            { q: 'Problemfälle', desc: 'Niedrige Bewertung, wenige Rezensionen', color: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950' },
                          ].map(q => (
                            <div key={q.q} className={`rounded-xl px-3 py-2 ${q.color}`}>
                              <p className="font-semibold">{q.q}</p>
                              <p className="opacity-70 mt-0.5">{q.desc}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                    {store.dishes.length === 0 ? (
                      <EmptyState icon={UtensilsCrossed} title="Noch keine Gerichte"
                        desc="Lege die Karte an — jedes Gericht kann danach am Tisch einzeln bewertet werden." />
                    ) : (
                    <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                          {['#', 'Gericht', 'Kategorie', 'Ø Bewertung', 'Rezensionen', 'Preis',
                            branch ? `In ${branch.name}` : 'Filialen', 'Trend', ''].map((h, i) => (
                            <th key={i} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...store.dishes].sort((a, b) => (dishAvg(b) ?? 0) - (dishAvg(a) ?? 0)).map((dish, i) => {
                          const avg = dishAvg(dish) ?? 0;
                          const scoreColor = avg >= 4 ? 'text-emerald-700 dark:text-emerald-300' : avg >= 3 ? 'text-amber-700 dark:text-amber-300' : 'text-red-600 dark:text-red-400';
                          const scoreBg = avg >= 4 ? 'bg-emerald-50 dark:bg-emerald-950' : avg >= 3 ? 'bg-amber-50 dark:bg-amber-950' : 'bg-red-50 dark:bg-red-950';
                          const TrendIcon = avg >= 4.4 ? TrendingUp : (avg > 0 && avg < 3) ? TrendingDown : null;
                          const trendColor = avg >= 4.4 ? 'text-gray-500' : 'text-red-500';
                          return (
                            <tr key={dish.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                              <td className="px-5 py-3.5 text-[13px] text-gray-400">{i + 1}</td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <DishImageUpload dish={dish} size={36} />
                                  <p className="text-[14px] font-medium text-gray-900 dark:text-white">{dish.name}</p>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="text-[11px] px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{dish.cat}</span>
                              </td>
                              <td className="px-5 py-3.5">
                                {dish.ratingsCount > 0 ? (
                                  <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-2.5 py-1 rounded-lg ${scoreColor} ${scoreBg}`}>
                                    <Star size={11} fill="currentColor" strokeWidth={0} />{avg.toFixed(1)}
                                  </span>
                                ) : <span className="text-[12px] text-gray-400">Noch keine</span>}
                              </td>
                              <td className="px-5 py-3.5 text-[14px] text-gray-600 dark:text-gray-400">{dish.ratingsCount}</td>
                              <td className="px-5 py-3.5 text-[14px] text-gray-600 dark:text-gray-400">{dish.price.toFixed(2)} €</td>
                              {/* Bei gewählter Filiale ein Schalter für genau
                                  diese; im Ketten-Blick nur die Übersicht, wo
                                  das Gericht geführt wird. */}
                              <td className="px-5 py-3.5">
                                {branch ? (
                                  <DishAvailabilityToggle dish={dish} branch={branch} />
                                ) : dish.branchIds == null ? (
                                  <span className="text-[12px] text-gray-400">Alle</span>
                                ) : (
                                  <span className="text-[11px] px-2 py-1 rounded-full font-medium bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                    {dish.branchIds.length} von {store.branches.length}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                {TrendIcon ? <TrendIcon size={16} className={trendColor} strokeWidth={2} /> : <span className="w-4 h-0.5 bg-gray-200 dark:bg-gray-700 inline-block rounded-full" />}
                              </td>
                              <td className="px-5 py-3.5">
                                {/* Stammdaten ändern darf nur die Kette — die
                                    Filialleitung hat den Schalter links. */}
                                {isChainAdmin && (
                                  <div className="flex gap-1 justify-end">
                                    <button onClick={() => setDishDialog({ dish })} title="Gericht bearbeiten"
                                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={13} /></button>
                                    <button title="Gericht löschen"
                                      onClick={() => { if (confirm(`„${dish.name}" wirklich aus dem Menü löschen? Bereits abgegebene Bewertungen bleiben erhalten.`)) runAction(() => store.removeDish(dish.id)); }}
                                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 size={13} /></button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                    )}
                  </div>
                </div>
              )}

              {page === 'redemptions' && (
                <div className="space-y-5 max-w-4xl">
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">Einlösungen</p>
                    <p className="text-[13px] text-gray-400 mt-0.5">
                      Wer wann welchen Gutschein eingelöst hat · {branch ? branch.name : 'alle Filialen'}
                    </p>
                  </div>

                  {/* Kennzahlen: nur eingelöste zählen als Umsatzwirkung —
                      verfallene und abgebrochene wurden zurückgebucht. */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {([
                      ['Eingelöst', store.redemptions.filter(r => r.status === 'eingelöst').length, 'text-emerald-700 dark:text-emerald-300'],
                      ['Punkte verbraucht', store.redemptions.filter(r => r.status === 'eingelöst').reduce((a, r) => a + r.points, 0), 'text-gray-900 dark:text-white'],
                      ['Verfallen', store.redemptions.filter(r => r.status === 'verfallen').length, 'text-gray-500'],
                      ['Abgebrochen', store.redemptions.filter(r => r.status === 'abgebrochen').length, 'text-gray-500'],
                    ] as const).map(([label, value, cls]) => (
                      <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">{label}</p>
                        <p className={`text-2xl font-bold mt-1 ${cls}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                    {store.redemptions.length === 0 ? (
                      <EmptyState icon={Ticket} title="Noch keine Einlösungen"
                        desc="Sobald ein Gast einen Gutschein am Tisch einlöst, erscheint er hier — mit Zeitpunkt, Tisch und der Servicekraft, die quittiert hat." />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                              {['Gutschein', 'Status', 'Tisch', 'Punkte', 'Wann', 'Quittiert von'].map(h => (
                                <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {store.redemptions.map(r => {
                              const badge = r.status === 'eingelöst'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : r.status === 'offen'
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
                              return (
                                <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                                  <td className="px-5 py-3.5 text-[14px] font-medium text-gray-900 dark:text-white">{r.voucherTitle}</td>
                                  <td className="px-5 py-3.5">
                                    <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${badge}`}>{r.status}</span>
                                  </td>
                                  <td className="px-5 py-3.5 text-[14px] text-gray-600 dark:text-gray-400">{r.tableNumber ?? '—'}</td>
                                  <td className="px-5 py-3.5 text-[14px] text-gray-600 dark:text-gray-400">{r.points}</td>
                                  <td className="px-5 py-3.5 text-[13px] text-gray-500 dark:text-gray-400">
                                    {new Date(r.redeemedAt ?? r.createdAt).toLocaleString('de-AT', {
                                      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                                    })}
                                  </td>
                                  <td className="px-5 py-3.5 text-[13px] text-gray-500 dark:text-gray-400">{r.confirmedByName ?? '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {page === 'vouchers' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">Gutscheine</p>
                      <p className="text-[13px] text-gray-400 mt-0.5">
                        Was Gäste für ihre gesammelten Punkte einlösen können
                      </p>
                    </div>
                    <button onClick={() => setVoucherDialog({ voucher: null })}
                      className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl text-white font-medium" style={{ backgroundColor: 'var(--ba)' }}>
                      <Plus size={13} strokeWidth={2} /> Gutschein
                    </button>
                  </div>

                  {store.vouchers.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                      <EmptyState icon={Ticket} title="Noch keine Gutscheine"
                        desc="Ohne Gutscheine haben gesammelte Punkte keinen Gegenwert. Lege eine erste Belohnung an." />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {[...store.vouchers].sort((a, b) => a.points - b.points).map(v => {
                        const redeemed = store.guest.redeemed.includes(v.id);
                        return (
                          <div key={v.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="h-28 bg-gray-100 dark:bg-gray-900">
                              <img src={v.img} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="p-4 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[14px] font-semibold text-gray-900 dark:text-white leading-snug">{v.title}</p>
                                <span className="text-[11px] px-2 py-1 rounded-full font-medium text-white flex-shrink-0" style={{ backgroundColor: 'var(--ba)' }}>{v.points} P</span>
                              </div>
                              <p className="text-[12px] text-gray-400 flex items-center gap-1.5">
                                <Clock size={11} strokeWidth={1.5} /> Gültig bis {v.expiry}
                                {redeemed && <span className="text-emerald-600 dark:text-emerald-400 ml-1">· eingelöst</span>}
                              </p>
                              <p className="text-[12px] text-gray-400 flex items-center gap-1.5">
                                <Building2 size={11} strokeWidth={1.5} />
                                {v.branchIds == null
                                  ? 'In allen Filialen'
                                  : v.branchIds.map(id => store.branches.find(b => b.id === id)?.name ?? '?').join(', ')}
                              </p>
                              <div className="flex gap-1 pt-1">
                                <button onClick={() => setVoucherDialog({ voucher: v })} title="Gutschein bearbeiten"
                                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={13} /></button>
                                <button title="Gutschein löschen"
                                  onClick={() => { if (confirm(`„${v.title}" wirklich löschen?`)) runAction(() => store.removeVoucher(v.id)); }}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 size={13} /></button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
          </>
        </main>
      </div>

      <AnimatePresence>
        {dishDialog && <DishDialog dish={dishDialog.dish} onClose={() => setDishDialog(null)} />}
        {voucherDialog && <VoucherDialog voucher={voucherDialog.voucher} onClose={() => setVoucherDialog(null)} />}
        {branchDialog && <BranchDialog branch={branchDialog.branch} onClose={() => setBranchDialog(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showInvite && (
          <>
            <motion.div className="fixed inset-0 bg-black/50 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowInvite(false)} />
            <motion.div className="fixed inset-0 flex items-center justify-center z-50 p-4 sm:p-8"
              initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}>
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[18px] font-semibold text-gray-900 dark:text-white">Benutzer einladen</p>
                  <button onClick={() => setShowInvite(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} className="text-gray-500" /></button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] text-gray-500 mb-1 block">Name</label>
                    <input value={inviteForm.name} onChange={e => setInviteForm(p => ({ ...p, name: e.target.value }))} placeholder="Max Mustermann" type="text"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[14px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors" />
                  </div>
                  <div>
                    <label className="text-[12px] text-gray-500 mb-1 block">E-Mail</label>
                    <input value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))} placeholder="name@restaurant.at" type="email"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[14px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors" />
                  </div>
                  {/* Die Filialleitung darf nur Servicekräfte und nur in der
                      eigenen Filiale anlegen. Der Server erzwingt das ohnehin
                      (POST /users); hier gar nicht erst anzubieten erspart die
                      Fehlermeldung. */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[12px] text-gray-500 mb-1 block">Rolle</label>
                      <select value={inviteForm.role} onChange={e => setInviteForm(p => ({ ...p, role: e.target.value as AdminUser['role'] }))}
                        disabled={!isChainAdmin}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[13px] text-gray-700 dark:text-gray-300 outline-none disabled:opacity-60">
                        {(isChainAdmin ? ['Kellner', 'Manager', 'Admin'] : ['Kellner']).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[12px] text-gray-500 mb-1 block">Filiale</label>
                      <select value={inviteForm.branchId} onChange={e => setInviteForm(p => ({ ...p, branchId: e.target.value }))}
                        disabled={!isChainAdmin}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[13px] text-gray-700 dark:text-gray-300 outline-none disabled:opacity-60">
                        {isChainAdmin
                          ? store.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                          : <option value="">{store.branches.find(b => b.id === store.authUser?.branchId)?.name ?? 'Eigene Filiale'}</option>}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[12px] text-gray-500 mb-1 block">Erstes Passwort (mind. 8 Zeichen)</label>
                    <input value={inviteForm.password} onChange={e => setInviteForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="wird beim Anlegen gesetzt" type="text" autoComplete="off"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[14px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors" />
                    <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                      Es wird keine E-Mail verschickt — gib das Passwort persönlich weiter.
                      Die Person meldet sich damit und der E-Mail-Adresse an; ändern lässt es
                      sich hier jederzeit wieder.
                    </p>
                  </div>
                </div>
                {inviteError && <p className="text-[13px] text-red-600 dark:text-red-400">{inviteError}</p>}
                <div className="flex gap-3 pt-1">
                  <SecondaryBtn onClick={() => { setShowInvite(false); setInviteError(null); }}>Abbrechen</SecondaryBtn>
                  <PrimaryBtn onClick={handleInviteSubmit}>Benutzer anlegen</PrimaryBtn>
                </div>
              </div>
            </motion.div>
          </>
        )}

        {pwDialog && (
          <>
            <motion.div className="fixed inset-0 bg-black/50 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPwDialog(null)} />
            <motion.div className="fixed inset-0 flex items-center justify-center z-50 p-4 sm:p-8"
              initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}>
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[18px] font-semibold text-gray-900 dark:text-white">
                    {pwDialog.user.status === 'eingeladen' ? 'Konto freischalten' : 'Passwort ändern'}
                  </p>
                  <button onClick={() => setPwDialog(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} className="text-gray-500" /></button>
                </div>
                <p className="text-[13px] text-gray-500 dark:text-gray-400">{pwDialog.user.name} · {pwDialog.user.email}</p>
                <div>
                  <label className="text-[12px] text-gray-500 mb-1 block">Neues Passwort (mind. 8 Zeichen)</label>
                  <input value={pwDialog.value} autoFocus type="text" autoComplete="off"
                    onChange={e => setPwDialog(p => p && { ...p, value: e.target.value, error: null })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[14px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors" />
                  <p className="text-[11px] text-gray-400 mt-1.5">Gib es der Person persönlich weiter — verschickt wird nichts.</p>
                </div>
                {pwDialog.error && <p className="text-[13px] text-red-600 dark:text-red-400">{pwDialog.error}</p>}
                <div className="flex gap-3 pt-1">
                  <SecondaryBtn onClick={() => setPwDialog(null)}>Abbrechen</SecondaryBtn>
                  <PrimaryBtn onClick={handleSetPassword}>Speichern</PrimaryBtn>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ROOT / ROUTING
// ═══════════════════════════════════════════════════════════

type View = 'guest' | 'waiter' | 'admin';

/**
 * Der frühere Rollenwechsler ist bewusst entfernt: welche Ansicht jemand sieht,
 * ergibt sich jetzt aus der Anmeldung, nicht aus einem Umschalter. Übrig bleibt
 * die Kennung des angemeldeten Mitarbeiters mit Abmelden-Schaltfläche.
 */
function TopBar({ dark, setDark }: {
  dark: boolean; setDark: (fn: (p: boolean) => boolean) => void;
}) {
  const { authUser, logout } = useStore();
  return (
    // Am Handy nur Symbole: mit ausgeschriebenen Beschriftungen war diese Zeile
    // breiter als der Bildschirm und hat die ganze Seite seitlich scrollbar gemacht.
    <div className="bg-gray-950 text-white px-3 sm:px-4 h-10 flex items-center gap-2 sm:gap-3 text-[12px] sticky top-0 z-50 overflow-hidden">
      <span className="font-semibold tracking-tight text-white flex-shrink-0">Bitely</span>
      {authUser && (
        <>
          <span className="hidden sm:inline text-gray-700 mx-1">|</span>
          <span className="text-gray-400 truncate">
            {authUser.name}
            <span className="hidden sm:inline text-gray-600"> · {authUser.role}</span>
          </span>
        </>
      )}
      <div className="ml-auto flex items-center gap-2 flex-shrink-0">
        <button onClick={() => setDark(p => !p)} title={dark ? 'Hell' : 'Dunkel'}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-gray-400 hover:text-gray-200 bg-gray-900 transition-colors">
          {dark ? <Sun size={12} /> : <Moon size={12} />}
          <span className="hidden sm:inline">{dark ? 'Hell' : 'Dunkel'}</span>
        </button>
        {authUser && (
          <button onClick={logout} title="Abmelden"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-gray-400 hover:text-gray-200 bg-gray-900 transition-colors">
            <LogOut size={12} />
            <span className="hidden sm:inline">Abmelden</span>
          </button>
        )}
      </div>
    </div>
  );
}

function OrgShell({ view }: { view: View }) {
  const { orgSlug, branchSlug, tableNumber } = useParams<{ orgSlug: string; branchSlug?: string; tableNumber?: string }>();
  // Die Filialwahl liegt ÜBER dem Store: sie bestimmt, was er überhaupt lädt.
  // null = noch nichts gewählt, dann entscheidet der Server anhand des Kontos.
  const [picked, setPicked] = useState<string | 'all' | null>(null);

  if (!orgSlug) return <FullScreenMessage error>Keine Organisation angegeben.</FullScreenMessage>;

  const scope: BranchScope = view === 'guest' ? (branchSlug ?? null) : (picked ?? 'self');

  return (
    <StoreProvider orgSlug={orgSlug} scope={scope}>
      <OrgChrome view={view} orgSlug={orgSlug} branchSlug={branchSlug ?? null}
        tableNumber={tableNumber ? Number(tableNumber) : null}
        picked={picked} onPick={setPicked} />
    </StoreProvider>
  );
}

function OrgChrome({ view, orgSlug, branchSlug, tableNumber, picked, onPick }: {
  view: View; orgSlug: string; branchSlug: string | null; tableNumber: number | null;
  picked: string | 'all' | null; onPick: (p: string | 'all') => void;
}) {
  const store = useStore();
  const [dark, setDark] = useState(false);
  useGoogleFont(store.brand?.font);

  const needsLogin = view === 'admin' || view === 'waiter';

  // Die Anmeldung wird VOR dem Zustand geprüft: ohne Konto lehnt /state für
  // Mitarbeiteransichten ab, und diese Absage soll als Login-Maske erscheinen,
  // nicht als Serverfehler.
  //
  // Die Prüfung hier ersetzt NICHT den Schutz auf dem Server (requireAuth) —
  // sie verhindert nur, dass jemand eine Ansicht sieht, deren Schaltflächen
  // ohnehin mit 401/403 abgewiesen würden.
  if (needsLogin) {
    if (store.authLoading) return <FullScreenMessage>Anmeldung wird geprüft…</FullScreenMessage>;
    if (!store.authUser) {
      return (
        <div className={dark ? 'dark' : ''}>
          <TopBar dark={dark} setDark={setDark} />
          <LoginScreen
            title={view === 'admin' ? 'Verwaltung' : 'Servicekraft-Bereich'}
            hint="Bitte mit deinem Mitarbeiterkonto anmelden."
          />
        </div>
      );
    }
    if (view === 'admin' && !isAdminRole(store.authUser.role)) {
      return (
        <div className={dark ? 'dark' : ''}>
          <TopBar dark={dark} setDark={setDark} />
          <FullScreenMessage error action={
            <Link to={`/${orgSlug}/staff`} className="px-4 py-2 rounded-xl text-white text-[13px]" style={{ backgroundColor: '#16A34A' }}>
              Zur Tischübersicht
            </Link>
          }>
            Als {store.authUser.role} hast du auf die Verwaltung keinen Zugriff.
          </FullScreenMessage>
        </div>
      );
    }
  }

  if (store.loading) return <FullScreenMessage>Lädt Restaurantdaten…</FullScreenMessage>;
  if (store.error) {
    return (
      <FullScreenMessage error action={
        <button onClick={() => store.refresh()} className="px-4 py-2 rounded-xl text-white text-[13px]" style={{ backgroundColor: '#16A34A' }}>Erneut versuchen</button>
      }>
        {store.error}
      </FullScreenMessage>
    );
  }
  if (!store.brand) {
    return (
      <FullScreenMessage error>
        Organisation "{orgSlug}" wurde nicht gefunden. Wurde <code>npm run server:seed</code> schon ausgeführt?
      </FullScreenMessage>
    );
  }

  // ── Welche Filiale gilt in dieser Ansicht? ──
  // Gast: aus dem QR-Link. Wer im Konto eine feste Filiale hat, ist daran
  // gebunden — kein Umschalter. Nur der Ketten-Admin wählt frei; null heißt
  // bei ihm "alle Filialen" (Roll-up).
  const boundBranch = store.authUser?.branchId
    ? store.branches.find(b => b.id === store.authUser!.branchId) ?? null
    : null;
  const canSwitchBranch = !boundBranch && view !== 'guest';

  const branch: Branch | null = view === 'guest'
    ? store.branches.find(b => b.slug === branchSlug) ?? null
    : boundBranch ?? (picked && picked !== 'all' ? store.branches.find(b => b.slug === picked) ?? null : null);

  // Der Gast braucht zwingend eine gültige Filiale; die Kellneransicht auch,
  // weil jede Tischaktion sie in der Adresse trägt.
  if (!branch && (view === 'guest' || view === 'waiter')) {
    const firstBranch = store.branches[0];
    if (view === 'waiter' && firstBranch) {
      return (
        <div className={dark ? 'dark' : ''}>
          <TopBar dark={dark} setDark={setDark} />
          <BranchPicker branches={store.branches} onPick={onPick} />
        </div>
      );
    }
    return (
      <div className={dark ? 'dark' : ''}>
        <TopBar dark={dark} setDark={setDark} />
        <FullScreenMessage error>
          {view === 'guest'
            ? `Die Filiale "${branchSlug}" gibt es nicht. Bitte scanne den QR-Code am Tisch erneut.`
            : 'Für diese Organisation ist noch keine Filiale angelegt.'}
        </FullScreenMessage>
      </div>
    );
  }

  return (
    <div className={dark ? 'dark' : ''} style={{ fontFamily: `'${store.brand.font ?? 'Inter'}', system-ui, sans-serif`, '--ba': store.brand.accent } as React.CSSProperties}>
      <TopBar dark={dark} setDark={setDark} />

      {view === 'guest' && branch && (
        // Mobil (der eigentliche Anwendungsfall über QR-Code): randlos, bildschirmfüllend,
        // kein Geräte-Mockup. Ab sm-Breakpoint (Desktop-Vorschau): zentrierte Karte.
        <div className="h-[calc(100dvh-40px)] overflow-hidden sm:h-auto sm:min-h-[calc(100dvh-40px)] sm:overflow-visible bg-[#F7F8FA] dark:bg-[#0D1117] sm:bg-gray-200 sm:dark:bg-gray-950 flex justify-center sm:py-8 sm:px-4">
          <div className="w-full h-full flex flex-col overflow-hidden sm:w-full sm:max-w-[420px] sm:h-[calc(100dvh-64px)] sm:rounded-[28px] sm:shadow-xl sm:border sm:border-gray-200 dark:sm:border-gray-800 bg-[#F7F8FA] dark:bg-[#0D1117]">
            <GuestApp branch={branch} tableNumber={tableNumber ?? 1} />
          </div>
        </div>
      )}

      {view === 'waiter' && branch && <WaiterApp branch={branch} />}
      {view === 'admin' && (
        <AdminApp orgSlug={orgSlug} branch={branch} canSwitchBranch={canSwitchBranch}
          onPick={onPick} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GUTSCHEIN EINLÖSEN (Gast)
//
// Zwei Schritte: wischen (bewusste Geste statt Tipp), dann Countdown mit
// Code. Quittiert wird in der Kellner-App — deshalb nützt ein Screenshot
// dieses Bildschirms nichts.
// ═══════════════════════════════════════════════════════════

/** Sekunden bis zum Ablauf, tickt selbstständig herunter. */
function useCountdown(expiresAt: number | null): number {
  const [left, setLeft] = useState(() =>
    expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) : 0);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [expiresAt]);

  return left;
}

/**
 * Der Einlöse-Bildschirm: Code, Countdown-Ring, und was die Servicekraft tun
 * soll. Sobald sie in ihrer App quittiert, wechselt der Zustand von selbst —
 * `redemption` kommt aus dem Server-Zustand, nicht aus lokalem Raten.
 */
/**
 * Lädt Googles Anmelde-Skript — aber nur, wenn der Server eine Client-ID
 * hinterlegt hat. Ohne sie erscheint der Knopf gar nicht erst, statt beim
 * Antippen mit einem Fehler zu enden.
 */
function useGoogleSignIn(clientId: string | null, onCredential: (credential: string) => void) {
  const buttonRef = useRef<HTMLDivElement>(null);
  // In einer Ref, damit ein neu erzeugter Callback nicht das ganze Skript neu lädt.
  const handler = useRef(onCredential);
  handler.current = onCredential;

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;
    let cancelled = false;

    const render = () => {
      const google = (window as unknown as { google?: any }).google;
      if (cancelled || !google?.accounts?.id || !buttonRef.current) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (res: { credential?: string }) => {
          if (res.credential) handler.current(res.credential);
        },
      });
      google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline', size: 'large', width: 280, text: 'continue_with', locale: 'de',
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-google-signin]');
    if (existing) { existing.addEventListener('load', render); render(); }
    else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleSignin = 'true';
      script.addEventListener('load', render);
      document.head.appendChild(script);
    }
    return () => { cancelled = true; };
  }, [clientId]);

  return buttonRef;
}

/**
 * Anmelden oder Konto anlegen — als GAST, nicht als Personal. Die beiden
 * Sitzungen sind getrennt (eigener Token-Typ, siehe auth.ts), damit ein
 * Gastkonto nie an die Kellner- oder Adminrouten kommt.
 */
function GuestAuthSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hat nicht geklappt. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  };

  const googleRef = useGoogleSignIn(
    store.guestAuthOptions.google ? store.guestAuthOptions.googleClientId : null,
    credential => { run(() => store.guestGoogleLogin(credential)); }
  );

  const submit = () => run(() => mode === 'login'
    ? store.guestLogin(form.email.trim(), form.password)
    : store.guestRegister(form.email.trim(), form.name.trim(), form.password));

  const field = 'w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[15px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors';

  return (
    <>
      <motion.div className="fixed inset-0 bg-black/50 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl z-50 max-h-[92vh] overflow-y-auto"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
        <div className="p-5 pb-8 space-y-4">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto" />
          <div className="text-center">
            <p className="text-[19px] font-bold text-gray-900 dark:text-white">
              {mode === 'login' ? 'Willkommen zurück' : 'Punkte dauerhaft sichern'}
            </p>
            <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed max-w-[300px] mx-auto">
              Deine Punkte hängen an deinem Konto — damit sind sie auf jedem Gerät da,
              auch beim nächsten Besuch.
            </p>
          </div>

          {store.guestAuthOptions.google && (
            <div className="flex flex-col items-center gap-3">
              <div ref={googleRef} />
              <div className="flex items-center gap-3 w-full">
                <span className="h-px bg-gray-200 dark:bg-gray-700 flex-1" />
                <span className="text-[12px] text-gray-400">oder</span>
                <span className="h-px bg-gray-200 dark:bg-gray-700 flex-1" />
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            {mode === 'register' && (
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Dein Name" type="text" className={field} />
            )}
            <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="E-Mail" type="email" autoComplete="email" className={field} />
            <input value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder={mode === 'login' ? 'Passwort' : 'Passwort (mind. 8 Zeichen)'}
              type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className={field} />
          </div>

          {error && <p className="text-[13px] text-red-600 dark:text-red-400 text-center">{error}</p>}

          <PrimaryBtn onClick={submit}>
            {busy ? 'Einen Moment…' : mode === 'login' ? 'Anmelden' : 'Konto anlegen'}
          </PrimaryBtn>

          <button onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(null); }}
            className="w-full text-[13px] text-gray-500 dark:text-gray-400 py-1">
            {mode === 'login' ? 'Noch kein Konto? Jetzt anlegen' : 'Schon ein Konto? Anmelden'}
          </button>
          <button onClick={onClose} className="w-full text-[13px] text-gray-400 py-1">
            Ohne Konto weiter
          </button>
        </div>
      </motion.div>
    </>
  );
}

function RedemptionSheet({ branch, voucher, tableNumber, onClose }: {
  branch: Branch; voucher: Voucher; tableNumber: number; onClose: () => void;
}) {
  const store = useStore();
  const [started, setStarted] = useState<Redemption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Immer den Server-Stand nehmen, falls vorhanden: die Servicekraft quittiert
  // in ihrer App, und das erfahren wir nur über den Zustand.
  const live = started ? store.redemptions.find(r => r.id === started.id) ?? started : null;
  // Der Code steht NICHT im Zustand, den der Gast lädt — sonst könnte jeder
  // fremde Einlösungen abbrechen. Er kommt aus der Antwort auf das Eröffnen.
  const code = started?.code ?? '';
  const secondsLeft = useCountdown(live && live.status === 'offen' ? live.expiresAt : null);

  // Solange der Countdown läuft, regelmäßig nachfragen — sonst merkt der Gast
  // nicht, dass quittiert wurde.
  useEffect(() => {
    if (!live || live.status !== 'offen') return;
    const iv = setInterval(() => { store.refresh(); }, 2500);
    return () => clearInterval(iv);
  }, [live?.id, live?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await store.startRedemption(branch.slug, voucher.id, tableNumber);
    if (result.ok) setStarted(result.redemption);
    else setError(result.error);
    setBusy(false);
  };

  const cancel = async () => {
    if (live && live.status === 'offen') {
      try { await store.cancelRedemption(branch.slug, live.id, code); } catch { /* egal */ }
    }
    onClose();
  };

  const total = Math.max(1, Math.round((live ? live.expiresAt - live.createdAt : 60000) / 1000));
  const ring = live ? secondsLeft / total : 1;

  return (
    <>
      <motion.div className="fixed inset-0 bg-black/50 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={live?.status === 'offen' ? undefined : onClose} />
      <motion.div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl z-50 max-h-[92vh] overflow-y-auto"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
        <div className="p-5 pb-8">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-5" />

          {/* ── Schritt 1: wischen ── */}
          {!live && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-[19px] font-bold text-gray-900 dark:text-white">{voucher.title}</p>
                <p className="text-[13px] text-gray-400 mt-1">{voucher.points} Punkte · {branch.name}</p>
              </div>
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-2xl px-4 py-3">
                <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                <p className="text-[13px] text-amber-900 dark:text-amber-200 leading-relaxed">
                  Erst einlösen, wenn die Servicekraft neben dir steht. Der Gutschein
                  ist danach <strong>60 Sekunden</strong> gültig und verfällt.
                </p>
              </div>
              {error && <p className="text-[13px] text-red-600 dark:text-red-400 text-center">{error}</p>}
              <SwipeToRedeem onRedeem={start} redeemed={busy} />
              <button onClick={onClose} className="w-full text-[13px] py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                Abbrechen
              </button>
            </div>
          )}

          {/* ── Schritt 2: Countdown, bis die Servicekraft quittiert ── */}
          {live?.status === 'offen' && (
            <div className="space-y-5 text-center">
              <div className="relative w-40 h-40 mx-auto">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="45" fill="none" strokeWidth="6" className="stroke-gray-100 dark:stroke-gray-800" />
                  <circle cx="50" cy="50" r="45" fill="none" strokeWidth="6" strokeLinecap="round"
                    stroke="var(--ba, #16A34A)" strokeDasharray={2 * Math.PI * 45}
                    strokeDashoffset={2 * Math.PI * 45 * (1 - ring)}
                    style={{ transition: 'stroke-dashoffset 0.25s linear' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <motion.p key={code} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                    className="text-[34px] font-bold tracking-[0.12em] text-gray-900 dark:text-white tabular-nums">
                    {code}
                  </motion.p>
                  <p className="text-[12px] text-gray-400 mt-0.5 tabular-nums">noch {secondsLeft} s</p>
                </div>
              </div>

              <div>
                <p className="text-[17px] font-semibold text-gray-900 dark:text-white">{live.voucherTitle}</p>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed max-w-[280px] mx-auto">
                  Zeig diesen Bildschirm der Servicekraft. Sie bestätigt die Einlösung
                  in ihrer eigenen App — ein Screenshot funktioniert nicht.
                </p>
              </div>

              <button onClick={cancel}
                className="w-full py-3 rounded-xl text-[14px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800">
                Doch nicht einlösen
              </button>
            </div>
          )}

          {/* ── Schritt 3: quittiert ── */}
          {live?.status === 'eingelöst' && (
            <div className="space-y-4 text-center py-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 16 }}
                className="w-20 h-20 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                <Check size={40} className="text-white" strokeWidth={3} />
              </motion.div>
              <div>
                <p className="text-[19px] font-bold text-gray-900 dark:text-white">Eingelöst</p>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">
                  {live.voucherTitle}
                  {live.confirmedByName && <> · bestätigt von {live.confirmedByName}</>}
                </p>
              </div>
              <PrimaryBtn onClick={onClose}>Fertig</PrimaryBtn>
            </div>
          )}

          {/* ── Verfallen oder abgebrochen ── */}
          {live && (live.status === 'verfallen' || live.status === 'abgebrochen') && (
            <div className="space-y-4 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mx-auto flex items-center justify-center">
                <Clock size={28} className="text-gray-400" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-[17px] font-semibold text-gray-900 dark:text-white">
                  {live.status === 'verfallen' ? 'Zeit abgelaufen' : 'Abgebrochen'}
                </p>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">
                  Deine {live.points} Punkte sind zurück auf dem Konto. Du kannst es
                  jederzeit erneut versuchen.
                </p>
              </div>
              <PrimaryBtn onClick={onClose}>Schließen</PrimaryBtn>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

/**
 * Laufende Einlösung in der Kellner-App. Der Code steht hier, damit die
 * Servicekraft ihn mit dem Display des Gastes vergleichen kann — quittiert
 * wird aber hier, weshalb ein Screenshot des Gastes nichts ausrichtet.
 */
function RedemptionBanner({ redemption, branch }: { redemption: Redemption; branch: Branch }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secondsLeft = useCountdown(redemption.expiresAt);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.confirmRedemption(branch.slug, redemption.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quittieren fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ y: -56 }} animate={{ y: 0 }} exit={{ y: -56 }}
      className="bg-emerald-50 dark:bg-emerald-950 border-b border-emerald-200 dark:border-emerald-900 px-5 py-2.5 flex items-center gap-3 z-40 relative flex-wrap">
      <Ticket size={16} className="text-emerald-700 dark:text-emerald-400 flex-shrink-0" />
      <p className="text-[13px] text-emerald-900 dark:text-emerald-200 flex-1 min-w-[200px]">
        {redemption.tableNumber != null && <>Tisch {redemption.tableNumber} · </>}
        <strong>{redemption.voucherTitle}</strong> · Code{' '}
        <span className="font-mono font-bold tracking-wider">{redemption.code}</span>
        <span className="text-emerald-700/70 dark:text-emerald-400/70 tabular-nums"> · noch {secondsLeft} s</span>
      </p>
      {error && <span className="text-[12px] text-red-600 dark:text-red-400">{error}</span>}
      <button onClick={confirm} disabled={busy || secondsLeft === 0}
        className="flex-shrink-0 px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: '#059669' }}>
        {busy ? 'Wird quittiert…' : 'Eingelöst'}
      </button>
    </motion.div>
  );
}

/**
 * Führt diese Filiale das Gericht? Der Schalter der Filialleitung — die
 * Stammdaten (Name, Preis, Foto) bleiben Sache der Kette.
 */
function DishAvailabilityToggle({ dish, branch }: { dish: Dish; branch: Branch }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = availableIn(dish, branch.id);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.setDishAvailability(branch.slug, dish.id, !active);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Umschalten fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button onClick={toggle} disabled={busy} role="switch" aria-checked={active}
        title={active ? `In ${branch.name} nicht mehr führen` : `In ${branch.name} führen`}
        className={`w-9 h-5 rounded-full relative transition-colors disabled:opacity-50 ${active ? '' : 'bg-gray-200 dark:bg-gray-700'}`}
        style={active ? { backgroundColor: 'var(--ba, #16A34A)' } : undefined}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${active ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
      {error && <p className="text-[11px] text-red-500 mt-1 max-w-[160px]">{error}</p>}
    </div>
  );
}

/** Filialwahl für den Ketten-Admin, der die Kellneransicht öffnet. */
function BranchPicker({ branches, onPick }: { branches: Branch[]; onPick: (slug: string) => void }) {
  return (
    <div className="min-h-[calc(100dvh-40px)] flex items-center justify-center p-4 bg-[#F7F8FA] dark:bg-[#0D1117]">
      <div className="w-full max-w-sm">
        <p className="text-[17px] font-semibold text-gray-900 dark:text-white mb-1">Filiale wählen</p>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-4">
          Dein Konto ist an keine Filiale gebunden — wähle, an welcher du arbeiten möchtest.
        </p>
        <div className="space-y-2">
          {branches.map(b => (
            <button key={b.id} onClick={() => onPick(b.slug)}
              className="w-full flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600 transition-colors text-left">
              <Building2 size={16} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-[14px] font-medium text-gray-900 dark:text-white">{b.name}</p>
                <p className="text-[12px] text-gray-400">{b.address}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/sakura-sushi/herrengasse/table/4" replace />} />
        <Route path="/:orgSlug/:branchSlug/table/:tableNumber" element={<OrgShell view="guest" />} />
        <Route path="/:orgSlug/staff" element={<OrgShell view="waiter" />} />
        <Route path="/:orgSlug/admin" element={<OrgShell view="admin" />} />
        {/* Die alte, filiallose QR-Route. Kein Redirect: ohne Filiale ist nicht
            entscheidbar, welcher Tisch 5 gemeint ist. Eine eigene Meldung, damit
            ein alter Ausdruck nicht wie ein kaputter Server aussieht. */}
        <Route path="/:orgSlug/table/:tableNumber" element={
          <FullScreenMessage error>
            Dieser QR-Code ist veraltet — er nennt keine Filiale. Bitte verwende den neuen Code am Tisch.
          </FullScreenMessage>
        } />
        <Route path="*" element={<FullScreenMessage error>Seite nicht gefunden.</FullScreenMessage>} />
      </Routes>
    </BrowserRouter>
  );
}
