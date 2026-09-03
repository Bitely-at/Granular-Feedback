import { useState, useEffect, useRef, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import {
  Star, Search, Camera, Check, ChevronLeft, Plus, Minus, X,
  LayoutDashboard, UtensilsCrossed, Users, Settings,
  MoreHorizontal, Download, QrCode, Pencil, AlertTriangle, TrendingUp,
  TrendingDown, Sun, Moon, ChevronDown, Clock, CheckCircle2,
  Shield, LogOut, Upload, Palette, MapPin, Zap, BarChart3, Menu,
  Trash2, UserPlus, Lock, Building2, ImagePlus,
  AlertOctagon, Loader2, MessageSquare, Ticket, ArrowRight,
  Mail, User, WifiOff, RefreshCw,
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Bar, Line, ScatterChart, Scatter, ZAxis, ReferenceLine,
} from 'recharts';
import {
  StoreProvider, useStore, dishAvg, sinceLabel, tableItemCount, compressImageFile, isAdminRole,
  BRAND_FONTS, BRAND_CARD_STYLES,
  availableIn, voucherExpired, pointsFor,
  type Dish, type TableRow, type Voucher, type AdminUser, type Alert, type DishRatingInput, type Brand,
  type Branch, type BranchScope, type Redemption, type PointsRule,
  // Highlight heißt auch ein DOM-Typ (CSS Custom Highlight API) — der Import
  // hier überdeckt ihn in dieser Datei, sonst greift TypeScript zum falschen.
  type Insights, type Highlight,
} from './store';
import { LoginScreen } from './components/auth/LoginScreen';
import { useGoogleSignIn } from './components/auth/googleSignIn';
import {
  AuthHeader, AuthInput, AuthPasswordInput, AuthPrimaryButton, AuthSocialRow, ForgotPasswordLink,
} from './components/auth/authUi';
import { BitelyWordmark } from './components/BitelyWordmark';
import { useT, useLang, LANGS, pick, type Lang } from './i18n';
import { SwipeToRedeem } from './components/SwipeToRedeem';

// ═══════════════════════════════════════════════════════════
// DECORATIVE / REFERENCE DATA (kein Mandanten-Bezug)
// ═══════════════════════════════════════════════════════════

const PERMISSIONS = [
  { de: 'Bewertungen einsehen', en: 'View ratings', admin: true, manager: true, waiter: false },
  { de: 'Berichte exportieren', en: 'Export reports', admin: true, manager: true, waiter: false },
  { de: 'Menü bearbeiten', en: 'Edit menu', admin: true, manager: true, waiter: false },
  { de: 'Benutzer verwalten', en: 'Manage users', admin: true, manager: false, waiter: false },
  { de: 'Einstellungen ändern', en: 'Change settings', admin: true, manager: false, waiter: false },
  { de: 'Tische verwalten', en: 'Manage tables', admin: true, manager: true, waiter: true },
  { de: 'Gutscheine prüfen', en: 'Check vouchers', admin: true, manager: true, waiter: true },
];

// ═══════════════════════════════════════════════════════════
// DESIGN SYSTEM PRIMITIVES
// ═══════════════════════════════════════════════════════════

// Die Akzentfarbe (`--ba`) ist AUSSCHLIESSLICH die Marke des Restaurants und
// gilt nur in der Gastansicht. Verwaltung, Servicekraft und das Dashboard
// laufen auf dieser festen Bitely-Farbe — sonst färbt das Branding eines
// Kunden Bedienoberflächen ein, die ihm gar nicht gehören.
const BITELY_ACCENT = '#5265AF';

// Sterne sind immer goldorange — unabhängig vom Branding. Eine Bewertung in
// der Markenfarbe des Lokals liest sich wie ein Werturteil des Lokals über
// sich selbst.
const STAR_COLOR = '#F59E0B';

// Farbe für schwache Gerichtsschnitte (unter 4,0 ★) in Dashboard und Menü.
// Warmes Orange — eine Aufgabe, kein Alarm. Der getönte Hintergrund wird per
// color-mix daraus gerechnet, damit die Kombination immer stimmt. Fest, kein
// Marken-Regler: die eine Ausnahme war mehr Schalter als Nutzen.
const WEAK_RATING_DEFAULT = '#C2410C';
const weakRatingStyle = (hex: string) => ({
  color: hex,
  backgroundColor: `color-mix(in srgb, ${hex} 14%, transparent)`,
});

// ── Markenfarbe lesbar halten ──────────────────────────────
// `--ba` steckt in der ganzen Gastansicht: als Fläche unter weißer Schrift
// (Knöpfe, Punkte-Badges) UND als Textfarbe auf hellem Grund (Punktezahl,
// Standort). Eine helle Marke — Beige, Pastell, kräftiges Gelb — ist in beiden
// Rollen nicht zu entziffern. `readableAccent` schiebt sie so weit Richtung
// Schwarz (heller Grund) bzw. Weiß (dunkler), bis der Kontrast für beides
// reicht (WCAG AA, 4.5:1). Eine schon dunkle Marke bleibt unverändert.
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relLum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const l1 = relLum(a), l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function readableAccent(hex: string, dark: boolean): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const bg: [number, number, number] = dark ? [24, 24, 27] : [255, 255, 255];
  const push: [number, number, number] = dark ? [255, 255, 255] : [0, 0, 0];
  let cur: [number, number, number] = [...rgb];
  for (let i = 0; i < 40 && contrastRatio(cur, bg) < 4.5; i += 1) {
    cur = [cur[0] + (push[0] - cur[0]) * 0.1, cur[1] + (push[1] - cur[1]) * 0.1, cur[2] + (push[2] - cur[2]) * 0.1];
  }
  return '#' + cur.map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
}

function Sk({ h = 16, w = '100%', r = 8 }: { h?: number; w?: string | number; r?: number }) {
  return <div className="animate-pulse bg-gray-200 dark:bg-gray-700" style={{ height: h, width: w, borderRadius: r }} />;
}

/**
 * Standort-Symbol — die vom Nutzer vorgegebene Ortsmarke mit Messer und Gabel.
 * Steht überall, wo eine EINZELNE Filiale gemeint ist (Umschalter, Filterchip,
 * Filiallisten). „Alle Filialen" behält das Gebäude-Symbol: das ist kein Ort,
 * sondern die ganze Kette.
 *
 * Ein einziger Pfad mit `fillRule="evenodd"`: die Marke füllt, der Kreis darin
 * ist ein Loch, Gabel und Messer im Loch füllen wieder. Keine feste weiße
 * Fläche — der Ausschnitt zeigt den Hintergrund und trägt hell wie dunkel.
 * Zeichnet in `currentColor`, übernimmt also die Textfarbe am Einsatzort.
 */
function BranchIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 384 512" fill="currentColor"
      className={className} aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M215.7 499.2C267 435 384 279.4 384 192 384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2 12.3 15.3 35.1 15.3 47.4 0zM102 178a90 90 0 1 0 180 0 90 90 0 1 0-180 0zM137 104h9v44h-9zM148 104h9v44h-9zM159 104h9v44h-9zM133 148h38v17h-38zM145 165h15v76a7.5 7.5 0 0 1-15 0zM232 100c-10 0-16 13-16 38 0 30 6 52 16 58 10-6 16-28 16-58 0-25-6-38-16-38zM225 196h14v54a7 7 0 0 1-14 0z" />
    </svg>
  );
}

function StarRating({ value, onChange, size = 22 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const [hov, setHov] = useState(0);
  const fill = hov || value;
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s} onClick={() => onChange?.(s)}
          onMouseEnter={() => onChange && setHov(s)} onMouseLeave={() => onChange && setHov(0)}
          aria-label={onChange ? `${s} von 5 Sternen` : undefined}
          className={`p-0.5 rounded transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white ${onChange ? 'cursor-pointer' : 'cursor-default'}`}>
          <Star size={size} fill={s <= fill ? STAR_COLOR : 'none'}
            stroke={s <= fill ? STAR_COLOR : '#D1D5DB'} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

/**
 * Sichtbarer Fokusring, an einer Stelle.
 *
 * Die Gastansicht hatte gar keinen: mit der Tastatur wusste niemand, wo er
 * steht. `focus-visible` statt `focus`, damit der Ring beim Tippen mit dem
 * Finger nicht auftaucht — am Tisch wird nicht getabbt, und ein Ring, der nach
 * jedem Antippen stehen bleibt, sieht aus wie ein Fehler. Der Versatz braucht
 * eine Grundfarbe, sonst schneidet der Ring auf dunklem Grund ins Weiße.
 */
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white ring-offset-white dark:ring-offset-gray-900';

function PrimaryBtn({ children, onClick, disabled, full = true, sm }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; full?: boolean; sm?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${full ? 'w-full' : ''} ${sm ? 'py-2 px-4 text-[13px] min-h-[44px]' : 'py-3 px-6 text-[15px] min-h-[48px]'} ${FOCUS_RING} rounded-xl font-medium text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed`}
      style={{ backgroundColor: disabled ? '#9CA3AF' : 'var(--ba, #16A34A)' }}>
      {children}
    </button>
  );
}

/**
 * „POWERED BY bitely" — die Fußzeile der Gastansicht.
 *
 * Die schwarze Bitely-Leiste über dem Gastbildschirm ist genau deshalb
 * verschwunden: oben gehört die Marke des Lokals hin, unsere in den Fuß. Sie
 * steht auf dem ersten und auf dem letzten Bildschirm und schließt damit den
 * Weg des Gastes.
 */
function PoweredByBitely() {
  return (
    <div className="w-full flex items-center gap-2.5 mt-10 pt-5 border-t border-gray-200/70 dark:border-gray-800">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Powered by</span>
      <BitelyWordmark className="h-6" />
    </div>
  );
}

function SecondaryBtn({ children, onClick, full }: { children: React.ReactNode; onClick?: () => void; full?: boolean }) {
  return (
    <button onClick={onClick}
      className={`${full ? 'w-full' : ''} py-3 px-6 min-h-[48px] ${FOCUS_RING} rounded-xl text-[15px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-[0.98]`}>
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
/**
 * Der Name des Lokals im Browser-Reiter.
 *
 * Dort stand fest verdrahtet „Rating and Feedback Screen" — die einzige
 * Stelle, an der das Restaurant NICHT aus den Marken-Einstellungen kam. Wer
 * mehrere Filialen oder mehrere Mandanten nebeneinander offen hat, unterschied
 * die Reiter an nichts. `document.title` steht außerhalb von React, deshalb
 * ein Effekt und kein Rendern.
 */
function useDocumentTitle(brandName: string | undefined, suffix?: string | null) {
  useEffect(() => {
    if (!brandName) return;
    const previous = document.title;
    document.title = suffix ? `${brandName} · ${suffix}` : brandName;
    return () => { document.title = previous; };
  }, [brandName, suffix]);
}

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

/**
 * Der Server war nicht erreichbar. Statt der nackten Browser-Meldung „Failed to
 * fetch" eine ruhige, ganzseitige Karte: ein Symbol, ein Satz zur Ursache
 * (offline vs. Server schläft) und ein Knopf, der es noch einmal versucht — mit
 * drehendem Symbol, solange er läuft. Auf dem festen Bitely-Blau, weil die
 * Marke des Lokals in diesem Zustand womöglich noch gar nicht geladen ist.
 */
function NetworkErrorPage({ onRetry }: { onRetry: () => void | Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const retry = async () => {
    setRetrying(true);
    try { await onRetry(); } finally { setRetrying(false); }
  };
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-[#F7F8FA] dark:bg-[#0D1117] p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <WifiOff size={26} strokeWidth={1.5} className="text-gray-400" aria-hidden />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <p className="text-[17px] font-semibold text-gray-900 dark:text-white">
          {offline ? 'Keine Internetverbindung' : 'Server nicht erreichbar'}
        </p>
        <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed">
          {offline
            ? 'Dein Gerät ist gerade offline. Prüfe die Verbindung und versuch es noch einmal.'
            : 'Wir konnten den Server nicht erreichen. Das liegt an der Verbindung — oder der Server fährt gerade hoch, dann dauert der erste Aufruf 20–30 Sekunden.'}
        </p>
      </div>
      <button onClick={retry} disabled={retrying}
        className={`inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl text-[14px] font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
        style={{ backgroundColor: BITELY_ACCENT }}>
        <RefreshCw size={15} strokeWidth={2} className={retrying ? 'animate-spin' : ''} aria-hidden />
        {retrying ? 'Wird versucht…' : 'Erneut versuchen'}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GERICHTE-BEWERTUNGSBLOCK — drei Layout-Varianten (Design-Studio),
// gemeinsam genutzt vom echten Gast-Flow und der Live-Vorschau im Admin.
//
// Keine schwebenden Karten mehr: die Blöcke laufen von Rand zu Rand und sind
// nur durch eine Haarlinie getrennt. Eine Liste aus Karten mit Rahmen, Schatten
// und Abstand wirkt wie ein Formular; eine Speisekarte setzt ihre Gerichte
// untereinander und lässt das Papier die Arbeit machen.
// ═══════════════════════════════════════════════════════════

function DishRatingCard({ dish, stars, note, expanded, cardStyle = 'standard', onRate, onToggleExpand, onNoteChange }: {
  dish: Dish; stars: number; note: string; expanded: boolean; cardStyle?: NonNullable<Brand['cardStyle']>;
  onRate: (v: number) => void; onToggleExpand: () => void; onNoteChange: (v: string) => void;
}) {
  // Der Auslöser braucht eine eigene Kennung, damit `aria-controls` auf etwas
  // zeigt — bei mehreren Gerichten untereinander sonst mehrfach dieselbe.
  const noteId = `anmerkung-${dish.id}`;

  const notesBlock = (
    <AnimatePresence>
      {expanded && (
        <motion.div id={noteId} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
          <div className="px-5 pb-5">
            <textarea rows={2} value={note} onChange={e => onNoteChange(e.target.value)}
              placeholder={stars > 0 && stars <= 3 ? 'Was war nicht gut? (optional)' : 'Was ist dir aufgefallen? (optional)'}
              className="w-full text-[14px] text-gray-700 dark:text-gray-200 placeholder:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl px-3.5 py-3 outline-none resize-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Gemeinsam: weißer Block, unten eine Haarlinie. Der letzte Block der Liste
  // braucht keine Sonderbehandlung — darunter kommt der nächste Abschnitt.
  const shell = 'bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800';

  /**
   * Der Auslöser für die Anmerkung.
   *
   * Er war ein nackter Pfeil in Hellgrau, oben rechts am Gericht. Im
   * Usability-Test fand der Teilnehmer erst durch Herumprobieren heraus, dass
   * sich dahinter ein Textfeld verbirgt — ein Symbol allein sagt nicht, was
   * es aufklappt. Jetzt steht es daneben. Der Text sagt außerdem, ob schon
   * etwas drinsteht: sonst sieht der zugeklappte Block aus, als wäre die
   * Anmerkung weg.
   *
   * Unter den Sternen, nicht neben dem Namen: dort steht er in allen drei
   * Kartenlayouts an derselben Stelle, und dort wird er auch gebraucht —
   * erst bewerten, dann dazuschreiben.
   */
  const noteToggle = (
    <button onClick={onToggleExpand}
      aria-expanded={expanded} aria-controls={noteId}
      className={`-ml-2 px-2 min-h-[44px] flex items-center gap-1.5 rounded-lg text-[13px] font-medium transition-colors ${FOCUS_RING}
        ${note.trim() ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
      <MessageSquare size={15} strokeWidth={1.75} />
      {expanded ? 'Anmerkung ausblenden' : note.trim() ? 'Anmerkung bearbeiten' : 'Anmerkung hinzufügen'}
      <ChevronDown size={15} strokeWidth={2} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>
  );

  if (cardStyle === 'editorial') {
    return (
      <div className={shell}>
        <img src={dish.img} alt={dish.name} className="w-full h-44 object-cover" />
        <div className="px-5 py-5">
          <p className="text-[19px] font-medium text-gray-900 dark:text-white leading-tight">{dish.name}</p>
          <p className="text-[15px] text-gray-500 dark:text-gray-400 mt-0.5">{dish.price.toFixed(2)} €</p>
          <div className="mt-3 -ml-1"><StarRating value={stars} onChange={onRate} size={30} /></div>
          <div className="mt-1">{noteToggle}</div>
        </div>
        {notesBlock}
      </div>
    );
  }

  if (cardStyle === 'kompakt') {
    return (
      <div className={shell}>
        <div className="flex items-start gap-3.5 px-5 py-3.5">
          <img src={dish.img} alt={dish.name} className="w-12 h-12 rounded-[12px] object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-800" />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-gray-900 dark:text-white leading-tight truncate">{dish.name}</p>
            <div className="mt-1 -ml-1"><StarRating value={stars} onChange={onRate} size={22} /></div>
            {noteToggle}
          </div>
        </div>
        {notesBlock}
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="flex gap-4 px-5 py-5">
        <img src={dish.img} alt={dish.name} className="w-16 h-16 rounded-[14px] object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-800" />
        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-medium text-gray-900 dark:text-white leading-tight">{dish.name}</p>
          <p className="text-[15px] text-gray-500 dark:text-gray-400 mt-0.5">{dish.price.toFixed(2)} €</p>
          {/* Große Trefferfläche: gewischt und getippt wird am Tisch, oft
              einhändig, und ein danebengegangener Stern ist ärgerlicher als
              ein paar Pixel mehr Platz. */}
          <div className="mt-3 -ml-1"><StarRating value={stars} onChange={onRate} size={28} /></div>
          <div className="mt-1">{noteToggle}</div>
        </div>
      </div>
      {notesBlock}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GUEST APP
// ═══════════════════════════════════════════════════════════

// Kein eigener Schritt mehr für den Gesamteindruck: Service, Ambiente und
// Tempo stehen jetzt unter den Gerichten auf DEMSELBEN Bildschirm. Zwei
// Schritte für eine Bewertung waren einer zu viel — wer nach den Gerichten
// „Weiter" drückte, rechnete mit dem Absenden, nicht mit einer zweiten Seite.
type GuestScreen = 'welcome' | 'review' | 'thanks' | 'vouchers' | 'profile';

/** Die drei Sammelurteile, die zu jeder Bewertung gehören. */
/**
 * Was der Gast über die Gerichte hinaus beurteilt.
 *
 * Nur noch der Service. Ambiente und Schnelligkeit sind bewusst raus: sie
 * standen zwischen dem Gast und dem Absenden-Knopf, und nach fünf Gerichten
 * noch drei Pauschalurteile zu verlangen kostete mehr Abbrüche, als die
 * Antworten wert waren — beides ist ohnehin nichts, woraus die Küche am
 * nächsten Tag etwas macht.
 *
 * Das Feld am Draht bleibt dreiteilig (`overall.service/ambience/speed`):
 * abgegebene Bewertungen tragen die alten Werte weiter, und was hier nicht
 * gefragt wird, geht als 0 mit. Der Server liest 0 als „nicht beurteilt".
 */
const OVERALL_FIELDS = [
  { key: 'service', label: 'Service', emoji: '🤝' },
] as const;

/**
 * Wofür es Punkte gibt. Steht ÜBER dem Bewertungsformular, nicht danach.
 *
 * Im Usability-Test wusste der Teilnehmer zu keinem Zeitpunkt, wofür es
 * Punkte gibt und wozu sie gut sind. Kein Wunder: die Zahl tauchte erst auf
 * dem Dank-Bildschirm auf, also nachdem er alles getan hatte, wofür es sie
 * gibt. Die Regel gehoert davor, im Klartext und mit der Zahl.
 *
 * Bewusst kein Modal und kein Overlay: der Hinweis darf den Weg zum Bewerten
 * nicht versperren, sondern soll beim Vorbeigehen mitgelesen werden. Was
 * darüber hinausgeht (sammeln, einlösen) hängt deshalb hinter
 * "Mehr erfahren" und nicht in der Zeile, die jeder liest.
 *
 * Die Zahlen kommen vom Server (`pointsRule`), gerechnet wird auch dort. Sind
 * sie noch nicht da, bleibt der Block aus: ein Betrag, den wir nur raten,
 * wäre schlimmer als keiner.
 */
function PointsExplainer({ rule, points, loggedIn }: {
  rule: PointsRule; points: number; loggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  // `?.` ist Absicht: fehlt die Regel (älterer Server), bleibt der Block aus,
  // statt die ganze Ansicht mitzureißen.
  if (!(rule?.perDish > 0)) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-5 py-4">
      <div className="flex items-start gap-2.5">
        <Zap size={16} strokeWidth={1.75} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--ba)' }} />
        <div className="min-w-0">
          <p className="text-[14px] leading-relaxed text-gray-700 dark:text-gray-200">
            Für jedes Gericht, das du bewertest, bekommst du{' '}
            <strong className="font-semibold text-gray-900 dark:text-white">{rule.perDish} Punkte</strong>.
            Je mehr du bewertest, desto mehr Punkte.
          </p>
          <button onClick={() => setOpen(o => !o)}
            aria-expanded={open} aria-controls="punkte-erklaerung"
            className="mt-1 -ml-1 px-1 min-h-[44px] flex items-center gap-1 text-[13px] font-medium rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
            style={{ color: 'var(--ba)' }}>
            {open ? 'Weniger' : 'Mehr erfahren'}
            <ChevronDown size={15} strokeWidth={2} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div id="punkte-erklaerung"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="pt-1 pl-[26px] space-y-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
              <p>Für die abgeschickte Bewertung kommen {rule.perReview} Punkte dazu.</p>
              <p>Deine Punkte sammeln sich auf deinem Konto und gelten in allen Filialen.</p>
              <p>Ab einem bestimmten Stand schaltest du Gutscheine frei und löst sie direkt am Tisch ein.</p>
              {loggedIn && <p className="text-gray-600 dark:text-gray-300">Du hast gerade {points} Punkte.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Der Punktestand, auf jedem Bildschirm an derselben Stelle.
 *
 * Im Usability-Test kam der ausdrückliche Wunsch nach einer gut sichtbaren,
 * jederzeit erreichbaren Punkteanzeige. Bisher stand der Stand auf der
 * Gutscheinseite und im Konto — also genau dort, wo man ohnehin schon
 * hingefunden hat, und nirgends auf dem Weg dorthin.
 *
 * Zwei Fälle, und der Unterschied ist wichtig:
 *
 *   angemeldet   der Stand am Konto, in der Akzentfarbe. Er gehört dem Gast.
 *   ohne Konto   was gerade OFFEN ist: die Punkte der laufenden Bewertung,
 *                die noch niemandem gutgeschrieben sind. Grau und mit „offen"
 *                beschriftet, weil eine Zahl in der Akzentfarbe hier ein
 *                Guthaben behaupten würde, das es nicht gibt.
 *
 * Mit `onClick` ist der Chip der Weg zu Punkten und Gutscheinen. Ohne ihn ist
 * er nur Anzeige — auf der Gutscheinseite selbst, wo ein Knopf auf die eigene
 * Seite führen würde.
 */
function GuestPointsChip({ points, loggedIn, live = 0, onClick }: {
  points: number; loggedIn: boolean; live?: number; onClick?: () => void;
}) {
  const label = loggedIn ? `${points} Pkt.` : live > 0 ? `${live} Pkt. offen` : '0 Pkt.';
  const aria = loggedIn
    ? `${points} Punkte auf deinem Konto`
    : live > 0 ? `${live} Punkte, noch nicht gesichert` : 'Noch keine Punkte';

  const body = (
    <>
      <Zap size={14} strokeWidth={2} />
      <span className="tabular-nums">{label}</span>
      {loggedIn && live > 0 && <span className="tabular-nums opacity-70">+{live}</span>}
    </>
  );

  const look = `flex items-center gap-1.5 px-2.5 rounded-full text-[13px] font-semibold whitespace-nowrap flex-shrink-0${
    loggedIn ? '' : ' bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
  }`;
  // Die Tönung wie überall sonst über `color-mix` im style-Attribut, nicht als
  // Tailwind-Kurzform: die Akzentfarbe steht erst zur Laufzeit fest.
  const color = loggedIn
    ? { color: 'var(--ba)', backgroundColor: 'color-mix(in srgb, var(--ba, #16A34A) 12%, transparent)' }
    : undefined;

  if (!onClick) {
    return <span className={`${look} h-8`} style={color} aria-label={aria}>{body}</span>;
  }
  return (
    <button onClick={onClick} aria-label={`${aria}. Punkte und Gutscheine ansehen`}
      className={`${look} min-h-[44px] transition-transform active:scale-95 ${FOCUS_RING}`} style={color}>
      {body}
    </button>
  );
}

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
  // Der Gutschein auf genau diese Punkte. Wird eingelöst, sobald sich der Gast
  // anmeldet — deshalb ist "Anmelden und Punkte sichern" keine leere Zusage.
  const [pointsTicket, setPointsTicket] = useState<string | null>(null);
  // Anmeldung/Registrierung als Gast — von mehreren Stellen aus zu öffnen.
  const [authOpen, setAuthOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Die fertig formulierte Rezension zum Weitergeben. Wird NACH dem Absenden
  // geholt: das Formulieren dauert Sekunden, und so lange soll niemand vor
  // einem hängenden „Wird gesendet…" sitzen.
  const [reviewText, setReviewText] = useState<{ text: string; mapsUrl: string } | null>(null);
  const [reviewTextPending, setReviewTextPending] = useState(false);
  const [copied, setCopied] = useState(false);
  // Kontolöschung: zweistufig, weil sie Punkte vernichtet und nicht rückgängig ist.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Eigener API-Schlüssel: Eingabefeld nur bei Bedarf offen, Entfernen ist
  // anders als Kontolöschung jederzeit rückgängig zu machen — reicht ein
  // leichter Inline-Confirm statt des zweistufigen Lösch-Musters.
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [confirmRemoveApiKey, setConfirmRemoveApiKey] = useState(false);

  // Nur Tische DIESER Filiale: die Nummer allein trifft seit T-2 in jeder
  // Filiale einen anderen Tisch.
  const table = store.tables.find(t => t.branchId === branch.id && t.number === tableNumber);
  const tableDishes = (table?.items ?? [])
    .map(i => store.dishes.find(d => d.id === i.dishId))
    .filter((d): d is Dish => Boolean(d));

  const ratedCount = tableDishes.filter(d => (ratings[d.id] ?? 0) > 0).length;
  const allRated = tableDishes.length > 0 && ratedCount >= tableDishes.length;
  // Nur die Felder, die auch gefragt werden. `overall` trägt weiterhin drei
  // Werte (siehe OVERALL_FIELDS) — über alle drei zu zählen hieße auf eine
  // Antwort zu warten, nach der niemand fragt: der Knopf bliebe für immer aus.
  const allOverall = OVERALL_FIELDS.every(f => overall[f.key] > 0);
  // Der Fortschritt zählt beides: Gerichte UND Gesamteindruck. Sonst stünde der
  // Balken bei 100 %, während der Absenden-Knopf noch gesperrt ist.
  const overallDone = OVERALL_FIELDS.filter(f => overall[f.key] > 0).length;
  const stepsTotal = tableDishes.length + OVERALL_FIELDS.length;
  const stepsDone = ratedCount + overallDone;
  // Was die Bewertung im JETZIGEN Stand einbringt. Läuft beim Bewerten
  // weiterer Gerichte mit hoch und macht damit sichtbar, was der Erklärblock
  // behauptet: mehr Bewertungen sind mehr Punkte. Gerechnet wird mit der Regel
  // vom Server, vergeben werden die Punkte ohnehin nur dort.
  const livePoints = ratedCount > 0 ? pointsFor(store.pointsRule, ratedCount) : 0;

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

  // Meldet sich der Gast an, NACHDEM er bewertet hat, wandern die Punkte
  // nachträglich auf sein frisches Konto. Der Server lässt das genau einmal zu.
  useEffect(() => {
    if (!pointsTicket || !store.guest.loggedIn) return;
    let cancelled = false;
    const ticket = pointsTicket;
    setPointsTicket(null);
    store.claimPoints(ticket)
      .then(claimed => {
        if (cancelled || claimed <= 0) return;
        setMissedPts(0);
        setEarnedPts(claimed);
      })
      .catch(() => { /* Ticket abgelaufen oder schon eingelöst — dann bleibt es dabei. */ });
    return () => { cancelled = true; };
  }, [pointsTicket, store.guest.loggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (s: GuestScreen) => setScreen(s);

  // Woher der Gast zu den Gutscheinen kam — der Zurück-Knopf dort führte sonst
  // immer auf den Dank-Bildschirm, auch wenn es gar keine Bewertung gab.
  const [vouchersBack, setVouchersBack] = useState<GuestScreen>('welcome');
  // Der Reiter darf mitkommen: „Eingelöst" im Konto anzutippen und dann auf
  // der Gutscheinseite noch einmal den richtigen Reiter suchen zu müssen, wäre
  // genau das Suchen, das hier wegsoll.
  const openVouchers = (from: GuestScreen, tab?: string) => {
    setVouchersBack(from);
    if (tab) setVTab(tab);
    go('vouchers');
  };
  // Dasselbe für das Konto: es hängt jetzt an zwei Stellen (Gutscheinseite und
  // Symbol oben rechts im Empfang), und ein fester Rückweg führte von dort
  // zurück auf einen Bildschirm, auf dem der Gast nie war.
  const [profileBack, setProfileBack] = useState<GuestScreen>('vouchers');
  const openProfile = (from: GuestScreen) => { setProfileBack(from); go('profile'); };

  const handleSubmitReview = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const dishRatings: DishRatingInput[] = tableDishes.map(d => ({
        dishId: d.id, stars: ratings[d.id] ?? 0, note: notes[d.id]?.trim() || undefined,
      }));
      const { earned, possible, ticket, reviewTicket } = await store.submitReview(branch.slug, tableNumber, dishRatings, overall);
      setEarnedPts(earned);
      // Den Rezensionstext im Hintergrund holen — der Dank-Bildschirm erscheint
      // sofort und füllt den Block nach. Scheitert es, bleibt der Block einfach
      // aus: die Bewertung selbst ist längst angekommen.
      setReviewText(null);
      if (reviewTicket) {
        setReviewTextPending(true);
        store.fetchReviewText(reviewTicket)
          .then(res => setReviewText({ text: res.text, mapsUrl: res.mapsUrl }))
          .catch(() => { /* dann eben ohne Textvorschlag */ })
          .finally(() => setReviewTextPending(false));
      }
      // Ohne Konto ist earned 0 — dann zeigt der Dank-Bildschirm, was mit einem
      // Konto drin wäre, und das Ticket hebt die Punkte auf, bis sich der Gast
      // anmeldet (siehe den Effekt weiter unten).
      setMissedPts(earned === 0 ? possible : 0);
      setPointsTicket(ticket);
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
  // Abgelaufene fallen raus, bevor irgendetwas gezählt oder angezeigt wird.
  // Sie standen vorher mit in der Liste, ließen sich antippen und scheiterten
  // erst am Server — und schlimmer: einer, der nur wegen seines Ablaufdatums
  // unerreichbar war, konnte als „nächste Belohnung" die Punktezahl bestimmen,
  // auf die der Balken zuläuft. Bereits eingelöste bleiben sichtbar; ihr
  // Ablaufdatum ändert nichts daran, dass der Gast sie hatte.
  const notRedeemed = store.vouchers.filter(v => !redeemedIds.includes(v.id) && !voucherExpired(v));
  const unlockedVouchers = notRedeemed.filter(v => store.guest.points >= v.points);
  const lockedVouchers = notRedeemed.filter(v => store.guest.points < v.points);
  const redeemedVouchers = store.vouchers.filter(v => redeemedIds.includes(v.id));
  // `null` heißt „keine weitere Belohnung offen" — alle eingelöst oder abgelaufen.
  // Vorher stand hier eine hartcodierte 300; hatte der Gast mehr Punkte als das,
  // zeigte der Dank-Bildschirm „es fehlen -90 Punkte".
  const nextRewardPoints = notRedeemed.length > 0 ? Math.min(...notRedeemed.map(v => v.points)) : null;

  if (!table) {
    return (
      <FullScreenMessage error>
        Tisch {tableNumber} gibt es in der Filiale {branch.name} nicht. Bitte scanne den QR-Code am Tisch erneut.
      </FullScreenMessage>
    );
  }

  // Was hier steht, hängt daran, ob es überhaupt etwas zu bewerten gibt. Eine
  // eigene Leerzustands-Box dafür gibt es nicht: sie würde den Aufbau aus Bild,
  // Schlagzeile und Fuß auseinanderreißen.
  // Die Sprache der Gastansicht gibt der Betrieb vor (brand.guestLang), nicht
  // das Gerät. `t` übersetzt am Aufrufort, ohne Schlüssel.
  const gl = store.brand?.guestLang ?? 'de';
  const t = (de: string, en: string) => pick(gl, de, en);

  const hasOrder = tableDishes.length > 0;
  const welcomeText = hasOrder
    ? t('Ein kurzes Feedback hilft uns, jeden Abend besonders zu machen. Es dauert nur eine Minute.',
        'A quick bit of feedback helps us make every evening better. It only takes a minute.')
    : t('Für diesen Tisch liegt gerade keine offene Bestellung vor. Sobald dein Service-Team Gerichte einträgt, kannst du sie hier einzeln bewerten.',
        'There is no open order for this table right now. Once the staff add dishes, you can rate them here one by one.');

  // Zwei frei wählbare Schriftfarben aus den Design-Einstellungen. Nicht
  // gesetzt = undefined, dann greifen die Grau-/Schwarz-Klassen wie bisher.
  const nameColor = store.brand?.guestNameColor ? { color: store.brand.guestNameColor } : undefined;
  const textColor = store.brand?.guestTextColor ? { color: store.brand.guestTextColor } : undefined;

  return (
    <div className="relative flex flex-col flex-1 min-h-0 bg-[#F7F8FA] dark:bg-[#0D1117]">

      {screen === 'welcome' && (
        <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="relative flex-1 min-h-0 overflow-y-auto bg-white dark:bg-[#0D1117]">

          {/* Das Titelbild läuft bis an den oberen Rand durch und verliert sich
              nach unten im Hintergrund — deshalb steht die Tischnummer IM
              Textblock und nicht als Leiste darüber. Fehlt das Bild (es kommt
              aus den Marken-Einstellungen), bleibt eine ruhige Fläche in der
              Markenfarbe stehen, statt dass der Text im Nichts hängt. */}
          <div className="absolute inset-x-0 top-0 h-[62%] pointer-events-none">
            {/* Das Foto DIESER Filiale, sonst das kettenweite Titelbild. */}
            {(branch.coverImage ?? store.brand?.coverImage) ? (
              <img src={branch.coverImage ?? store.brand?.coverImage ?? ''} alt="" aria-hidden
                className="w-full h-full object-cover"
                style={{ opacity: store.brand?.coverOpacity ?? 1 }} />
            ) : (
              <div className="w-full h-full opacity-35 dark:opacity-25"
                style={{ background: 'linear-gradient(160deg, var(--ba, #16A34A), transparent 70%)' }} />
            )}
            {/* Der Schleier trägt die Schrift, deshalb bleibt er unten dicht
                und wird nach oben schnell durchsichtig. Er sitzt tief: die
                obere Bildhälfte bleibt in voller Farbe — hell wie dunkel, das
                Bild wird nicht entsättigt —, erst darunter blendet er nach Weiß
                bzw. `#0D1117`, damit die Schlagzeile trägt. */}
            <div className="absolute inset-0 bg-gradient-to-t from-white from-15% via-white/25 via-55% to-transparent dark:from-[#0D1117] dark:via-[#0D1117]/50" />
          </div>

          <div className="relative z-10 min-h-full flex flex-col px-8 pt-8 pb-8">
            {/* Das Zeichen des Lokals steht oben auf dem Bild, wie der Kopf einer
                Karte — der Gast kennt es von der Tür, der Name in der
                Schlagzeile ersetzt es nicht. Klein und ohne Namen daneben:
                der steht drei Zeilen tiefer schon in voller Größe.

                Gegenüber das eigene Konto. Es gehörte bisher hinter zwei
                Ecken (Gutscheine → Dein Konto) und war damit dort versteckt,
                wo der Gast es zuerst sucht: oben rechts, wo in jeder App das
                Konto sitzt. Angemeldet zeigt es die Initiale, sonst ein
                neutrales Zeichen — dann führt es in die Anmeldung. */}
            <div className="flex items-start justify-between w-full">
              <BrandLogo brand={store.brand} size={44} textSize={38} rounded="rounded-xl" />
              <button
                onClick={() => store.guest.loggedIn ? openProfile('welcome') : setAuthOpen(true)}
                title={store.guest.loggedIn ? 'Dein Konto' : 'Anmelden'}
                aria-label={store.guest.loggedIn ? 'Dein Konto' : 'Anmelden'}
                className={`w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center transition-transform active:scale-95 shadow-sm border border-black/5 dark:border-white/10 ${FOCUS_RING}`}
                style={store.guest.loggedIn
                  ? { backgroundColor: 'var(--ba, #16A34A)' }
                  : { backgroundColor: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)' }}>
                {store.guest.loggedIn ? (
                  <span className="text-white text-[16px] font-bold">
                    {(store.guest.name ?? store.guest.email ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                ) : (
                  <Users size={18} strokeWidth={1.5} className="text-gray-600" />
                )}
              </button>
            </div>

            {/* Der Text sitzt unten im wachsenden Teil, die Fußzeile darunter am
                Blattrand — nicht als Anhängsel direkt unter den Knöpfen. */}
            <div className="flex-1 flex flex-col items-start justify-end pt-8">
            {/* Klein und über der Schlagzeile: der Gast sitzt schon am Tisch und
                muss nur kurz gegenprüfen, ob er den richtigen Code erwischt hat. */}
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-4" style={nameColor}>
              {branch.name} · {t('Tisch', 'Table')} {tableNumber}
            </p>
            <h1 className="text-[44px] font-bold leading-[1.1] tracking-tight mb-4 max-w-[280px] text-gray-900 dark:text-white" style={textColor}>
              {hasOrder
                ? <>{t('Wie war dein Besuch bei', 'How was your visit to')} {store.brand?.name}?</>
                : <>{t('Willkommen bei', 'Welcome to')} {store.brand?.name}</>}
            </h1>
            <p className="text-[16px] leading-relaxed max-w-[260px] text-gray-600 dark:text-gray-300" style={textColor}>
              {welcomeText}
            </p>

            <div className="w-full mt-10">
              {hasOrder && (
                <button onClick={() => go('review')}
                  className="w-full h-[54px] rounded-[16px] shadow-lg flex items-center justify-between px-6 text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                  <span className="text-[16px] font-medium">{t('Feedback starten', 'Start feedback')}</span>
                  <ArrowRight size={20} strokeWidth={1.75} />
                </button>
              )}
              {/* Von hier aus muss es immer weitergehen. Ohne offene Bestellung
                  gibt es nichts zu bewerten — dann wäre der Bildschirm ohne den
                  Gutschein-Zugang eine Sackgasse, besonders für den, der sich
                  gerade angemeldet hat. */}
              {/* Der Weg zum Einlösen. Er war eine graue Textzeile am unteren
                  Rand und wurde im Usability-Test nicht als anklickbar
                  erkannt — das kostete einen ganzen Punkt auf der
                  Schwierigkeitsskala. Jetzt eine Fläche mit Umriss, in der
                  Höhe des Hauptknopfs, mit Symbol und Pfeil: dass hier etwas
                  passiert, muss man nicht mehr vermuten. Umriss statt Füllung,
                  damit „Feedback starten" darüber die Hauptsache bleibt. */}
              <button onClick={() => openVouchers('welcome')}
                className={`w-full h-[52px] mt-4 rounded-[16px] border flex items-center justify-between px-5 transition-colors ${FOCUS_RING}
                  border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-900/50 backdrop-blur-sm
                  hover:bg-white dark:hover:bg-gray-900 active:scale-[0.98]`}>
                <span className="flex items-center gap-2.5 text-[15px] font-medium text-gray-900 dark:text-white">
                  <Ticket size={18} strokeWidth={1.75} style={{ color: 'var(--ba)' }} />
                  {t('Punkte & Gutscheine', 'Points & vouchers')}
                </span>
                {store.guest.loggedIn
                  ? <span className="text-[14px] font-semibold tabular-nums" style={{ color: 'var(--ba)' }}>{store.guest.points} {t('Pkt.', 'pts')}</span>
                  : <ArrowRight size={18} strokeWidth={1.75} className="text-gray-400" />}
              </button>
              {/* Kein zweiter Textknopf zum Anmelden: das Konto sitzt oben
                  rechts, wo es in jeder App sitzt. Zwei Wege ins selbe
                  Anmeldeblatt, untereinander, lasen sich wie zwei Angebote. */}
              </div>
            </div>

            <PoweredByBitely />
          </div>
        </motion.div>
      )}

      {screen === 'review' && (
        <motion.div key="review" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
          className="flex flex-col flex-1 min-h-0 bg-gray-50 dark:bg-[#0D1117]">
          {/* Der Bildwechsel ist Absicht: das Titelbild gehört zum Empfang, hier
              wird gearbeitet. Ruhiger Grund, weiße Blöcke, sonst nichts. */}
          <div className="bg-white dark:bg-gray-900 sticky top-0 z-10">
            <div className="flex items-center gap-2 px-4 py-3">
              <button onClick={() => go('welcome')} aria-label={t('Zurück', 'Back')} className={`w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 ${FOCUS_RING}`}>
                <ChevronLeft size={20} strokeWidth={1.5} className="text-gray-600 dark:text-gray-300" />
              </button>
              <p className="flex-1 text-[17px] font-medium text-gray-900 dark:text-white truncate">{t('Deine Gerichte', 'Your dishes')}</p>
              <span className="text-[13px] text-gray-400 tabular-nums flex-shrink-0">{stepsDone}/{stepsTotal}</span>
              {/* Der Stand und was gerade dazukommt, in einem. Der Zuwachs
                  springt bei jedem bewerteten Gericht hoch — das ist die
                  einzige Stelle, an der „mehr Bewertungen = mehr Punkte" nicht
                  behauptet, sondern vorgeführt wird. Hier ohne `onClick`:
                  mitten im Bewerten darf ein Antippen nicht wegführen. */}
              <motion.div key={livePoints} initial={{ scale: 0.94 }} animate={{ scale: 1 }}>
                <GuestPointsChip points={store.guest.points} loggedIn={store.guest.loggedIn} live={livePoints} />
              </motion.div>
            </div>
            <div className="h-[2px] bg-gray-100 dark:bg-gray-800">
              <div className="h-full transition-all duration-500" style={{ width: `${stepsTotal ? (stepsDone / stepsTotal) * 100 : 0}%`, backgroundColor: 'var(--ba, #16A34A)' }} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <PointsExplainer rule={store.pointsRule} points={store.guest.points} loggedIn={store.guest.loggedIn} />
            {tableDishes.map(dish => (
              <DishRatingCard key={dish.id} dish={dish} stars={ratings[dish.id] || 0} note={notes[dish.id] ?? ''}
                expanded={expanded.has(dish.id)} cardStyle={store.brand?.cardStyle ?? 'standard'}
                onRate={v => {
                  setRatings(p => ({ ...p, [dish.id]: v }));
                  // Aufklappen an den Rändern der Skala: wer ein Gericht sehr
                  // schlecht oder sehr gut findet, hat meistens einen Grund
                  // dafür, und genau dort will er ihn hinschreiben. Bei drei
                  // und vier Sternen bleibt das Feld zu — dort schreibt kaum
                  // jemand etwas, und ein aufgeklapptes Feld je Gericht macht
                  // aus der Liste ein Formular.
                  if (v > 0 && (v <= 3 || v === 5)) setExpanded(p => new Set(p).add(dish.id));
                }}
                onToggleExpand={() => setExpanded(p => { const n = new Set(p); n.has(dish.id) ? n.delete(dish.id) : n.add(dish.id); return n; })}
                onNoteChange={v => setNotes(p => ({ ...p, [dish.id]: v }))} />
            ))}
            <button onClick={() => setShowSheet(true)}
              className="w-full bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-5 py-4 text-[14px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-2">
              <Plus size={15} strokeWidth={2} /> {t('Etwas vergessen?', 'Something missing?')}
            </button>

            {/* Gesamteindruck — auf demselben Bildschirm wie die Gerichte, nur
                abgesetzt. Der Gast bewertet seinen Besuch in einem Durchgang;
                zwei Schritte waren einer zu viel. */}
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 px-5 pt-8 pb-3">
              {t('Und der Besuch insgesamt?', 'And the visit overall?')}
            </p>
            {OVERALL_FIELDS.map(({ key, label, emoji }) => (
              <div key={key} className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-5 py-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[22px] text-gray-900 dark:text-white">
                    <span className="mr-2">{emoji}</span>{label}
                  </p>
                  <span className="text-[13px] text-gray-400 tabular-nums">{overall[key] > 0 ? `${overall[key]}/5` : ''}</span>
                </div>
                <div className="-ml-1"><StarRating value={overall[key]} onChange={v => setOverall(p => ({ ...p, [key]: v }))} size={34} /></div>
              </div>
            ))}
            <div className="h-8" />
          </div>

          <div className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-5 py-4 space-y-2.5">
            <p className="text-[11px] text-gray-400 text-center">{t('Deinen Gutschein bekommst du unabhängig von deiner Bewertung.', 'You get your voucher regardless of your rating.')}</p>
            {submitError && <p className="text-[12px] text-red-500 text-center">{submitError}</p>}
            <button onClick={handleSubmitReview} disabled={!allRated || !allOverall || submitting}
              className="w-full h-[54px] rounded-[16px] shadow-lg flex items-center justify-between px-6 text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
              style={{ backgroundColor: (!allRated || !allOverall || submitting) ? '#9CA3AF' : 'var(--ba, #16A34A)' }}>
              <span className="text-[16px] font-medium">
                {submitting ? t('Wird gesendet…', 'Sending…') : livePoints > 0 ? t(`Absenden · +${livePoints} Punkte`, `Submit · +${livePoints} points`) : t('Absenden', 'Submit')}
              </span>
              <ArrowRight size={20} strokeWidth={1.75} />
            </button>
          </div>
        </motion.div>
      )}

      {screen === 'thanks' && (
        <motion.div key="thanks" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-[#0D1117]">

          {/* Der Empfang des Dankes: viel Weiß, ein Haken, ein Satz. Alles
              Weitere steht in eigenen Blöcken darunter. */}
          {/* Mittig, weil hier nichts mehr zu tun ist: der Haken, der Dank und
              der Name des Lokals stehen für sich. Linksbündig sah der Block aus
              wie der Anfang eines Formulars, das noch kommt. */}
          <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 pt-10 pb-8 flex flex-col items-center text-center">
            {/* Wie ein Briefkopf: Zeichen und Name des Lokals, dann der Dank.
                Der Weg des Gastes beginnt und endet beim Restaurant. */}
            <div className="flex items-center gap-2.5 mb-8 w-full">
              <BrandLogo brand={store.brand} size={28} textSize={24} rounded="rounded-lg" />
              <p className="text-[13px] font-medium text-gray-500 dark:text-gray-400 truncate">{store.brand?.name}</p>
              <div className="ml-auto">
                <GuestPointsChip points={store.guest.points} loggedIn={store.guest.loggedIn}
                  live={store.guest.loggedIn ? 0 : missedPts}
                  onClick={() => openVouchers('thanks')} />
              </div>
            </div>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
              <Check size={30} strokeWidth={3} className="text-white" />
            </motion.div>
            <p className="text-[22px] font-bold tracking-tight text-gray-900 dark:text-white" style={textColor}>{t('Vielen Dank!', 'Thank you!')}</p>
            <p className="text-[15px] text-gray-600 dark:text-gray-300 leading-relaxed mt-1.5 max-w-[280px]" style={textColor}>
              {t('Dein Feedback hilft uns, noch besser zu werden.', 'Your feedback helps us get even better.')}
            </p>
          </div>

          {/* Ohne Konto gibt es keine Punkte — das gehört hierher gesagt, und
              zwar mit dem Betrag, um den es geht. Sobald der Gast angemeldet
              ist, verschwindet der Hinweis auf jeden Fall: er darf nicht davon
              abhängen, dass das Nachbuchen der Punkte glückt, sonst steht der
              Gast vor einem Bildschirm, der ihn zu etwas auffordert, das er
              gerade erledigt hat. */}
          {missedPts > 0 && !store.guest.loggedIn ? (
            <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-7 space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Deine Punkte</p>
              <p className="text-[44px] font-bold tracking-tight leading-none" style={{ color: 'var(--ba, #16A34A)' }}>+{missedPts}</p>
              <p className="text-[15px] text-gray-600 dark:text-gray-300 leading-relaxed">
                Deine Bewertung ist angekommen. Die Punkte warten auf ein Konto:
                ohne Anmeldung können wir sie niemandem gutschreiben.
              </p>
              <PrimaryBtn onClick={() => setAuthOpen(true)}>Punkte sichern</PrimaryBtn>
              <p className="text-[12px] text-gray-400 leading-relaxed">
                Ohne Konto kannst du weiterhin alles bewerten. Die Punkte dafür
                werden dann nur nirgends gutgeschrieben.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-7">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Verdiente Punkte</p>
              <p className="text-[44px] font-bold tracking-tight leading-none mt-2 mb-5" style={{ color: 'var(--ba, #16A34A)' }}>+{pts}</p>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden mb-2">
                <motion.div initial={{ width: 0 }} animate={{ width: `${nextRewardPoints == null ? 100 : Math.min(100, (store.guest.points / nextRewardPoints) * 100)}%` }} transition={{ delay: 0.6, duration: 1.2 }}
                  className="h-full rounded-full" style={{ backgroundColor: 'var(--ba, #16A34A)' }} />
              </div>
              <div className="flex justify-between text-[12px] text-gray-500 dark:text-gray-400">
                <span>{store.guest.points} Pkt. insgesamt</span>
                <span>{nextRewardPoints == null ? 'keine weitere Belohnung offen' : `${nextRewardPoints} Pkt. = nächste Belohnung`}</span>
              </div>
            </div>
          )}

          {/* Aus derselben Bewertung ein fertiger Text für Google Maps.
              Der Gast hat sein Urteil gerade formuliert — das nochmal zu
              tippen, damit es öffentlich sichtbar wird, macht kaum jemand.
              Der Block erscheint erst, wenn der Text steht, und bleibt sonst
              einfach aus. */}
          {(reviewTextPending || reviewText) && (
            <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-7 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={16} strokeWidth={1.5} style={{ color: 'var(--ba)' }} />
                  <p className="text-[17px] font-medium text-gray-900 dark:text-white">Auch öffentlich teilen?</p>
                </div>
                <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  Aus deiner Bewertung ist dieser Text entstanden. Kopieren, bei Google einfügen, fertig.
                </p>
              </div>
              {reviewTextPending && !reviewText ? (
                <div className="space-y-2 py-1">
                  <Sk h={12} /><Sk h={12} /><Sk h={12} w="70%" />
                </div>
              ) : reviewText && (
                <>
                  <p className="text-[15px] text-gray-700 dark:text-gray-200 leading-relaxed bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
                    {reviewText.text}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(reviewText.text);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch { /* ohne Zwischenablage bleibt das Markieren von Hand */ }
                      }}
                      className="flex-1 h-[48px] rounded-[14px] text-[14px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5">
                      {copied ? <><Check size={15} strokeWidth={2.5} /> Kopiert</> : 'Text kopieren'}
                    </button>
                    <a href={reviewText.mapsUrl} target="_blank" rel="noreferrer"
                      className="flex-1 h-[48px] rounded-[14px] text-[14px] font-medium text-white text-center transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
                      style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                      <MapPin size={15} strokeWidth={2} /> Bei Google
                    </a>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Ohne Konto steht die Aufforderung schon oben am Punktestand, mit
              dem Betrag daneben. Ein zweiter Kasten mit demselben Ziel stand
              hier, ein dritter Knopf ganz unten — im Usability-Test war genau
              das der meistgenannte Störpunkt: es sah aus, als müsste man
              dreimal dasselbe tun. Es bleibt bei einer Aufforderung. */}
          {store.guest.loggedIn && (
            <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-7 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Deine Gutscheine</p>
              {unlockedVouchers.length === 0 ? (
                <p className="text-[14px] text-gray-500 dark:text-gray-400">
                  {nextRewardPoints == null
                    ? 'Zurzeit sind keine weiteren Gutscheine verfügbar.'
                    : `Noch kein Gutschein freigeschaltet. Es fehlen ${nextRewardPoints - store.guest.points} Punkte.`}
                </p>
              ) : unlockedVouchers.map(v => (
                <VoucherCard key={v.id} v={v} state="available" onAction={() => openVouchers('thanks')} />
              ))}
              {/* Kein „Alle Gutscheine" mehr: derselbe Weg steht als Knopf am
                  Fuß des Bildschirms, und zwei Wege zum selben Ziel auf einem
                  Bildschirm lesen sich wie zwei verschiedene Angebote. */}
            </div>
          )}

          {/* Der Abschluss sagt, was jetzt drin ist — nicht bloß „zurück".
              Ein Bildschirm, der nur einen Rückweg anbietet, endet die Sache;
              der Gast sitzt aber noch am Tisch, und genau hier ist der Moment,
              in dem ein freigeschalteter Gutschein etwas wert ist. Was der
              Knopf verspricht, hängt deshalb am Zustand: ein einlösbarer
              Gutschein wird angeboten, sonst der Weg zu den Punkten, und ohne
              Konto führt er dorthin, wo Punkte überhaupt erst hingehören. */}
          <div className="px-6 pt-7 pb-8 mt-auto space-y-3">
            {/* Ohne Konto steht hier KEINE Hauptaktion mehr: die eine
                Aufforderung „Punkte sichern" steht oben beim Betrag, um den
                es geht. Wer angemeldet ist, bekommt hier das, was jetzt
                wirklich ansteht. */}
            {/* Kein Knopf mehr, der einen bestimmten Gutschein direkt in den
                Wisch führt. Er trug den Namen des Gutscheins in voller Breite
                und in der Akzentfarbe des Lokals und war damit das Lauteste
                auf einem Bildschirm, der sich bedanken soll. Der Weg zum
                Einlösen bleibt: über die Gutscheinseite, wo der Gast sieht,
                was er sonst noch hat, statt einen vorgesetzt zu bekommen. */}
            {store.guest.loggedIn && (
              <PrimaryBtn onClick={() => openVouchers('thanks')}>
                Punkte &amp; Gutscheine ansehen
              </PrimaryBtn>
            )}
            {/* Auch der Dank-Bildschirm braucht einen Ausgang: sonst führt der
                einzige Weg zurück über das Neuladen der Seite. */}
            <button onClick={() => go('welcome')}
              className={`w-full min-h-[44px] rounded-xl text-[14px] font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors ${FOCUS_RING}`}>
              Zurück zum Start
            </button>
            <PoweredByBitely />
          </div>
        </motion.div>
      )}

      {screen === 'vouchers' && (
        <motion.div key="vouchers" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col flex-1 min-h-0">
          <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
            <div className="flex items-center gap-2 px-4 py-3">
              <button onClick={() => go(vouchersBack)} aria-label="Zurück" className={`w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 ${FOCUS_RING}`}>
                <ChevronLeft size={20} strokeWidth={1.5} className="text-gray-600 dark:text-gray-300" />
              </button>
              <p className="flex-1 text-[15px] font-semibold text-gray-900 dark:text-white truncate">Deine Gutscheine</p>
              <GuestPointsChip points={store.guest.points} loggedIn={store.guest.loggedIn} />
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
                  Punkte sammeln und einlösen geht nur mit Anmeldung. Sonst wüssten
                  wir nicht, wem die Punkte gehören.
                </p>
                <PrimaryBtn onClick={() => setAuthOpen(true)}>Punkte sichern</PrimaryBtn>
              </div>
            ) : (
              /* Der Weg ins eigene Konto. Er war eine 12-Pixel-Zeile in Grau
                 („Angemeldet als …"), und Punktestand prüfen, eingelöste
                 Gutscheine nachsehen und das Konto löschen kamen im
                 Usability-Test alle nur mit Suchen zustande. Jetzt ein Block
                 mit der Initiale, dem Namen und einem Pfeil: dieselbe Form,
                 in der Konten überall stehen. */
              <button onClick={() => openProfile('vouchers')}
                className={`w-full flex items-center gap-3 p-3 min-h-[56px] rounded-2xl text-left bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${FOCUS_RING}`}>
                <span className="w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center text-white text-[14px] font-bold"
                  style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                  {(store.guest.name ?? store.guest.email ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-medium text-gray-900 dark:text-white truncate">Dein Konto</span>
                  <span className="block text-[12px] text-gray-500 dark:text-gray-400 truncate">{store.guest.name ?? store.guest.email}</span>
                </span>
                <ChevronLeft size={16} className="rotate-180 flex-shrink-0 text-gray-400" strokeWidth={2} />
              </button>
            )}

            {vTab === 'Verfügbar' && (unlockedVouchers.length === 0
              ? <EmptyState icon={Zap} title="Noch nichts verfügbar" desc="Sammle weiter Punkte durch Bewertungen. Dein nächster Gutschein wartet." />
              : unlockedVouchers.map(v => <VoucherCard key={v.id} v={v} state="available" onAction={() => setRedeeming(v)} />))}
            {vTab === 'Gesperrt' && lockedVouchers.map(v => <VoucherCard key={v.id} v={v} state="locked" pointsMissing={v.points - store.guest.points} />)}
            {vTab === 'Eingelöst' && (redeemedVouchers.length === 0
              ? <EmptyState icon={CheckCircle2} title="Noch nichts eingelöst" desc="Eingelöste Gutscheine erscheinen hier." />
              : redeemedVouchers.map(v => {
                  // Eingelöst: der Gast kann den Bildschirm mit dem Häkchen
                  // jederzeit wieder aufmachen und der Servicekraft zeigen,
                  // auch wenn er ihn zwischendurch geschlossen hat.
                  const pending = store.redemptions.some(r => r.voucherId === v.id && (r.status === 'eingelöst' || r.status === 'entwertet'));
                  return <VoucherCard key={v.id} v={v} state="redeemed"
                    pending={pending} onAction={() => setRedeeming(v)} />;
                }))}
          </div>
        </motion.div>
      )}

      {/* DEIN KONTO — was am Gastkonto hängt, an einer Stelle.
          Erreichbar von der Gutscheinseite aus. Vorher gab es die Route zum
          Löschen des eigenen Kontos zwar auf dem Server, aber keinen Weg
          dorthin: wer ein Konto anlegen kann, muss es auch loswerden können. */}
      {screen === 'profile' && (
        <motion.div key="profile" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col flex-1 min-h-0">
          <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
            <div className="flex items-center gap-2 px-4 py-3">
              <button onClick={() => go(profileBack)} aria-label="Zurück" className={`w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 ${FOCUS_RING}`}>
                <ChevronLeft size={20} strokeWidth={1.5} className="text-gray-600 dark:text-gray-300" />
              </button>
              <p className="flex-1 text-[15px] font-semibold text-gray-900 dark:text-white truncate">Dein Konto</p>
              <GuestPointsChip points={store.guest.points} loggedIn={store.guest.loggedIn}
                onClick={() => openVouchers('profile')} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[18px] font-bold flex-shrink-0" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                  {(store.guest.name ?? store.guest.email ?? '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold text-gray-900 dark:text-white truncate">{store.guest.name ?? 'Gast'}</p>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate">{store.guest.email}</p>
                </div>
              </div>
              {/* Die beiden Zahlen sind keine Anzeige, sondern der Weg zu dem,
                  was dahintersteht: die Punkte zu den verfügbaren Gutscheinen,
                  die Zahl der eingelösten zu deren Liste. Vorher standen sie
                  als Sackgasse da, und wer nachsehen wollte, welchen Gutschein
                  er schon verbraucht hat, ging zurück und suchte den Reiter. */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {([
                  ['Punkte', String(store.guest.points), 'Verfügbar'],
                  ['Eingelöst', String(store.guest.redeemed.length), 'Eingelöst'],
                ] as const).map(([label, value, tab]) => (
                  <button key={label} onClick={() => openVouchers('profile', tab)}
                    className={`bg-gray-50 dark:bg-gray-900 rounded-xl p-3.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${FOCUS_RING}`}>
                    <p className="text-[11px] text-gray-400 uppercase tracking-wider">{label}</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-3">
              <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Eigener API-Schlüssel</p>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Mit einem eigenen Anthropic-Schlüssel schreibt die KI deinen
                Rezensionstext — sonst springt {store.brand?.name ?? 'das Restaurant'} auf eine
                Vorlage. Der Schlüssel wird verschlüsselt gespeichert und dir nie wieder angezeigt.
              </p>
              {apiKeyError && <p className="text-[12px] text-red-500">{apiKeyError}</p>}
              {apiKeyOpen ? (
                <div className="space-y-2">
                  <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
                    placeholder="sk-ant-…" autoComplete="off"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[14px] text-gray-900 dark:text-white outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white" />
                  <div className="flex gap-2">
                    <SecondaryBtn onClick={() => { setApiKeyOpen(false); setApiKeyInput(''); setApiKeyError(null); }}>Abbrechen</SecondaryBtn>
                    <button disabled={apiKeySaving || !apiKeyInput.trim()} onClick={async () => {
                        setApiKeySaving(true); setApiKeyError(null);
                        try {
                          await store.setGuestApiKey(apiKeyInput.trim());
                          setApiKeyOpen(false); setApiKeyInput('');
                        } catch (err) {
                          setApiKeyError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
                        } finally {
                          setApiKeySaving(false);
                        }
                      }}
                      className="flex-1 py-3 rounded-xl text-[14px] font-medium text-white transition-colors disabled:opacity-50"
                      style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                      {apiKeySaving ? 'Speichert…' : 'Speichern'}
                    </button>
                  </div>
                </div>
              ) : store.guestUser?.hasApiKey ? (
                <div className="space-y-2">
                  <p className="text-[13px] text-gray-700 dark:text-gray-300">Schlüssel hinterlegt.</p>
                  {confirmRemoveApiKey ? (
                    <div className="flex gap-2">
                      <SecondaryBtn onClick={() => setConfirmRemoveApiKey(false)}>Abbrechen</SecondaryBtn>
                      <button onClick={async () => { await store.removeGuestApiKey(); setConfirmRemoveApiKey(false); }}
                        className="flex-1 py-3 rounded-xl text-[14px] font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                        Ja, entfernen
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <SecondaryBtn onClick={() => setApiKeyOpen(true)}>Ersetzen</SecondaryBtn>
                      <SecondaryBtn onClick={() => setConfirmRemoveApiKey(true)}>Entfernen</SecondaryBtn>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => setApiKeyOpen(true)}
                  className="w-full py-3 rounded-xl text-[14px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  Schlüssel hinzufügen
                </button>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-3">
              <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Deine Punkte hängen an diesem Konto und gelten in allen Filialen von {store.brand?.name}.
              </p>
              <button onClick={async () => { await store.guestLogout(); go('welcome'); }}
                className="w-full py-3 rounded-xl text-[14px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Abmelden
              </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-3">
              <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Konto löschen</p>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Punkte und eingelöste Gutscheine verfallen dabei. Deine abgegebenen
                Bewertungen bleiben beim Restaurant. Sie hängen am Tisch, nicht an dir.
              </p>
              {deleteError && <p className="text-[12px] text-red-500">{deleteError}</p>}
              {confirmDelete ? (
                <div className="flex gap-2">
                  <SecondaryBtn onClick={() => setConfirmDelete(false)}>Abbrechen</SecondaryBtn>
                  <button onClick={async () => {
                      setDeleteError(null);
                      try {
                        await store.deleteGuestAccount();
                        setConfirmDelete(false);
                        go('welcome');
                      } catch (err) {
                        setDeleteError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
                      }
                    }}
                    className="flex-1 py-3 rounded-xl text-[14px] font-medium text-white bg-red-600 hover:bg-red-700 transition-colors">
                    Endgültig löschen
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="w-full py-3 rounded-xl text-[14px] font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                  Konto löschen
                </button>
              )}
            </div>
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
              {/* Das Blatt schließt SOFORT, nicht erst nach der Antwort des
                  Servers: es stand sonst eine gefühlte Ewigkeit offen, und wer
                  in der Zeit ein zweites Mal tippte, buchte das Gericht
                  doppelt. Der neue Eintrag erscheint darunter, sobald der
                  Zustand zurück ist — dafür braucht es das Blatt nicht mehr.

                  Getippt wird auf die ganze Zeile, nicht nur auf das Pluszeichen:
                  sie sah mit `cursor-pointer` schon immer so aus, als ginge das. */}
              <div className="overflow-y-auto p-4 pt-3 space-y-1">
                {store.dishes.filter(d => d.cat === sheetTab && (sheetQ === '' || d.name.toLowerCase().includes(sheetQ.toLowerCase()))).map(dish => (
                  <button key={dish.id} type="button"
                    onClick={() => {
                      setShowSheet(false);
                      store.addItemToTable(branch.slug, tableNumber, dish.id, 1)
                        .catch(() => { /* der Tisch bleibt, wie er war — der Gast kann es erneut versuchen */ });
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <img src={dish.img} alt={dish.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-gray-900 dark:text-white truncate">{dish.name}</p>
                      <p className="text-[12px] text-gray-400">{dish.price.toFixed(2)} €</p>
                    </div>
                    <span className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                      <Plus size={14} strokeWidth={2.5} />
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function VoucherCard({ v, state, onAction, pointsMissing, pending }: {
  v: Voucher; state: 'available' | 'locked' | 'redeemed'; onAction?: () => void;
  pointsMissing?: number;
  // Wahr, wenn dieser Gutschein entwertet ist, die Servicekraft die Ausgabe
  // aber noch nicht eingetragen hat. Dann führt die Karte zurück auf den
  // Bildschirm, den der Gast vorzeigt.
  pending?: boolean;
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
        {state === 'redeemed' && (pending
          ? <button onClick={onAction} className={`text-[13px] font-semibold px-4 min-h-[44px] rounded-xl whitespace-nowrap text-white ${FOCUS_RING}`} style={{ backgroundColor: 'var(--ba, #16A34A)' }}>Vorzeigen</button>
          : <span className="text-[12px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-lg whitespace-nowrap">Eingelöst</span>)}
        {state === 'available' && <button onClick={onAction} className={`text-[14px] font-semibold px-5 min-h-[44px] rounded-xl text-white whitespace-nowrap active:scale-[0.98] transition-transform ${FOCUS_RING}`} style={{ backgroundColor: 'var(--ba, #16A34A)' }}>Einlösen</button>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// WAITER APP
// ═══════════════════════════════════════════════════════════

type WaiterScreen = 'tables' | 'detail' | 'photo';

function WaiterApp({ orgSlug, branch }: { orgSlug: string; branch: Branch }) {
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
  // Bon-Scan: aufnehmen → erkennen lassen → prüfen → in den Warenkorb.
  // Gebucht wird NICHT automatisch: was das Modell liest, ist ein Vorschlag,
  // und eine Bestellung, die niemand bestätigt hat, gehört nicht auf den Tisch.
  const [photoStep, setPhotoStep] = useState<'scan' | 'working' | 'confirm'>('scan');
  const [scanHits, setScanHits] = useState<{ dishId: string; qty: number }[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // QR-Code des Tisches am eigenen Handy zeigen — der Gast scannt ihn direkt
  // vom Display ab, ohne dass am Tisch ein Aufsteller stehen muss.
  const [qrTable, setQrTable] = useState<number | null>(null);
  const cartTotal = Object.values(cart).reduce((a, b) => a + b, 0);

  // Alles in dieser Ansicht bezieht sich auf GENAU eine Filiale — sonst träfe
  // eine Tischnummer mehrere Tische.
  const branchTables = store.tables.filter(t => t.branchId === branch.id);

  const activeTable = activeTableNumber == null
    ? null
    : branchTables.find(t => t.number === activeTableNumber) ?? null;

  // Zwei Zustände, und der eine ist der, der Arbeit bedeutet: eine Bestellung
  // liegt an, deren Bewertung noch aussteht. Der wird hervorgehoben — aber nur
  // durch den Rahmen: schlichtes Orange außen, neutrale Fläche innen. Der
  // getönte Hintergrund und die Orange-auf-Orange-Schrift von früher waren
  // schwer zu lesen. Schrift innen weiß (dunkel) bzw. grau (hell).
  const statusCls: Record<TableRow['status'], string> = {
    frei: 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500',
    offen: 'bg-white dark:bg-gray-800 border-orange-500 text-gray-600 dark:text-white',
  };

  const openAlerts = store.alerts.filter(a => !a.resolved && a.branchId === branch.id);

  // Alle paar Sekunden nachladen, damit neue Bestellungen, Tischwechsel und
  // Alarme ohne Zutun erscheinen. Gutschein-Einlösungen tauchen hier bewusst
  // NICHT mehr als Banner auf — der Wisch des Gastes entwertet endgültig, mehr
  // muss die Servicekraft dazu nicht tun. Die Übersicht steht in der
  // Verwaltung unter „Einlösungen".
  useEffect(() => {
    const iv = setInterval(() => { store.refresh(); }, 12000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Tisch freigeben: laufende Bestellung abräumen, damit die nächsten Gäste
  // einen leeren Tisch vorfinden. Zusätzlich räumt der Server nach zwei Stunden
  // von selbst ab, siehe releaseStaleTables — daran zu denken ist Handarbeit.
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

  // Foto aufnehmen und lesen lassen. Verkleinert wird im Browser: ein
  // Handy-Foto in Originalgröße wäre mehrere Megabyte, und für die Schrift
  // auf einem Bon genügen 1600 Pixel Kantenlänge.
  const handlePhotoFile = async (file: File) => {
    setScanError(null);
    setPhotoStep('working');
    try {
      const dataUri = await compressImageFile(file, 1600, 0.75);
      const items = await store.scanReceipt(branch.slug, dataUri);
      setScanHits(items);
      setPhotoStep('confirm');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Der Bon konnte nicht gelesen werden.');
      setPhotoStep('scan');
    }
  };

  // Die erkannten Gerichte landen im Warenkorb, nicht auf dem Tisch — gebucht
  // wird wie sonst auch mit „Bestellung speichern", nachdem jemand daraufgesehen hat.
  const handleSavePhotoScan = () => {
    setCart(p => {
      const next = { ...p };
      for (const hit of scanHits) next[hit.dishId] = (next[hit.dishId] ?? 0) + hit.qty;
      return next;
    });
    setScanHits([]);
    setPhotoStep('scan');
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
              {([['bg-gray-300', 'Frei'], ['bg-orange-500', 'Bewertung offen']] as const).map(([cls, l]) => (
                <span key={l} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${cls}`} />{l}</span>
              ))}
            </div>
          </div>
          {branchTables.length === 0 && (
            <EmptyState icon={LayoutDashboard} title="Noch keine Tische"
              desc={`Für ${branch.name} ist noch kein Tisch angelegt. Das macht der Admin unter „Tische & QR".`} />
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
            {/* „Favoriten" ist raus: der Reiter war eine Attrappe. Es gab
                nirgends ein ★ zum Antippen, also blieb er für immer leer und
                nahm nur ein Drittel der Zeile weg. */}
            <div className="mb-4"><TabBar tabs={['Speisen', 'Getränke']} active={tab} onChange={setTab} /></div>
            <div className="flex-1 min-h-0 overflow-y-auto">
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
            </div>
          </div>
          <div className="flex-none max-h-[45vh] md:max-h-none md:w-72 min-h-0 bg-white dark:bg-gray-900 border-t md:border-t-0 md:border-l border-gray-100 dark:border-gray-800 flex flex-col flex-shrink-0">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Tisch {activeTable.number}</p>
                <p className="text-[13px] text-gray-400">{cartTotal > 0 ? `${cartTotal} Gerichte` : 'Noch leer'}</p>
              </div>
              {/* Den QR-Code vom eigenen Handy zeigen: der Gast scannt ihn
                  direkt vom Display ab. Nützlich, wenn am Tisch kein Aufsteller
                  steht oder der Code unleserlich geworden ist. */}
              <button onClick={() => setQrTable(activeTable.number)}
                className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
                <QrCode size={13} strokeWidth={1.5} /> QR zeigen
              </button>
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
                {/* Heißt "Neue Gäste", weil das der Moment ist, in dem jemand
                    ihn drückt: der Tisch wird eingedeckt, und was die vorige
                    Runde bestellt hat, hat darauf nichts mehr verloren. */}
                <button onClick={() => setConfirm('close')}
                  disabled={saving || (activeTable.status === 'frei' && activeTable.items.length === 0)}
                  className="flex-1 py-3.5 rounded-xl text-[14px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Neue Gäste
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
                <p className="text-[15px] text-gray-500 mt-1">
                  Fotografiere den POS-Bon. Die Gerichte werden erkannt und in den Warenkorb gelegt.
                  Gebucht wird erst, wenn du sie geprüft und gespeichert hast.
                </p>
              </div>
              {/* Am Handy öffnet capture="environment" direkt die Rückkamera,
                  am Rechner den Dateiwähler. Beides führt zum selben Ergebnis. */}
              <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); e.target.value = ''; }} />
              <button onClick={() => photoInputRef.current?.click()}
                className="w-full bg-gray-900 dark:bg-gray-800 rounded-2xl overflow-hidden flex items-center justify-center relative hover:opacity-90 transition-opacity"
                style={{ aspectRatio: '4/3' }}>
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
                <span className="absolute bottom-4 text-white/40 text-[13px]">Tippen zum Aufnehmen</span>
              </button>
              {scanError && (
                <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
                  <AlertOctagon size={15} className="text-red-500 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  <p className="flex-1 text-[13px] text-red-700 dark:text-red-300 leading-relaxed">{scanError}</p>
                </div>
              )}
              <button onClick={() => photoInputRef.current?.click()}
                className="w-full py-4 rounded-xl text-[15px] font-medium text-white flex items-center justify-center gap-2" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                <Camera size={18} strokeWidth={1.5} /> Aufnehmen
              </button>
            </div>
          ) : photoStep === 'working' ? (
            <div className="w-full max-w-lg text-center space-y-4 py-10">
              <Loader2 size={28} className="animate-spin mx-auto text-gray-400" strokeWidth={1.5} />
              <p className="text-[15px] font-medium text-gray-900 dark:text-white">Bon wird gelesen…</p>
              <p className="text-[13px] text-gray-500">Das dauert ein paar Sekunden.</p>
            </div>
          ) : (
            <div className="w-full max-w-lg space-y-5">
              <div>
                <CheckCircle2 size={28} className="mb-3" style={{ color: 'var(--ba)' }} strokeWidth={1.5} />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {scanHits.length > 0 ? 'Gerichte erkannt' : 'Nichts erkannt'}
                </p>
                <p className="text-[15px] text-gray-500 mt-1">
                  {scanHits.length > 0
                    ? 'Prüfe die Liste, falsches einfach entfernen.'
                    : 'Auf dem Bild war keine Position der Karte zu finden. Versuch es noch einmal, näher dran und heller.'}
                </p>
              </div>
              {scanHits.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
                  <p className="text-[13px] text-gray-500 mb-3">Erkannte Gerichte ({scanHits.length})</p>
                  <div className="space-y-2">
                    {scanHits.map(hit => {
                      const dish = store.dishes.find(d => d.id === hit.dishId);
                      if (!dish) return null;
                      return (
                        <div key={hit.dishId} className="flex items-center gap-3">
                          <img src={dish.img} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                          <p className="flex-1 text-[14px] text-gray-800 dark:text-gray-200 line-clamp-1">{dish.name}</p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button onClick={() => setScanHits(p => p.flatMap(h => h.dishId !== hit.dishId ? [h] : h.qty > 1 ? [{ ...h, qty: h.qty - 1 }] : []))}
                              className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                              <Minus size={11} strokeWidth={2} className="text-gray-600 dark:text-gray-400" />
                            </button>
                            <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 w-5 text-center">{hit.qty}</span>
                            <button onClick={() => setScanHits(p => p.map(h => h.dishId === hit.dishId ? { ...h, qty: Math.min(20, h.qty + 1) } : h))}
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                              <Plus size={11} strokeWidth={2.5} />
                            </button>
                          </div>
                          <button onClick={() => setScanHits(p => p.filter(h => h.dishId !== hit.dishId))}
                            className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"><X size={14} strokeWidth={2} /></button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!activeTable && scanHits.length > 0 && (
                <p className="text-[12px] text-gray-400">
                  Noch kein Tisch gewählt. Die Gerichte landen im Warenkorb, den du beim nächsten Tisch vorfindest.
                </p>
              )}
              <div className="flex gap-3">
                <SecondaryBtn onClick={() => { setScanHits([]); setPhotoStep('scan'); }}>Neu aufnehmen</SecondaryBtn>
                {scanHits.length > 0 && (
                  <PrimaryBtn onClick={handleSavePhotoScan}>In den Warenkorb</PrimaryBtn>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {qrTable !== null && (
          <BigTableQR orgSlug={orgSlug} branch={branch} tableNumber={qrTable} onClose={() => setQrTable(null)} />
        )}
      </AnimatePresence>

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
                      : `Tisch ${activeTable?.number} für neue Gäste freigeben?`}
                  </p>
                  <p className="text-[14px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                    {confirm === 'save'
                      ? `${cartTotal} Gerichte · Die Gäste erhalten den Feedback-Link per QR-Code.`
                      : 'Die laufende Bestellung wird abgeräumt und der Tisch steht wieder leer. Noch nicht abgegebene Bewertungen der vorigen Gäste sind damit nicht mehr möglich.'}
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
                    <PrimaryBtn onClick={handleCloseTable} disabled={saving}>{saving ? 'Räumt ab…' : 'Freigeben'}</PrimaryBtn>
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

/**
 * Der QR-Code eines Tisches, groß, auf dem Handy der Servicekraft.
 *
 * Bewusst eine eigene Darstellung statt der Admin-Kachel: die ist 96 Pixel
 * groß und für eine Übersicht gedacht. Zum Abscannen vom Display eines anderen
 * Geräts braucht es Fläche und einen weißen Grund.
 */
function BigTableQR({ orgSlug, branch, tableNumber, onClose }: {
  orgSlug: string; branch: Branch; tableNumber: number; onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = tableUrl(orgSlug, branch.slug, tableNumber);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 560, margin: 2, color: { dark: '#111827', light: '#ffffff' } }).catch(() => {});
  }, [url]);

  return (
    <>
      <motion.div className="fixed inset-0 bg-black/60 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-5"
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
        <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm text-center space-y-4">
          <div>
            <p className="text-[19px] font-bold text-gray-900">Tisch {tableNumber}</p>
            <p className="text-[13px] text-gray-500">{branch.name} · zum Abscannen hinhalten</p>
          </div>
          <canvas ref={canvasRef} className="w-full h-auto max-w-[280px] mx-auto" />
          {/* Nicht jedes Handy kommt an den Code: eine gesprungene Kameralinse,
              eine Kamera, die der Gast nicht freigeben will, oder ein Gast, der
              seine Brille nicht dabei hat. Deshalb steht die VOLLE Adresse
              darunter, anklickbar und zum Weitergeben — vorher stand dort nur
              der Pfad ohne Server davor, mit dem niemand etwas anfangen konnte. */}
          <a href={url} target="_blank" rel="noreferrer"
            className="block text-[12px] font-mono break-all text-gray-500 hover:text-gray-900 underline decoration-gray-300 underline-offset-2 transition-colors">
            {url}
          </a>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch { /* ohne Zwischenablage bleibt das Markieren von Hand */ }
              }}
              className="flex-1 py-3 rounded-xl text-[14px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5">
              {copied ? <><Check size={14} strokeWidth={2.5} /> Kopiert</> : 'Link kopieren'}
            </button>
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-[14px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
              Schließen
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
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
      {/* Anklickbar: der schnellste Weg, einen Tisch so zu sehen, wie ihn der
          Gast sieht — ohne den Code mit dem eigenen Handy abzuscannen. */}
      <a href={url} target="_blank" rel="noreferrer" title={url}
        className="text-[10px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-mono break-all text-center underline decoration-gray-200 dark:decoration-gray-700 underline-offset-2 transition-colors">
        /{orgSlug}/{branchSlug}/table/{tableNumber}
      </a>
      {/* Der Download nimmt die Breite, das Löschen ist ein rotes Symbol
          daneben. Rot und Mülltonne sagen dasselbe wie das Wort, brauchen aber
          keinen Platz, und der PNG-Knopf war als schmale Hälfte zu klein zum
          Treffen. */}
      <div className="flex items-center gap-2 w-full pt-0.5">
        <button onClick={download}
          className="flex-1 flex items-center justify-center gap-2 text-[13px] font-medium py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800 transition-colors">
          <Download size={15} strokeWidth={1.5} /> PNG
        </button>
        {onDelete && (
          <button onClick={onDelete} title={`Tisch ${tableNumber} löschen`}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
            <Trash2 size={17} strokeWidth={1.5} />
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
  const t = useT();
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
          {value ? t('Foto ändern', 'Change photo') : t('Foto wählen', 'Choose photo')}
        </button>
      </div>
      {failed && <p className="text-[11px] text-red-500 mt-1">{t('Das Bild konnte nicht gelesen werden.', 'The image could not be read.')}</p>}
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
  const t = useT();
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
          {t('In allen Filialen', 'At all branches')}
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

// ═══════════════════════════════════════════════════════════
// CSV-IMPORT DER SPEISEKARTE
//
// Der Gegenpart zu downloadCsv: eine Karte kommt selten getippt, sondern als
// Tabelle aus der Kassensoftware. Vierzig Gerichte einzeln über den Dialog
// anzulegen ist eine Stunde Arbeit, bei der man sich verzählt.
// ═══════════════════════════════════════════════════════════

/**
 * Zerlegt CSV-Text in Zeilen aus Feldern.
 *
 * Eigener Parser statt einer Bibliothek, weil das Format hier eng ist: was
 * Excel und die üblichen Kassensysteme ausgeben. Beherrscht werden muss
 * genau dreierlei — Anführungszeichen um Felder mit Trennzeichen darin, das
 * verdoppelte Anführungszeichen als Escape, und Zeilenumbrüche INNERHALB
 * eines solchen Feldes. Ein Zeilenweise-Splitten davor würde am Letzteren
 * scheitern.
 */
function parseCsv(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  // Byte Order Mark: Excel schreibt ihn, und ohne dieses Abschneiden hieße
  // die erste Spalte "﻿Gericht" statt "Gericht".
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === sep) { row.push(field); field = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

/** Was der Import aus einer Zeile macht — oder woran sie scheiterte. */
type ImportRow =
  | { ok: true; line: number; name: string; price: number; cat: Dish['cat']; duplicate: boolean }
  | { ok: false; line: number; raw: string; reason: string };

/**
 * Liest eine Speisekarte aus CSV.
 *
 * Erwartet eine Kopfzeile. Welche Spalte was ist, entscheidet ihr Name und
 * nicht ihre Stelle — eine Datei mit vertauschten Spalten würde sonst
 * kommentarlos Preise als Namen anlegen. Erkannt werden die Bezeichnungen, die
 * `exportDishesCsv` selbst schreibt, dazu die englischen: eine exportierte
 * Datei muss sich wieder einlesen lassen.
 */
function parseDishCsv(text: string, existing: Dish[]): { rows: ImportRow[]; error: string | null } {
  const trimmed = text.trim();
  if (trimmed === '') return { rows: [], error: 'Die Datei ist leer.' };

  // Semikolon zuerst: das deutsche Excel schreibt es, und ein Preis wie
  // "12,50" macht das Komma als Trennzeichen ohnehin unbrauchbar.
  const head = trimmed.split(/\r?\n/, 1)[0];
  const sep = head.split(';').length > head.split(',').length ? ';' : ',';

  const rows = parseCsv(trimmed, sep);
  if (rows.length === 0) return { rows: [], error: 'Die Datei ist leer.' };

  const header = rows[0].map(h => h.trim().toLowerCase());
  const find = (...names: string[]) => header.findIndex(h => names.includes(h));
  const iName = find('gericht', 'name', 'bezeichnung', 'dish', 'artikel');
  const iPrice = find('preis', 'price', 'betrag');
  const iCat = find('kategorie', 'category', 'cat', 'warengruppe');

  if (iName < 0) {
    return {
      rows: [],
      error: 'Keine Spalte für den Namen gefunden. Die Kopfzeile braucht „Gericht" (oder „Name"), dazu „Preis" und optional „Kategorie".',
    };
  }

  // Namen, die schon vergeben sind — in der Datei selbst wie in der Karte.
  // Angelegt wird trotzdem nichts doppelt: die Zeile wird übersprungen.
  const seen = new Set(existing.map(d => d.name.trim().toLowerCase()));
  const out: ImportRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const line = r + 1;
    const raw = cells.join(sep);
    const name = (cells[iName] ?? '').trim();
    if (name === '') { out.push({ ok: false, line, raw, reason: 'Kein Name.' }); continue; }

    // "12,50 €", "€ 12.50", "12.50" — alles, was in freier Wildbahn vorkommt.
    const priceText = (iPrice >= 0 ? cells[iPrice] ?? '' : '').replace(/[^0-9,.-]/g, '').replace(',', '.');
    const price = Number(priceText);
    if (iPrice >= 0 && priceText !== '' && !Number.isFinite(price)) {
      out.push({ ok: false, line, raw, reason: `Preis „${cells[iPrice]}" ist keine Zahl.` });
      continue;
    }
    if (price < 0) { out.push({ ok: false, line, raw, reason: 'Preis ist negativ.' }); continue; }

    // Alles, was nach Trinken klingt, wird Getränk; sonst Speise. Die Karte
    // kennt nur diese beiden, und eine dritte Kategorie stillschweigend zu
    // Speisen zu machen wäre falscher als die Ahnung hier.
    const catText = (iCat >= 0 ? cells[iCat] ?? '' : '').trim().toLowerCase();
    const cat: Dish['cat'] = /getränk|getraenk|drink|beverage|bar|wein|bier/.test(catText) ? 'Getränke' : 'Speisen';

    const key = name.toLowerCase();
    out.push({ ok: true, line, name, price: Number.isFinite(price) ? price : 0, cat, duplicate: seen.has(key) });
    seen.add(key);
  }

  if (out.length === 0) return { rows: [], error: 'Außer der Kopfzeile steht nichts in der Datei.' };
  return { rows: out, error: null };
}

/**
 * Speisekarte aus einer CSV-Datei anlegen.
 *
 * Zwei Schritte, und der erste ist die Vorschau: ein Import, der ohne Nachfrage
 * vierzig Gerichte in die Karte kippt, ist beim ersten falschen Trennzeichen
 * eine halbe Stunde Aufräumen. Angelegt wird erst auf ausdrücklichen Knopfdruck,
 * und was schon in der Karte steht, wird übersprungen statt verdoppelt.
 */
function DishImportDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const t = useT();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const read = (text: string, name: string | null) => {
    const result = parseDishCsv(text, store.dishes);
    setFileName(name);
    setParseError(result.error);
    setRows(result.error ? null : result.rows);
    setDone(null);
    setError(null);
  };

  const fresh = (rows ?? []).filter((r): r is Extract<ImportRow, { ok: true }> => r.ok && !r.duplicate);
  const skipped = (rows ?? []).filter(r => r.ok && r.duplicate).length;
  const broken = (rows ?? []).filter(r => !r.ok);

  const run = async () => {
    if (busy || fresh.length === 0) return;
    setBusy(true);
    setError(null);
    let created = 0;
    let failed = 0;
    // Nacheinander, nicht nebenläufig: jede Antwort trägt den vollständigen
    // Zustand, und zwanzig gleichzeitige Aufrufe würden sich gegenseitig
    // überschreiben — die Karte sähe danach unvollständig aus, bis jemand neu lädt.
    for (const row of fresh) {
      try {
        await store.addDish({ name: row.name, price: row.price, cat: row.cat });
        created++;
      } catch {
        failed++;
      }
    }
    setBusy(false);
    setDone({ created, failed });
    if (failed > 0) setError(t(`${failed} ${failed === 1 ? 'Gericht' : 'Gerichte'} konnten nicht angelegt werden.`, `${failed} ${failed === 1 ? 'dish' : 'dishes'} could not be created.`));
  };

  return (
    <AdminModal title={t('Speisekarte importieren', 'Import menu')} onClose={onClose} footer={
      done ? (
        <PrimaryBtn onClick={onClose}>{t('Fertig', 'Done')}</PrimaryBtn>
      ) : (
        <>
          <SecondaryBtn onClick={onClose}>{t('Abbrechen', 'Cancel')}</SecondaryBtn>
          <PrimaryBtn onClick={run} disabled={busy || fresh.length === 0}>
            {busy ? t('Wird angelegt…', 'Creating…') : fresh.length > 0 ? t(`${fresh.length} anlegen`, `Create ${fresh.length}`) : t('Anlegen', 'Create')}
          </PrimaryBtn>
        </>
      )
    }>
      {done ? (
        <div className="space-y-2">
          <p className="text-[14px] text-gray-700 dark:text-gray-200">
            {t(`${done.created} ${done.created === 1 ? 'Gericht' : 'Gerichte'} angelegt.`, `${done.created} ${done.created === 1 ? 'dish' : 'dishes'} created.`)}
          </p>
          <p className="text-[12px] text-gray-400 leading-relaxed">
            {t('Preise und Kategorien stehen jetzt in der Karte. Fotos fehlen noch, die lädst du je Gericht in der Liste hoch.',
               'Prices and categories are in the menu now. Photos are still missing — add them per dish in the list.')}
          </p>
        </div>
      ) : (
        <>
          <div>
            <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
              {t('Eine Zeile je Gericht, mit Kopfzeile. Gebraucht wird die Spalte „Gericht", dazu gern „Preis" und „Kategorie". Komma oder Semikolon als Trennzeichen, beides wird erkannt, wie auch die Datei aus „Export" auf dieser Seite.',
                 'One row per dish, with a header line. The "Gericht" (dish) column is required; "Preis" (price) and "Kategorie" (category) are welcome too. Comma or semicolon as separator — both are recognised, as is the file from "Export" on this page.')}
            </p>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                f.text()
                  .then(text => read(text, f.name))
                  .catch(() => setParseError(t('Die Datei konnte nicht gelesen werden.', 'The file could not be read.')));
              }} />
            <button onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-[13px] text-gray-600 dark:text-gray-300 hover:border-gray-400 transition-colors">
              <Upload size={14} strokeWidth={1.5} /> {fileName ?? t('CSV-Datei wählen', 'Choose CSV file')}
            </button>
          </div>

          <div>
            <p className="text-[12px] text-gray-400 mb-1.5">{t('…oder den Inhalt hier einfügen', '…or paste the content here')}</p>
            <textarea rows={4} placeholder={'Gericht;Kategorie;Preis\nMiso-Suppe;Speisen;4,50'}
              onChange={e => read(e.target.value, null)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[13px] font-mono text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors resize-y" />
          </div>

          {parseError && <DialogError message={parseError} />}
          {error && <DialogError message={error} />}

          {rows && (
            <div className="space-y-2">
              <p className="text-[13px] text-gray-700 dark:text-gray-200">
                {t(`${fresh.length} neu`, `${fresh.length} new`)}
                {skipped > 0 && <span className="text-gray-400"> · {t(`${skipped} schon in der Karte`, `${skipped} already in the menu`)}</span>}
                {broken.length > 0 && <span className="text-red-500"> · {t(`${broken.length} fehlerhaft`, `${broken.length} with errors`)}</span>}
              </p>
              <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-800">
                {rows.map(r => r.ok ? (
                  <div key={r.line} className={`flex items-center gap-2 px-3 py-2 text-[13px] ${r.duplicate ? 'opacity-45' : ''}`}>
                    <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{r.name}</span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">{r.cat}</span>
                    <span className="text-[12px] text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums">{r.price.toFixed(2)} €</span>
                    {r.duplicate && <span className="text-[11px] text-gray-400 flex-shrink-0">{t('übersprungen', 'skipped')}</span>}
                  </div>
                ) : (
                  <div key={r.line} className="px-3 py-2 text-[12px]">
                    <p className="text-red-600 dark:text-red-400">{t('Zeile', 'Line')} {r.line}: {r.reason}</p>
                    <p className="text-gray-400 truncate font-mono">{r.raw}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AdminModal>
  );
}

function DishDialog({ dish, onClose }: { dish: Dish | null; onClose: () => void }) {
  const store = useStore();
  const t = useT();
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
    <AdminModal title={dish ? t('Gericht bearbeiten', 'Edit dish') : t('Gericht hinzufügen', 'Add dish')} onClose={onClose}
      footer={<>
        <SecondaryBtn onClick={onClose}>{t('Abbrechen', 'Cancel')}</SecondaryBtn>
        <PrimaryBtn onClick={handleSave} disabled={!valid || saving}>{saving ? t('Speichern…', 'Saving…') : t('Speichern', 'Save')}</PrimaryBtn>
      </>}>
      <div className="space-y-3">
        <Field label={t('Name', 'Name')} value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Spicy Tuna Roll" />
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label={t('Preis (€)', 'Price (€)')} type="text" value={form.price} onChange={v => setForm(p => ({ ...p, price: v }))} placeholder="14.50" />
          </div>
          <div className="flex-1">
            <label className="text-[12px] text-gray-500 mb-1 block">{t('Kategorie', 'Category')}</label>
            <select value={form.cat} onChange={e => setForm(p => ({ ...p, cat: e.target.value as Dish['cat'] }))}
              className={FIELD_CLASS}>
              {(['Speisen', 'Getränke'] as const).map(c => <option key={c} value={c}>{c === 'Speisen' ? t('Speisen', 'Food') : t('Getränke', 'Drinks')}</option>)}
            </select>
          </div>
        </div>
        <ImageField label={t('Foto', 'Photo')} value={form.img} onChange={v => setForm(p => ({ ...p, img: v }))} />
        <BranchScopeField label={t('Wird geführt in', 'Served at')} value={form.branchIds}
          hint={t('Die Filialleitung kann das Gericht später für ihre Filiale zusätzlich ab- oder anschalten.', 'Branch managers can additionally toggle the dish for their own branch later.')}
          onChange={v => setForm(p => ({ ...p, branchIds: v }))} />
        <DialogError message={error} />
      </div>
    </AdminModal>
  );
}

function VoucherDialog({ voucher, onClose }: { voucher: Voucher | null; onClose: () => void }) {
  const store = useStore();
  const t = useT();
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
    <AdminModal title={voucher ? t('Gutschein bearbeiten', 'Edit voucher') : t('Gutschein hinzufügen', 'Add voucher')} onClose={onClose}
      footer={<>
        <SecondaryBtn onClick={onClose}>{t('Abbrechen', 'Cancel')}</SecondaryBtn>
        <PrimaryBtn onClick={handleSave} disabled={!valid || saving}>{saving ? t('Speichern…', 'Saving…') : t('Speichern', 'Save')}</PrimaryBtn>
      </>}>
      <div className="space-y-3">
        <Field label={t('Titel', 'Title')} value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} placeholder={t('Gratis Miso Suppe', 'Free miso soup')} />
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label={t('Punkte', 'Points')} type="number" value={form.points} onChange={v => setForm(p => ({ ...p, points: v }))} placeholder="100" />
          </div>
          <div className="flex-1">
            <Field label={t('Gültig bis', 'Valid until')} value={form.expiry} onChange={v => setForm(p => ({ ...p, expiry: v }))} placeholder="31.12.2026" />
          </div>
        </div>
        <ImageField label={t('Bild', 'Image')} value={form.img} onChange={v => setForm(p => ({ ...p, img: v }))} aspect="wide" />
        <BranchScopeField label={t('Einlösbar in', 'Redeemable at')} value={form.branchIds}
          hint={t('Punkte sammelt der Gast in der ganzen Kette. Ein Gutschein nur für eine Filiale sollte die Ausnahme bleiben.', 'Guests collect points across the whole chain. A single-branch voucher should stay the exception.')}
          onChange={v => setForm(p => ({ ...p, branchIds: v }))} />
        <DialogError message={error} />
      </div>
    </AdminModal>
  );
}

function BranchDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const store = useStore();
  const t = useT();
  const { saving, error, save } = useDialogSave(onClose);
  const [form, setForm] = useState({
    name: branch?.name ?? '', address: branch?.address ?? '',
    googleMapsUrl: branch?.googleMapsUrl ?? '',
    coverImage: (branch?.coverImage ?? null) as string | null,
  });
  const valid = form.name.trim() !== '' && form.address.trim() !== '';

  const handleSave = () => save(async () => {
    const payload = {
      name: form.name.trim(), address: form.address.trim(),
      googleMapsUrl: form.googleMapsUrl.trim() || null,
      coverImage: form.coverImage,
    };
    if (branch) await store.updateBranch(branch.id, payload);
    else await store.addBranch(payload);
  });

  return (
    <AdminModal title={branch ? t('Filiale bearbeiten', 'Edit branch') : t('Filiale hinzufügen', 'Add branch')} onClose={onClose}
      footer={<>
        <SecondaryBtn onClick={onClose}>{t('Abbrechen', 'Cancel')}</SecondaryBtn>
        <PrimaryBtn onClick={handleSave} disabled={!valid || saving}>{saving ? t('Speichern…', 'Saving…') : t('Speichern', 'Save')}</PrimaryBtn>
      </>}>
      <div className="space-y-3">
        <Field label={t('Name', 'Name')} value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Herrengasse" />
        <Field label={t('Adresse', 'Address')} value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="Herrengasse 12, 8010 Graz" />
        {/* Der Dank-Bildschirm schickt Gäste mit ihrer fertig formulierten
            Rezension hierher. Ohne Wert entsteht ein Suchlink aus Name und
            Adresse — der trifft meist, aber nicht immer. */}
        <Field label={t('Google-Maps-Link', 'Google Maps link')} value={form.googleMapsUrl}
          onChange={v => setForm(p => ({ ...p, googleMapsUrl: v }))}
          placeholder="https://maps.app.goo.gl/…"
          hint={t('Optional. Dorthin schicken wir Gäste, die ihre Bewertung öffentlich teilen wollen.', 'Optional. Where we send guests who want to share their review publicly.')} />
        {/* Standortfoto: der Gast am Tisch dieser Filiale sieht es auf dem
            Empfangsbildschirm. Ohne eines greift das kettenweite Titelbild
            aus „Design". */}
        <div>
          <ImageField label={t('Standortfoto (optional)', 'Location photo (optional)')} value={form.coverImage} aspect="wide"
            onChange={v => setForm(p => ({ ...p, coverImage: v }))} />
          {form.coverImage && (
            <button type="button" onClick={() => setForm(p => ({ ...p, coverImage: null }))}
              className="text-[11px] text-gray-400 hover:text-red-500 mt-1">{t('Entfernen', 'Remove')}</button>
          )}
        </div>
        <DialogError message={error} />
      </div>
    </AdminModal>
  );
}

// ═══════════════════════════════════════════════════════════
// ADMIN APP
// ═══════════════════════════════════════════════════════════

type AdminPage = 'dashboard' | 'reviews' | 'menu' | 'tables' | 'vouchers' | 'redemptions' | 'design' | 'users' | 'settings';

// branch === null heißt "alle Filialen": der Ketten-Admin sieht die Zahlen
// aller Standorte zusammen. Alles Filialgebundene (Tische, QR-Codes) braucht
// dann erst eine Auswahl.
/**
 * Zeiträume des Dashboards. `all` heißt: kein Filter, alles seit Beginn;
 * `custom` heißt: zwei Datumsfelder darunter bestimmen ihn.
 */
type RangeKey = '7' | '30' | '90' | 'all' | 'custom';
const RANGES: { key: RangeKey; de: string; en: string }[] = [
  { key: '7', de: '7 Tage', en: '7 days' },
  { key: '30', de: '30 Tage', en: '30 days' },
  { key: '90', de: '90 Tage', en: '90 days' },
  { key: 'all', de: 'Alles', en: 'All' },
  { key: 'custom', de: 'Zeitraum…', en: 'Range…' },
];

type DishSortKey = 'name' | 'avg' | 'count' | 'price';

/** Spalten der Gerichtstabelle — am Handy zugleich die Sortier-Auswahl. */
const DISH_COLUMNS: [DishSortKey, string, string][] = [
  ['name', 'Gericht', 'Dish'], ['avg', 'Ø Bewertung', 'Avg rating'], ['count', 'Bewertungen', 'Reviews'], ['price', 'Preis', 'Price'],
];

/**
 * Die vier Felder, in die sich jedes Gericht einordnet — aus Note und Anzahl.
 *
 * Die Reihenfolge ist die des Lesens, nicht die der Dringlichkeit: erst was
 * läuft, dann was auffallen könnte, dann was Arbeit macht.
 */
type QuadrantId = 'stars' | 'hidden' | 'fix' | 'watch';

/**
 * Die Farbe steckt im Punkt, nicht in der Schrift.
 *
 * Vorher war jedes Feld der Legende in seiner eigenen Tönung gehalten —
 * heller Grund, dunklere Schrift derselben Farbe: ein Kästchen aus Rot,
 * Hellrot und Dunkelrot, in dem der Text schlechter zu lesen war als in
 * Schwarz. Ein farbiger Punkt sagt dasselbe und lässt die Schrift in Ruhe.
 *
 * `hex` ist dieselbe Farbe wie die Punkte im Streudiagramm — und zwar
 * wörtlich dieselbe Quelle: ein Punkt oben und seine Erklärung unten dürfen
 * nie auseinanderlaufen, sonst ist die Legende keine.
 */
const QUADRANTS: { id: QuadrantId; title: string; titleEn: string; desc: string; descEn: string; hex: string }[] = [
  { id: 'stars', title: 'Zugpferde', titleEn: 'Stars', desc: 'Hohe Bewertung, viele Rezensionen', descEn: 'High rating, many reviews', hex: '#10b981' },
  { id: 'hidden', title: 'Geheimtipps', titleEn: 'Hidden gems', desc: 'Hohe Bewertung, wenige Rezensionen', descEn: 'High rating, few reviews', hex: '#9ca3af' },
  { id: 'fix', title: 'Verbesserungsbedarf', titleEn: 'Needs work', desc: 'Niedrige Bewertung, viele Rezensionen', descEn: 'Low rating, many reviews', hex: '#f59e0b' },
  { id: 'watch', title: 'Im Auge behalten', titleEn: 'Keep an eye on', desc: 'Niedrige Bewertung, wenige Rezensionen', descEn: 'Low rating, few reviews', hex: '#ef4444' },
];

/** In welches der vier Felder ein Gericht fällt — die Regel steht einmal. */
function quadrantOf(avg: number, count: number, medianCount: number): QuadrantId {
  const good = avg >= 4;
  const many = count > medianCount;
  return good ? (many ? 'stars' : 'hidden') : (many ? 'fix' : 'watch');
}

/**
 * Wie die Einheit des Verlaufs heißt. Der Server bestimmt sie (`trendUnit`),
 * die Oberfläche schreibt sie nur aus — Untertitel und Tooltip sollen dasselbe
 * sagen wie die Balken zeigen.
 */
const TREND_UNIT_LABEL: Record<'day' | 'week' | 'month', { de: string; en: string }> = {
  day: { de: 'Tag', en: 'day' }, week: { de: 'Woche', en: 'week' }, month: { de: 'Monat', en: 'month' },
};

/** Ab wann der Zeitraum zählt — ISO-Datum oder null für „alles". */
function rangeStart(key: RangeKey): string | null {
  if (key === 'all' || key === 'custom') return null;
  return new Date(Date.now() - Number(key) * 24 * 60 * 60 * 1000).toISOString();
}

function AdminApp({ orgSlug, branch, canSwitchBranch, onPick, dark, setDark }: {
  orgSlug: string; branch: Branch | null; canSwitchBranch: boolean;
  onPick: (p: string | 'all') => void;
  // Hell/Dunkel der Verwaltung — kommt von oben (persönliche Einstellung pro
  // Gerät), gestellt wird es hier unter „Einstellungen". Die Gastansicht hat
  // ihr eigenes (`brand.guestTheme`, unter „Design").
  dark: boolean; setDark: (fn: (p: boolean) => boolean) => void;
}) {
  const store = useStore();
  const t = useT();
  const { lang: uiLang, setLang: setUiLang } = useLang();
  // Die Gerichts-Kategorie wird als Wert 'Speisen'/'Getränke' gespeichert, aber
  // übersetzt angezeigt.
  const catLabel = (c: string) => c === 'Speisen' ? t('Speisen', 'Food') : c === 'Getränke' ? t('Getränke', 'Drinks') : c;
  // Rolle: Wert bleibt 'Kellner'/'Manager'/'Admin', Anzeige übersetzt.
  const roleLabel = (r: string) => r === 'Kellner' ? t('Kellner', 'Waiter') : r === 'Manager' ? t('Manager', 'Manager') : r === 'Admin' ? t('Admin', 'Admin') : r;
  const statusLabel = (s: string) => s === 'aktiv' ? t('aktiv', 'active') : s === 'eingeladen' ? t('eingeladen', 'invited') : s === 'inaktiv' ? t('inaktiv', 'inactive') : s;
  const [page, setPage] = useState<AdminPage>('dashboard');
  // Der Bearbeiten-Modus mit ausblendbaren Kacheln ist entfallen: er versteckte
  // Zahlen hinter einem Schalter, den niemand wiederfand, und die Kacheln, die
  // man loswerden wollte, sind jetzt gar nicht mehr da. Was der Server dazu
  // speichert (settings/dashboard.hiddenWidgets), bleibt unberührt liegen.
  const [userMenuOpen, setUserMenuOpen] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'Kellner' as AdminUser['role'], branchId: '', password: '' });
  const [inviteError, setInviteError] = useState<string | null>(null);
  // Passwort eines bestehenden Kontos setzen (Freischalten oder Zurücksetzen).
  const [pwDialog, setPwDialog] = useState<{ user: AdminUser; value: string; error: string | null } | null>(null);
  // Rolle und Filiale eines bestehenden Kontos ändern. Vorher gab es dafür nur
  // den Umweg über Löschen und Neuanlegen — dabei verlor das Konto seine
  // Kennung und sein Passwort.
  const [roleDialog, setRoleDialog] = useState<
    { user: AdminUser; role: AdminUser['role']; branchId: string; error: string | null } | null
  >(null);
  const [branchDrop, setBranchDrop] = useState(false);
  const [brandForm, setBrandForm] = useState({
    name: store.brand?.name ?? '', accent: store.brand?.accent ?? '#16A34A',
    logoImage: store.brand?.logoImage ?? null as string | null,
    coverImage: store.brand?.coverImage ?? null as string | null,
    font: store.brand?.font ?? 'Inter',
    cardStyle: (store.brand?.cardStyle ?? 'standard') as NonNullable<Brand['cardStyle']>,
    guestTheme: (store.brand?.guestTheme ?? 'hell') as NonNullable<Brand['guestTheme']>,
    guestNameColor: (store.brand?.guestNameColor ?? null) as string | null,
    guestTextColor: (store.brand?.guestTextColor ?? null) as string | null,
    coverOpacity: (store.brand?.coverOpacity ?? 1) as number,
    guestLang: (store.brand?.guestLang ?? 'de') as Lang,
  });
  const [brandSaved, setBrandSaved] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [previewStars, setPreviewStars] = useState(4);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  // Konto-Menü am Handy: dort ist die Seitenleiste eingeklappt, und mit ihr
  // der Fuß, in dem Abmelden sonst steht.
  const [accountOpen, setAccountOpen] = useState(false);
  // Die Seitenleiste als Schublade am Handy. Am Rechner steht sie immer, der
  // Schalter hat dort keine Wirkung (lg:translate-x-0).
  const [mobileNav, setMobileNav] = useState(false);
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
  const [importOpen, setImportOpen] = useState(false);
  // Eigener API-Schlüssel (Einstellungen, jede Rolle): eigenes Fehler-/Ladefeld
  // statt actionError, damit die Rückmeldung direkt an der Karte steht.
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [confirmRemoveApiKey, setConfirmRemoveApiKey] = useState(false);
  // Abgelaufene Gutscheine bleiben in der Datenbank — sie hängen an den
  // Einlösungen, die es gab. In der Liste stehen sie standardmäßig NICHT: der
  // Gast sieht sie ohnehin nicht mehr, und eine Seite, auf der die Hälfte der
  // Karten tot ist, sagt nichts mehr darüber, was gerade zu holen ist.
  const [showExpiredVouchers, setShowExpiredVouchers] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Zeitraum des Dashboards. Kommt aus einer eigenen Auswertungsroute, nicht
  // aus dem Gesamtzustand — der trägt nur die letzten 100 Bewertungen und
  // taugt weder für einen Wochenverlauf noch für einen Filter.
  const [range, setRange] = useState<RangeKey>('30');
  // Eigener Zeitraum (ISO-Datum, beide optional). Nur wirksam bei range ===
  // 'custom' — sonst rechnet rangeStart() den Anfang aus der Anzahl der Tage.
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  // Welche Filialen die Auswertung zusammenfasst. Leer = alle. Betrifft NUR
  // das Dashboard: der Gesamtzustand hängt weiter am Umschalter links, und ein
  // Konto mit fester Filiale sieht ohnehin nur seine (scopeOf auf dem Server).
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [branchFilterOpen, setBranchFilterOpen] = useState(false);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [highlightLoading, setHighlightLoading] = useState(false);
  // Der Wochenrückblick ist mehrere Absätze lang und stand doppelt so hoch da
  // wie die Kennzahlen daneben. Zugeklappt gestartet, der letzte Zustand bleibt
  // erhalten — wer ihn täglich liest, klappt ihn einmal auf.
  const [highlightOpen, setHighlightOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('bitely.dash.highlight') === 'auf'; } catch { return false; }
  });
  const toggleHighlight = () => setHighlightOpen(v => {
    const next = !v;
    try { localStorage.setItem('bitely.dash.highlight', next ? 'auf' : 'zu'); } catch { /* Privatmodus */ }
    return next;
  });
  // Sortierung der Gerichtstabelle unten auf dem Dashboard.
  const [sort, setSort] = useState<{ key: DishSortKey; desc: boolean }>({ key: 'avg', desc: true });

  useEffect(() => {
    if (store.brand) setBrandForm({
      name: store.brand.name, accent: store.brand.accent, logoImage: store.brand.logoImage ?? null,
      coverImage: store.brand.coverImage ?? null,
      font: store.brand.font ?? 'Inter', cardStyle: store.brand.cardStyle ?? 'standard',
      guestTheme: store.brand.guestTheme ?? 'hell',
      guestNameColor: store.brand.guestNameColor ?? null,
      guestTextColor: store.brand.guestTextColor ?? null,
      coverOpacity: store.brand.coverOpacity ?? 1,
      guestLang: store.brand.guestLang ?? 'de',
    });
  }, [store.brand]);

  useGoogleFont(brandForm.font);

  // Auswertung nachladen, sobald sich Zeitraum oder Filiale ändert. Die
  // Filiale steckt in den Abhängigkeiten, weil der Umschalter oben zwar den
  // Gesamtzustand neu lädt, diese Route aber nicht mitzieht.
  useEffect(() => {
    let cancelled = false;
    setInsightsLoading(true);
    setInsightsError(null);
    // Beim eigenen Zeitraum zählt das Bis-Datum GANZ mit: wer den 31. wählt,
    // meint den 31. über, nicht bis Mitternacht davor.
    const from = range === 'custom' ? (custom.from || null) : rangeStart(range);
    const to = range === 'custom' && custom.to
      ? new Date(`${custom.to}T23:59:59.999`).toISOString()
      : null;
    store.fetchInsights(from, to, branchFilter)
      .then(data => {
        if (cancelled) return;
        setInsights(data);
        setHighlight(data.highlight);
      })
      .catch(err => { if (!cancelled) setInsightsError(err instanceof Error ? err.message : 'Auswertung fehlgeschlagen.'); })
      .finally(() => { if (!cancelled) setInsightsLoading(false); });
    return () => { cancelled = true; };
    // uiLang: wechselt die Verwaltungssprache, holt das der KI-Rückblick in der
    // neuen Sprache nach (er wird serverseitig je Sprache getrennt gehalten).
  }, [range, custom.from, custom.to, branchFilter, branch?.id, uiLang, store.fetchInsights]); // eslint-disable-line react-hooks/exhaustive-deps

  // Den Wochenrückblick nachreichen, sobald klar ist, dass keiner vorliegt
  // oder der vorhandene von gestern ist. Getrennt von der Auswertung, weil ein
  // Modellaufruf Sekunden dauert — das Dashboard soll vorher stehen.
  useEffect(() => {
    if (!insights || insightsLoading) return;
    if (highlight && !highlight.stale) return;
    let cancelled = false;
    setHighlightLoading(true);
    store.refreshHighlight()
      .then(h => { if (!cancelled) setHighlight(h); })
      .catch(() => { /* dann bleibt der Block leer — die Zahlen stehen ja */ })
      .finally(() => { if (!cancelled) setHighlightLoading(false); });
    return () => { cancelled = true; };
  }, [insights, insightsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Die Auswertung ist auf den Zeitraum eingegrenzt; store.dishes trägt die
  // Stammdaten (Preis, Kategorie, Bild). Hier kommt beides zusammen.
  const rangedDishes = useMemo(() => (insights?.dishes ?? []).map(d => {
    const dish = store.dishes.find(x => x.id === d.id);
    return { ...d, price: dish?.price ?? 0, cat: dish?.cat ?? 'Speisen', img: dish?.img };
  }), [insights, store.dishes]);

  const sortedDishes = useMemo(() => {
    const rows = [...rangedDishes];
    rows.sort((a, b) => {
      const factor = sort.desc ? -1 : 1;
      if (sort.key === 'name') return factor * a.name.localeCompare(b.name, 'de');
      return factor * ((a[sort.key] ?? 0) - (b[sort.key] ?? 0));
    });
    return rows;
  }, [rangedDishes, sort]);

  const toggleSort = (key: DishSortKey) =>
    setSort(p => p.key === key ? { key, desc: !p.desc } : { key, desc: key !== 'name' });

  // Ab wann ein Gericht als „viel bewertet" gilt: der Median über alle
  // Gerichte des Zeitraums. Feste Werte standen hier einmal (55 Rezensionen) —
  // bei einem Lokal mit 40 Bewertungen insgesamt lag damit ausnahmslos alles
  // auf derselben Seite, und die Einteilung sagte nichts mehr. Der Median
  // teilt das Feld immer.
  const medianCount = useMemo(() => {
    if (rangedDishes.length === 0) return 0;
    const xs = rangedDishes.map(d => d.count).sort((a, b) => a - b);
    return xs[Math.floor(xs.length / 2)];
  }, [rangedDishes]);

  /**
   * Welchen Ausschnitt der Bewertungsachse die Matrix zeigt.
   *
   * Fest 0 bis 5 klang richtig — eine mitwandernde Achse ließe jede Karte
   * gleich gut aussehen — war aber in der Praxis unbrauchbar: Gerichte
   * bewegen sich zwischen 3 und 5, und die linke Hälfte des Bildes blieb
   * immer leer. Alle Punkte klebten am rechten Rand, ununterscheidbar.
   *
   * Also ein Fenster um die Gerichte herum, mit drei Sperren gegen
   * Schönfärberei: die Schwelle 4,0 liegt immer drin (sonst hinge die
   * gestrichelte Linie außerhalb des Bildes), es ist nie enger als 1,5 Sterne
   * (aus 4,2 gegen 4,4 wird sonst ein Drama), und die Achse ist beschriftet —
   * man SIEHT, dass sie nicht bei null anfängt.
   */
  const avgDomain = useMemo<[number, number]>(() => {
    if (rangedDishes.length === 0) return [0, 5];
    const values = rangedDishes.map(d => d.avg);
    // Auf halbe Sterne, mit etwas Luft, damit kein Punkt auf der Achse sitzt.
    let from = Math.floor((Math.min(...values) - 0.25) * 2) / 2;
    let to = Math.ceil((Math.max(...values) + 0.25) * 2) / 2;
    from = Math.min(from, 3.5);
    to = Math.max(to, 4.5);
    if (to - from < 1.5) {
      const mid = (from + to) / 2;
      from = mid - 0.75;
      to = mid + 0.75;
    }
    return [Math.max(0, from), Math.min(5, to)];
  }, [rangedDishes]);

  /** Die Striche dazu: jeder halbe Stern im Fenster. */
  const avgTicks = useMemo(() => {
    const [from, to] = avgDomain;
    const out: number[] = [];
    for (let v = from; v <= to + 1e-9; v += 0.5) out.push(Number(v.toFixed(1)));
    return out;
  }, [avgDomain]);

  // Gerichte mit mindestens zwei Bewertungen, absteigend nach Note. Ein
  // einzelner Stern ist Zufall, keine Tendenz — Ranglisten daraus wären
  // Rauschen, das aussieht wie ein Ergebnis.
  const solidDishes = useMemo(
    () => rangedDishes.filter(d => d.count >= 2).sort((a, b) => b.avg - a.avg),
    [rangedDishes],
  );

  // Der Verlauf, fertig für das Diagramm. `label` steht an der Achse (kurz,
  // es stehen bis zu 31 nebeneinander), `full` im Tooltip.
  const trendData = useMemo(() => {
    const unit = insights?.trendUnit ?? 'week';
    return (insights?.trend ?? []).map(p => {
      const d = new Date(p.start);
      return {
        label: unit === 'month'
          ? d.toLocaleDateString('de-AT', { month: 'short' })
          : d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }),
        full: unit === 'day'
          ? d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
          : unit === 'week'
            ? `Woche ab ${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}`
            : d.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' }),
        reviews: p.reviews,
        // Ein Kübel ohne Gerichtsurteil bekommt keine 0, sondern gar keinen
        // Punkt: eine Linie, die auf 0 fällt, behauptet ein Urteil, das
        // niemand abgab.
        avg: p.avg > 0 ? Number(p.avg.toFixed(2)) : null,
      };
    });
  }, [insights]);

  const openOutstandingAlerts = store.alerts.filter(a => !a.resolved).length;

  // Gültig und abgelaufen getrennt. Sortiert nach Punkten — die Gutscheinseite
  // liest sich damit wie eine Preisliste, von der billigsten Belohnung aufwärts.
  const activeVouchers = useMemo(
    () => store.vouchers.filter(v => !voucherExpired(v)).sort((a, b) => a.points - b.points),
    [store.vouchers],
  );
  const expiredVouchers = useMemo(
    () => store.vouchers.filter(v => voucherExpired(v)).sort((a, b) => a.points - b.points),
    [store.vouchers],
  );
  const visibleVouchers = showExpiredVouchers ? [...activeVouchers, ...expiredVouchers] : activeVouchers;

  // Alles Folgende bezieht sich auf den GEWÄHLTEN ZEITRAUM und kommt deshalb
  // aus der Auswertung, nicht aus den Alltagsdaten.
  const rangeReviews = insights?.totals.reviews ?? 0;
  const rangeRatings = insights?.totals.ratings ?? 0;
  const rangeOrders = insights?.totals.orders ?? 0;
  const rangeAvg = insights?.totals.avg ?? 0;
  // Wie viele Bestellungen Feedback hinterlassen haben. Gedeckelt, weil eine
  // Bestellung aus der Zeit vor der Bestellungs-Erfassung keine Zeile in
  // `orders` hat, ihre Bewertung aber sehr wohl zählt — sonst stünden dort in
  // den ersten Wochen Werte über 100 %.
  const feedbackRate = rangeOrders > 0 ? Math.min(1, rangeReviews / rangeOrders) : 0;
  // Die Filialleitung sieht nur, was ihre Filiale betrifft. Stammkarte,
  // Gutscheine und Einstellungen sind Sache der Kette — sie auszublenden ist
  // Bequemlichkeit, den Schutz macht der Server (chainAdmin in index.ts).
  // Die Filialleitung bekommt das Menü, um Gerichte für ihre Filiale an- und
  // abzuschalten — die Stammkarte selbst (anlegen, umbenennen, löschen) bleibt
  // ihr auf der Seite verwehrt. Gutscheine sind reine Kettensache.
  //
  // Die Reihenfolge folgt dem, was jemand mit wenig Zeit zuerst braucht:
  // Dashboard, Gutscheine, Menü, Benutzer, Design — und ganz unten die
  // Einstellungen. Sie stehen zuletzt, weil man sie einmal einrichtet und
  // danach kaum wieder anfasst; Design hinter ihnen wirkte wie ein Nachtrag.
  // Zwei Seiten sind
  // bewusst NICHT mehr im Menü, weil sie Nachschlagewerke sind und keine
  // täglichen Anlaufstellen: die einzelnen Bewertungen hängen als Knopf am
  // Dashboard, die vergangenen Einlösungen als Knopf an der Gutscheinseite.
  const nav: { id: AdminPage; label: string; Icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    ...(isChainAdmin
      ? [{ id: 'vouchers' as const, label: t('Gutscheine', 'Vouchers'), Icon: Ticket }]
      // Die Filialleitung hat keine Gutscheinseite, an der die Einlösungen
      // hängen könnten — für sie bleiben sie ein eigener Eintrag. Es sind die
      // Einlösungen ihrer eigenen Filiale.
      : [{ id: 'redemptions' as const, label: t('Einlösungen', 'Redemptions'), Icon: CheckCircle2 }]),
    { id: 'menu', label: t('Menü', 'Menu'), Icon: UtensilsCrossed },
    // Tische und QR-Codes waren ein Block ganz unten auf der
    // Einstellungsseite. Dort suchte sie niemand: „wo sind die Tische der
    // Filiale X" war die häufigste Frage zur Verwaltung — und die Antwort
    // lautete „unter Einstellungen, ganz runterscrollen, und vorher oben die
    // Filiale wechseln". Jetzt ist es eine Seite, und die Filiale wählt man
    // darauf.
    { id: 'tables', label: t('Tische & QR', 'Tables & QR'), Icon: QrCode },
    { id: 'users', label: t('Benutzer', 'Users'), Icon: Users },
    ...(isChainAdmin ? [{ id: 'design' as const, label: 'Design', Icon: Palette }] : []),
    { id: 'settings', label: t('Einstellungen', 'Settings'), Icon: Settings },
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

  const handleSaveRole = async () => {
    if (!roleDialog) return;
    try {
      await store.updateUser(roleDialog.user.id, {
        role: roleDialog.role,
        branchId: roleDialog.branchId || null,
      });
      setRoleDialog(null);
    } catch (err) {
      setRoleDialog(p => p && { ...p, error: err instanceof Error ? err.message : 'Änderung fehlgeschlagen.' });
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

  // Das Titelbild reist als Base64 im selben PATCH mit und kann groß sein — der
  // Aufruf dauert dann spürbar. Ohne „Speichert…" und ohne sichtbaren Fehler
  // wirkt der Knopf tot, und ein abgelehnter Speichervorgang (Bild zu groß,
  // Netz weg) verschwindet stumm.
  const handleSaveBrand = async () => {
    if (brandSaving) return;
    setBrandSaving(true);
    setBrandError(null);
    setBrandSaved(false);
    try {
      await store.updateBrand({
        name: brandForm.name, accent: brandForm.accent, logoImage: brandForm.logoImage,
        coverImage: brandForm.coverImage,
        font: brandForm.font, cardStyle: brandForm.cardStyle, guestTheme: brandForm.guestTheme,
        guestNameColor: brandForm.guestNameColor ?? '',
        guestTextColor: brandForm.guestTextColor ?? '',
        coverOpacity: brandForm.coverOpacity,
        guestLang: brandForm.guestLang,
      });
      setBrandSaved(true);
      setTimeout(() => setBrandSaved(false), 2500);
    } catch (err) {
      setBrandError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBrandSaving(false);
    }
  };

  // Das Verkleinern läuft im Browser und dauert bei einem großen Foto spürbar.
  // Ohne sichtbares „wird verarbeitet" wirkt der Auswahlknopf, als hätte er
  // nichts getan — dann sucht man das Bild ein zweites Mal aus.
  const handleLogoFile = async (file: File) => {
    setLogoBusy(true);
    setBrandError(null);
    try {
      const dataUri = await compressImageFile(file, 240, 0.85);
      setBrandForm(p => ({ ...p, logoImage: dataUri }));
    } catch {
      setBrandError('Das Logo konnte nicht verarbeitet werden.');
    } finally {
      setLogoBusy(false);
    }
  };

  // Das Titelbild füllt beim Gast den halben Bildschirm, darf aber nicht die
  // 8-MB-Grenze des Servers sprengen — es liegt als Base64 im Marken-Datensatz.
  // 1400 Pixel reichen für jedes Handy, auch bei doppelter Pixeldichte.
  const handleCoverFile = async (file: File) => {
    setCoverBusy(true);
    setBrandError(null);
    try {
      const dataUri = await compressImageFile(file, 1400, 0.8);
      setBrandForm(p => ({ ...p, coverImage: dataUri }));
    } catch {
      setBrandError('Das Titelbild konnte nicht verarbeitet werden.');
    } finally {
      setCoverBusy(false);
    }
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
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0D1117] flex"
      onClick={() => { setBranchDrop(false); setBranchFilterOpen(false); setUserMenuOpen(null); setAccountOpen(false); }}>

      {/* ── SEITENLEISTE ──
          Sie trägt jetzt ALLES, was die ganze Verwaltung betrifft: Lokal,
          Filiale, Seiten, Konto. Darüber lag vorher eine zweite Leiste mit der
          Wortmarke und dem Filial-Umschalter — zwei waagrechte Streifen
          übereinander, von denen der obere nur ein Element trug, das
          hierhergehört. Die Filiale ist keine Eigenschaft der Seite, auf der
          man gerade steht, sondern des Ausschnitts, den man betrachtet: sie
          steht deshalb neben den Seiten, nicht über ihnen.

          Am Handy ist dieselbe Leiste eine Schublade. Vorher lief dort unter
          dem Kopf eine waagrecht scrollende Reiterzeile — bei sechs Einträgen
          waren die letzten unsichtbar, und niemand scrollt eine Leiste, von
          der er nicht weiß, dass sie scrollt. */}
      <aside onClick={e => e.stopPropagation()}
        className={`fixed top-0 bottom-0 left-0 w-64 lg:w-56 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col z-40 transition-transform duration-200 lg:translate-x-0 ${mobileNav ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        {/* Oben nur die Bitely-Wortmarke — die Software besitzt die
            Verwaltung. Das Logo und der Name des Lokals stehen nicht mehr hier,
            sondern unten am Konto: wer verwaltet gerade welchen Laden. */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2.5">
          <BitelyWordmark className="h-10" />
          <button onClick={() => setMobileNav(false)} title={t("Menü schließen", "Close menu")}
            className="lg:hidden w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* ── FILIALE ──
            Der Umschalter lädt neu: der Server liefert die Daten genau einer
            Filiale (oder aller), die Oberfläche filtert nicht selbst. */}
        <div className="px-3 pt-3 relative">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-2 mb-1.5">{t('Filiale', 'Branch')}</p>
          <button onClick={() => canSwitchBranch && setBranchDrop(p => !p)}
            disabled={!canSwitchBranch}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition-colors ${canSwitchBranch ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600' : 'border-transparent bg-gray-50 dark:bg-gray-800/60'}`}>
            {branch
              ? <BranchIcon size={14} className="text-gray-400 flex-shrink-0" />
              : <Building2 size={14} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />}
            <span className="flex-1 min-w-0 text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate">
              {branch ? branch.name : t('Alle Filialen', 'All branches')}
            </span>
            {canSwitchBranch && (
              <ChevronDown size={13} className={`text-gray-400 transition-transform flex-shrink-0 ${branchDrop ? 'rotate-180' : ''}`} />
            )}
          </button>
          <AnimatePresence>
            {branchDrop && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute left-3 right-3 top-full mt-1 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 max-h-72 overflow-y-auto">
                <button onClick={() => { onPick('all'); setBranchDrop(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700">
                  <span className="text-base">🏢</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-white">{t('Alle Filialen', 'All branches')}</p>
                    <p className="text-[11px] text-gray-400">{t('Zahlen der ganzen Kette', 'Figures for the whole chain')}</p>
                  </div>
                  {!branch && <Check size={13} strokeWidth={2.5} style={{ color: 'var(--ba)' }} />}
                </button>
                {store.branches.map(b => (
                  <button key={b.id} onClick={() => { onPick(b.slug); setBranchDrop(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <BranchIcon size={16} className="text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 dark:text-white truncate">{b.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{b.address}</p>
                    </div>
                    {b.id === branch?.id && <Check size={13} strokeWidth={2.5} className="flex-shrink-0" style={{ color: 'var(--ba)' }} />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => { setPage(id); setMobileNav(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors ${page === id ? 'text-white font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}
              style={page === id ? { backgroundColor: 'var(--ba, #16A34A)' } : {}}>
              <Icon size={15} strokeWidth={1.5} />{label}
              {/* Offene Alarme hingen an einem Glockensymbol in der
                  weggefallenen Leiste. Sie gehören dorthin, wo man sie
                  abarbeitet — ans Dashboard. */}
              {id === 'dashboard' && openOutstandingAlerts > 0 && (
                <span className={`ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${page === id ? 'bg-white/25 text-white' : 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300'}`}>
                  {openOutstandingAlerts}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Konto und Abmelden gehören ans Ende der Navigation. Unter dem Namen
            der angemeldeten Person steht ihre Rolle und, dahinter, das Lokal:
            wer verwaltet gerade welchen Laden. */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800">
          {store.authUser && (
            <div className="flex items-center gap-2.5 px-3 py-2">
              <div className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-white text-[13px] font-bold"
                style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                {store.authUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-900 dark:text-white truncate">{store.authUser.name}</p>
                <p className="text-[11px] text-gray-400 truncate">
                  {roleLabel(store.authUser.role)}{store.brand?.name ? ` · ${store.brand.name}` : ''}
                </p>
              </div>
            </div>
          )}
          <button onClick={store.logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <LogOut size={15} strokeWidth={1.5} /> {t('Abmelden', 'Sign out')}
          </button>
        </div>
      </aside>

      {/* Schleier hinter der Schublade — nur am Handy, wo die Leiste über dem
          Inhalt liegt statt neben ihm. */}
      {mobileNav && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setMobileNav(false)} />
      )}

      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen min-w-0">
        {/* Am Handy bleibt eine schmale Leiste: ohne sie käme man nicht an die
            Schublade. Am Rechner gibt es sie nicht — dort steht alles links. */}
        <header className="lg:hidden bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-20">
          <div className="flex items-center gap-2 px-3 h-14">
            <button onClick={() => setMobileNav(true)} title={t("Menü", "Menu")}
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
              <Menu size={18} strokeWidth={1.5} className="text-gray-600 dark:text-gray-300" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-gray-900 dark:text-white leading-tight truncate">
                {nav.find(n => n.id === page)?.label ?? t('Verwaltung', 'Admin')}
              </p>
              <p className="text-[11px] text-gray-400 truncate">{branch ? branch.name : 'Alle Filialen'}</p>
            </div>
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setAccountOpen(p => !p)} title={t("Konto", "Account")}
                className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-white text-[13px] font-bold"
                style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                {store.authUser?.name.charAt(0).toUpperCase() ?? '·'}
              </button>
              <AnimatePresence>
                {accountOpen && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="absolute right-0 top-10 w-56 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-lg z-30 p-1.5">
                    {store.authUser && (
                      <div className="px-3 py-2">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-white truncate">{store.authUser.name}</p>
                        <p className="text-[11px] text-gray-400">{roleLabel(store.authUser.role)}{store.brand?.name ? ` · ${store.brand.name}` : ''}</p>
                      </div>
                    )}
                    <button onClick={store.logout}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      <LogOut size={14} strokeWidth={1.5} /> {t('Abmelden', 'Sign out')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0" onClick={() => { setBranchDrop(false); setBranchFilterOpen(false); setUserMenuOpen(null); setAccountOpen(false); }}>
          <>
              {actionError && (
                <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 mb-5">
                  <AlertOctagon size={15} className="text-red-500 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  <p className="flex-1 text-[13px] text-red-700 dark:text-red-300 leading-relaxed">{actionError}</p>
                  <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0"><X size={14} /></button>
                </div>
              )}

              {page === 'dashboard' && (
                <div className="space-y-4 sm:space-y-5">

                  {/* ══ ZEILE 1 — WAS BETRACHTET WIRD ══
                      Nur noch Zeitraum und Filialen. Die Überschrift
                      „Dashboard" stand über der Seite, auf der man ohnehin
                      steht, und „Bearbeiten" versteckte Kacheln, die man
                      danach nirgends mehr fand. Was übrig bleibt, verändert
                      tatsächlich die Zahlen darunter. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto">
                      {RANGES.map(r => (
                        <button key={r.key} onClick={() => setRange(r.key)}
                          className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${range === r.key ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                          {t(r.de, r.en)}
                        </button>
                      ))}
                    </div>

                    {/* FILIALFILTER — mehrere nebeneinander. Er erscheint nur
                        im Ketten-Blick: sobald links eine einzelne Filiale
                        gewählt ist, gewinnt deren Bindung ohnehin (scopeOf auf
                        dem Server), und zwei Regler für dieselbe Frage wären
                        eine zweite Wahrheit neben der ersten. */}
                    {canSwitchBranch && !branch && store.branches.length > 1 && (
                      <div className="relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setBranchFilterOpen(p => !p)}
                          className="flex items-center gap-2 text-[13px] px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 transition-colors">
                          {branchFilter.length === 1
                            ? <BranchIcon size={13} className="text-gray-400" />
                            : <Building2 size={13} strokeWidth={1.5} className="text-gray-400" />}
                          {branchFilter.length === 0
                            ? t('Alle Filialen', 'All branches')
                            : branchFilter.length === 1
                              ? store.branches.find(b => b.id === branchFilter[0])?.name ?? t('1 Filiale', '1 branch')
                              : t(`${branchFilter.length} von ${store.branches.length} Filialen`, `${branchFilter.length} of ${store.branches.length} branches`)}
                          <ChevronDown size={13} className={`text-gray-400 transition-transform ${branchFilterOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence>
                          {branchFilterOpen && (
                            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                              className="absolute left-0 top-full mt-1 w-64 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-30 p-1.5 max-h-72 overflow-y-auto">
                              <button onClick={() => setBranchFilter([])}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <span className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center ${branchFilter.length === 0 ? 'border-transparent' : 'border-gray-300 dark:border-gray-600'}`}
                                  style={branchFilter.length === 0 ? { backgroundColor: 'var(--ba)' } : {}}>
                                  {branchFilter.length === 0 && <Check size={11} strokeWidth={3} className="text-white" />}
                                </span>
                                <span className="text-[13px] font-medium text-gray-900 dark:text-white">{t('Alle Filialen', 'All branches')}</span>
                              </button>
                              <div className="h-px bg-gray-100 dark:bg-gray-700 my-1.5" />
                              {store.branches.map(b => {
                                const on = branchFilter.includes(b.id);
                                return (
                                  <button key={b.id}
                                    onClick={() => setBranchFilter(p => on ? p.filter(x => x !== b.id) : [...p, b.id])}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                    <span className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center ${on ? 'border-transparent' : 'border-gray-300 dark:border-gray-600'}`}
                                      style={on ? { backgroundColor: 'var(--ba)' } : {}}>
                                      {on && <Check size={11} strokeWidth={3} className="text-white" />}
                                    </span>
                                    <span className="text-[13px] text-gray-700 dark:text-gray-200 truncate">{b.name}</span>
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    <div className="flex-1" />

                    <button onClick={() => setPage('reviews')}
                      className="flex items-center gap-1.5 text-[13px] px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 transition-colors">
                      <MessageSquare size={13} strokeWidth={1.5} /> <span className="hidden sm:inline">{t('Detaillierte ', 'Detailed ')}</span>{t('Bewertungen', 'reviews')}
                    </button>
                    <button onClick={exportReviewsCsv} title={t('Bewertungen als CSV', 'Reviews as CSV')}
                      className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 transition-colors">
                      <Download size={14} strokeWidth={1.5} />
                    </button>
                  </div>

                  {/* Der eigene Zeitraum klappt nur auf, wenn er gewählt ist —
                      zwei Datumsfelder, die meistens niemand braucht, gehören
                      nicht dauerhaft in die Kopfzeile. */}
                  {range === 'custom' && (
                    <div className="flex flex-wrap items-end gap-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                      {([['from', t('Von', 'From')], ['to', t('Bis', 'To')]] as const).map(([key, label]) => (
                        <div key={key}>
                          <p className="text-[12px] text-gray-400 mb-1.5">{label}</p>
                          <input type="date" value={custom[key]} max={today()}
                            onChange={e => setCustom(p => ({ ...p, [key]: e.target.value }))}
                            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-700 text-[13px] text-gray-800 dark:text-gray-200 outline-none focus:border-gray-400 transition-colors" />
                        </div>
                      ))}
                      <p className="text-[12px] text-gray-400 pb-2.5">
                        {t('Leer heißt „offen": ohne Von zählt alles bis zum Bis, ohne Bis alles ab dem Von.', 'Empty means “open”: without From it counts everything up to To, without To everything from From on.')}
                      </p>
                    </div>
                  )}

                  {insightsError && (
                    <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
                      <AlertOctagon size={15} className="text-red-500 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                      <p className="flex-1 text-[13px] text-red-700 dark:text-red-300 leading-relaxed">{insightsError}</p>
                    </div>
                  )}

                  {/* ══ ZEILE 2 — DIE DREI ZAHLEN, UND WAS SIE BEDEUTEN ══
                      Vorher standen sechs Kacheln nebeneinander, drei davon
                      ohne Bezug zum Zeitraum (Punkte, eingelöste Gutscheine)
                      und obendrein aus dem GASTPROFIL des angemeldeten
                      Verwalters gerechnet — also praktisch immer null.

                      Übrig bleiben die drei, die zusammengehören und deshalb
                      auch zusammen in EINER Karte stehen: wie gut, wie viel,
                      wovon. Ø Bewertung allein sagt nichts, wenn dahinter drei
                      Rückmeldungen auf zweihundert Bestellungen stehen. */}
                  {/* WOCHENRÜCKBLICK — was in den letzten sieben Tagen zählte,
                      in zwei bis vier Sätzen. Bewusst unabhängig vom Zeitraum:
                      „diese Woche" ist die Frage, die sich jeden Morgen neu
                      stellt.

                      Eine schmale Leiste über den Zahlen, KEINE Kachel neben
                      ihnen: der volle Text ist mehrere Absätze lang und ließ,
                      in eine halbe Spalte gezwängt, entweder die Zeile viel zu
                      hoch werden oder daneben eine leere Fläche stehen.
                      Zugeklappt (Standard) ist es eine Zeile mit der ersten
                      Aussage als Anhalt; ausgeklappt wächst der Text darunter
                      und schiebt die Zahlen nach unten. Zustand im localStorage
                      (`highlightOpen`). */}
                  {highlightLoading && !highlight ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-5 py-4 flex items-center gap-2">
                      <Zap size={15} strokeWidth={1.5} style={{ color: 'var(--ba)' }} className="flex-shrink-0" />
                      <p className="text-[14px] font-semibold text-gray-900 dark:text-white">{t('Diese Woche', 'This week')}</p>
                      <div className="flex-1"><Sk h={12} w="60%" /></div>
                    </div>
                  ) : highlight ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-5 py-3">
                      <button onClick={toggleHighlight}
                        aria-expanded={highlightOpen} aria-controls="dash-highlight-text"
                        className={`w-full flex items-center gap-2.5 text-left min-h-[36px] ${FOCUS_RING} rounded-lg`}>
                        <Zap size={15} strokeWidth={1.5} style={{ color: 'var(--ba)' }} className="flex-shrink-0" />
                        <span className="text-[14px] font-semibold text-gray-900 dark:text-white flex-shrink-0">{t('Diese Woche', 'This week')}</span>
                        {!highlightOpen && (
                          <span className="text-[13px] text-gray-500 dark:text-gray-400 truncate min-w-0 flex-1">
                            {highlight.text.split('\n')[0]}
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400 ml-auto flex-shrink-0 hidden sm:inline">
                          {t('Stand', 'As of')} {new Date(highlight.generatedAt).toLocaleDateString(uiLang === 'en' ? 'en-GB' : 'de-AT')}
                        </span>
                        <ChevronDown size={15} strokeWidth={2}
                          className={`text-gray-400 flex-shrink-0 transition-transform ${highlightOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {highlightOpen && (
                        // pre-line: der Rückblick kommt in zwei Absätzen (Lage,
                        // dann „Woran ich arbeiten würde:"); ohne das liefe beides
                        // zu einem Block zusammen.
                        <p id="dash-highlight-text" className="mt-2.5 pt-2.5 border-t border-gray-100 dark:border-gray-700 text-[14px] text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-line">{highlight.text}</p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-5 py-4 flex items-center gap-2.5">
                      <Zap size={15} strokeWidth={1.5} style={{ color: 'var(--ba)' }} className="flex-shrink-0" />
                      <span className="text-[14px] font-semibold text-gray-900 dark:text-white flex-shrink-0">{t('Diese Woche', 'This week')}</span>
                      <span className="text-[13px] text-gray-400 truncate">{t('Noch kein Rückblick — er entsteht, sobald Bewertungen vorliegen.', 'No review yet — it appears once there are ratings.')}</span>
                    </div>
                  )}

                  {/* ══ ZEILE 2 — DIE DREI ZAHLEN, UND WAS SIE BEDEUTEN ══
                      Vorher standen sechs Kacheln nebeneinander, drei davon
                      ohne Bezug zum Zeitraum (Punkte, eingelöste Gutscheine)
                      und obendrein aus dem GASTPROFIL des angemeldeten
                      Verwalters gerechnet — also praktisch immer null.

                      Übrig bleiben die drei, die zusammengehören und deshalb
                      auch zusammen in EINER Karte stehen: wie gut, wie viel,
                      wovon. Ø Bewertung allein sagt nichts, wenn dahinter drei
                      Rückmeldungen auf zweihundert Bestellungen stehen. */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
                    {insightsLoading ? (
                      <div className="grid grid-cols-3 gap-4">
                        {[0, 1, 2].map(i => <div key={i} className="space-y-2"><Sk h={11} w="70%" /><Sk h={28} w="60%" /></div>)}
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 sm:gap-4">
                          {([
                            { label: t('Ø Bewertung', 'Avg rating'), value: rangeRatings > 0 ? rangeAvg.toFixed(1) : '—', Icon: Star,
                              sub: rangeRatings > 0 ? t(`${rangeRatings} Gerichtsurteile`, `${rangeRatings} dish ratings`) : t('noch keine', 'none yet') },
                            { label: t('Bewertungen', 'Reviews'), value: String(rangeReviews), Icon: MessageSquare,
                              sub: range === 'custom' ? t('eigener Zeitraum', 'custom range') : (() => { const r = RANGES.find(x => x.key === range); return r ? t(r.de, r.en) : ''; })() },
                            { label: t('Bestellungen', 'Orders'), value: String(rangeOrders), Icon: UtensilsCrossed,
                              sub: rangeOrders > 0 ? t('gebucht', 'placed') : t('noch keine', 'none yet') },
                          ] as const).map(k => (
                            <div key={k.label} className="min-w-0">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <k.Icon size={13} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                                <p className="text-[11px] sm:text-[12px] text-gray-500 dark:text-gray-400 truncate">{k.label}</p>
                              </div>
                              <p className="text-[26px] sm:text-3xl font-bold text-gray-900 dark:text-white leading-none">{k.value}</p>
                              <p className="text-[11px] text-gray-400 mt-1 truncate">{k.sub}</p>
                            </div>
                          ))}
                        </div>
                        {/* Die eine Zahl, die aus den dreien erst entsteht.
                            Sie steht am Fuß der Karte, weil sie keine vierte
                            Kennzahl ist, sondern ihr Verhältnis. */}
                        {rangeOrders > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                            <div className="flex items-center justify-between text-[12px] mb-1.5">
                              <span className="text-gray-500 dark:text-gray-400">{t('Bestellungen mit Feedback', 'Orders with feedback')}</span>
                              <span className="font-semibold text-gray-800 dark:text-gray-200">{Math.round(feedbackRate * 100)} %</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, feedbackRate * 100)}%`, backgroundColor: 'var(--ba, #16A34A)' }} />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* ══ ZEILE 3 — VERLAUF ══
                      Balken für die Anzahl, Linie für den Schnitt. Die Linie
                      lag hier schon einmal und flog raus, weil zwei Größen in
                      einem Bild unruhig wirkten; die Frage danach kam trotzdem
                      wieder — und sie ist berechtigt: erst nebeneinander sieht
                      man, ob ein guter Schnitt auf vielen oder auf drei
                      Rückmeldungen steht. Die Note bekommt fest 0–5, sonst
                      wirkt ein Ausschlag von 4,2 auf 4,4 wie ein Absturz.

                      Die Einheit kommt vom Server (`trendUnit`): bei „letzte 7
                      Tage" sind es Tage, bei „alles" Monate. Feste Wochen
                      ergaben für kurze Zeiträume einen einzelnen fetten Balken
                      — ein Diagramm, das aussah wie ein Fehler. Flach gehalten
                      (160 statt 240 Pixel): der Verlauf ist eine Zeile im
                      Dashboard, keine Seite. */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                      <div>
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{t('Verlauf', 'Trend')}</p>
                        <p className="text-[12px] text-gray-400">{(() => { const u = TREND_UNIT_LABEL[insights?.trendUnit ?? 'week']; return t(`Bewertungen je ${u.de}, dazu der Schnitt`, `Reviews per ${u.en}, plus the average`); })()}</p>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--ba, #16A34A)' }} /> {t('Anzahl', 'Count')}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-4 h-0.5 rounded-full bg-gray-800 dark:bg-gray-200" /> {t('Ø Bewertung', 'Avg rating')}
                        </span>
                      </div>
                    </div>
                    {insightsLoading ? <Sk h={160} /> : trendData.length === 0 ? (
                      <EmptyState icon={BarChart3} title={t('Noch kein Verlauf', 'No trend yet')}
                        desc={t('Sobald in diesem Zeitraum Bewertungen eingehen, entstehen hier die Balken.', 'As ratings come in for this period, the bars appear here.')} />
                    ) : (
                      <div style={{ height: 160 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={trendData} margin={{ top: 5, right: 0, bottom: 0, left: -14 }}>
                            <CartesianGrid key="grid" strokeDasharray="3 0" stroke="#f1f5f9" vertical={false} />
                            {/* Bei Tagen stehen schnell 31 Beschriftungen
                                nebeneinander — jede zweite oder dritte reicht,
                                sonst überlagern sie sich zu einem grauen
                                Streifen. */}
                            <XAxis key="x" dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}
                              interval={Math.max(0, Math.ceil(trendData.length / 8) - 1)} minTickGap={4} />
                            <YAxis key="yl" yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                            <YAxis key="yr" yAxisId="right" orientation="right" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]}
                              tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={22} />
                            <Tooltip key="tip" contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 12 }}
                              formatter={(v, name) => name === 'avg'
                                ? [v == null ? '—' : `${v} ★`, t('Ø Bewertung', 'Avg rating')] as [string, string]
                                : [String(v ?? 0), t('Bewertungen', 'Reviews')] as [string, string]}
                              labelFormatter={(_l: unknown, payload: any) => payload?.[0]?.payload?.full ?? ''} />
                            <Bar key="bars" yAxisId="left" dataKey="reviews" fill="var(--ba, #16A34A)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                            <Line key="line" yAxisId="right" type="monotone" dataKey="avg" stroke={dark ? '#FFFFFF' : '#111827'} strokeWidth={2}
                              dot={false} connectNulls />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* ══ ZEILE 4 — BESTE UND SCHWÄCHSTE ══
                      Reine Textlisten: nach zwei Zahlen sucht niemand in einem
                      Diagramm. Mindestens zwei Bewertungen, sonst steht ein
                      einzelner Zufallsstern ganz oben. */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {([
                      { key: 'best', title: t('Beste Gerichte', 'Best dishes'), rows: solidDishes.slice(0, 5), tone: 'text-emerald-700 dark:text-emerald-300', tstyle: undefined as React.CSSProperties | undefined },
                      { key: 'worst', title: t('Schwächste Gerichte', 'Weakest dishes'), rows: [...solidDishes].reverse().slice(0, 5), tone: '', tstyle: { color: WEAK_RATING_DEFAULT } as React.CSSProperties | undefined },
                    ] as const).map(({ key, title, rows, tone, tstyle }) => (
                      <div key={key} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white mb-3">{title}</p>
                        {insightsLoading ? (
                          <div className="space-y-2.5">{[...Array(4)].map((_, i) => <Sk key={i} h={14} />)}</div>
                        ) : rows.length === 0 ? (
                          <p className="text-[13px] text-gray-400">{t('Noch zu wenige Bewertungen in diesem Zeitraum.', 'Too few ratings in this period yet.')}</p>
                        ) : (
                          <ol className="space-y-2.5">
                            {rows.map((d, i) => (
                              <li key={d.id} className="flex items-center gap-3 text-[14px]">
                                <span className="w-5 text-[12px] text-gray-300 dark:text-gray-600 flex-shrink-0">{i + 1}</span>
                                <span className="flex-1 text-gray-800 dark:text-gray-200 truncate">{d.name}</span>
                                <span className="text-[12px] text-gray-400 flex-shrink-0">{d.count}×</span>
                                <span className={`font-semibold w-8 text-right flex-shrink-0 ${tone}`} style={tstyle}>{d.avg.toFixed(1)}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ══ ZEILE 5 — MENÜ-MATRIX ══
                      Bewertung gegen Anzahl der Rezensionen, dazu die vier
                      Felder darunter.

                      Das Streudiagramm war einmal weg — mit dem Argument,
                      unbeschriftete Punkte beantworteten die Frage nicht,
                      welches Gericht wo steht. Es ist zurück, weil es die
                      Verteilung zeigt, die keine Liste zeigt; die Frage nach
                      dem einzelnen Gericht beantworten die Felder darunter,
                      in denen die Namen stehen. Beides zusammen, nicht das
                      eine STATT des anderen.

                      Die Felder sind zugleich die Legende: dieselbe Farbe wie
                      die Punkte, aber nur als Rahmen. Die Schrift bleibt
                      schwarz und grau — ein Kästchen aus drei Rottönen las
                      sich schlechter als eines aus einem. */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 sm:p-5">
                    <div className="mb-4">
                      <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{t('Menü-Matrix', 'Menu matrix')}</p>
                      {/* Die zwei Begriffe in der Akzentfarbe, der Rest normale
                          Schrift. Vorher waren beide nur ein helleres Grau im
                          Grau ringsum — ein Unterschied, den man sucht statt
                          ihn zu sehen. Die Schwellen sind zugleich die zwei
                          gestrichelten Linien im Bild. */}
                      <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                        <span className="font-semibold" style={{ color: 'var(--ba, #16A34A)' }}>{t('Hoch', 'High')}</span> {t('= 4,0 ★ und mehr', '= 4.0 ★ and up')} ·{' '}
                        <span className="font-semibold" style={{ color: 'var(--ba, #16A34A)' }}>{t('Viele', 'Many')}</span> {t(`= mehr als der Median aller Gerichte (${medianCount} ${medianCount === 1 ? 'Bewertung' : 'Bewertungen'})`, `= more than the median across all dishes (${medianCount} ${medianCount === 1 ? 'review' : 'reviews'})`)}
                      </p>
                    </div>
                    {insightsLoading ? <Sk h={320} /> : rangedDishes.length === 0 ? (
                      <EmptyState icon={BarChart3} title={t('Noch keine Auswertung möglich', 'No analysis possible yet')}
                        desc={t('Sobald in diesem Zeitraum Bewertungen eingehen, ordnen sich die Gerichte hier ein.', 'As ratings come in for this period, the dishes sort themselves in here.')} />
                    ) : (
                      <>
                        <div style={{ height: 320 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                              <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#f1f5f9" />
                              {/* Der Ausschnitt kommt aus avgDomain — nicht
                                  fest 0 bis 5, sonst klebt alles rechts. Die
                                  Beschriftung sagt, wo die Achse anfängt. */}
                              <XAxis key="x" type="number" dataKey="avg" domain={avgDomain} ticks={avgTicks} name={t('Bewertung', 'Rating')}
                                tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                                tickFormatter={(v: number) => uiLang === 'en' ? v.toFixed(1) : v.toFixed(1).replace('.', ',')}
                                label={{ value: t('Ø Bewertung', 'Avg rating'), position: 'insideBottom', offset: -10, fontSize: 11, fill: '#94a3b8' }} />
                              <YAxis key="y" type="number" dataKey="count" name={t('Bewertungen', 'Reviews')}
                                tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false}
                                label={{ value: t('Anzahl', 'Count'), angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#94a3b8' }} />
                              <ZAxis key="z" range={[60, 60]} />
                              <Tooltip key="tip" cursor={{ strokeDasharray: '3 3' }}
                                content={({ payload }) => {
                                  if (!payload?.length) return null;
                                  const d = payload[0].payload as { name: string; avg: number; count: number };
                                  return (
                                    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-[12px]">
                                      <p className="font-semibold text-gray-900">{d.name}</p>
                                      <p className="text-gray-500">{d.avg.toFixed(1)} ★ · {t(`${d.count} Bewertungen`, `${d.count} reviews`)}</p>
                                    </div>
                                  );
                                }} />
                              {/* Die zwei Schwellen aus der Zeile darüber, als
                                  Linien. Ohne sie stünden die vier Felder unten
                                  ohne Entsprechung im Bild. */}
                              <ReferenceLine key="refx" x={4} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="4 3" />
                              <ReferenceLine key="refy" y={medianCount} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="4 3" />
                              <Scatter key="scatter" data={rangedDishes} shape={(props: any) => {
                                const { cx, cy, payload } = props;
                                const id = quadrantOf(payload.avg ?? 0, payload.count ?? 0, medianCount);
                                const color = QUADRANTS.find(q => q.id === id)?.hex ?? '#9ca3af';
                                return <circle cx={cx} cy={cy} r={9} fill={color} fillOpacity={0.85} stroke="white" strokeWidth={2} />;
                              }} />
                            </ScatterChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Die Legende: ein Punkt in der Farbe der Punkte im
                            Bild, daneben was er bedeutet. Kein Kasten, keine
                            Tönung, keine Namensliste.

                            Hier standen zwischenzeitlich die Gerichte selbst —
                            vier Kästchen, die zusammen die halbe Karte noch
                            einmal auflisteten, direkt über einer Tabelle, die
                            genau das kann. Welches Gericht wo liegt, sagt der
                            Tooltip am Punkt.

                            Die Farbe kommt aus `hex`, derselben Quelle wie die
                            Punkte oben: eine zweite Liste liefe irgendwann
                            auseinander. */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-4">
                          {QUADRANTS.map(q => (
                            <div key={q.id} className="flex items-start gap-2.5">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: q.hex }} />
                              <div className="min-w-0">
                                <p className="text-[12px] font-semibold text-gray-900 dark:text-white">{t(q.title, q.titleEn)}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">{t(q.desc, q.descEn)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* ══ ZEILE 6 — ALLE GERICHTE ══
                      Am Rechner eine Tabelle, deren Spaltenköpfe sortieren. Am
                      Handy wäre sie ein waagrechter Scrollbalken über fünf
                      Spalten, in dem der Gerichtsname beim Sortieren aus dem
                      Bild wandert — dort also Karten und ein Knopf, der sagt,
                      wonach gerade sortiert ist. */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{t('Alle Gerichte', 'All dishes')}</p>
                        <p className="text-[12px] text-gray-400 mt-0.5 hidden md:block">{t('Spaltenkopf antippen zum Sortieren', 'Tap a column header to sort')}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Am Handy ersetzt diese Auswahl die Spaltenköpfe. */}
                        <select value={sort.key} onChange={e => toggleSort(e.target.value as DishSortKey)}
                          className="md:hidden px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-700 text-[12px] text-gray-700 dark:text-gray-200 outline-none">
                          {(DISH_COLUMNS).map(([key, de, en]) => <option key={key} value={key}>{t(de, en)}</option>)}
                        </select>
                        <button onClick={() => setSort(p => ({ ...p, desc: !p.desc }))} title={sort.desc ? t('Absteigend', 'Descending') : t('Aufsteigend', 'Ascending')}
                          className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                          {sort.desc ? <TrendingDown size={14} strokeWidth={2} /> : <TrendingUp size={14} strokeWidth={2} />}
                        </button>
                        <button onClick={exportDishesCsv} title={t('Als CSV exportieren', 'Export as CSV')}
                          className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 transition-colors">
                          <Download size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                    {insightsLoading ? (
                      <div className="p-6 space-y-4">
                        {[...Array(4)].map((_, i) => <div key={i} className="flex items-center gap-4"><Sk h={36} w={36} r={8} /><div className="flex-1 space-y-2"><Sk h={13} w="40%" /><Sk h={11} w="25%" /></div><Sk h={20} w={80} r={999} /></div>)}
                      </div>
                    ) : sortedDishes.length === 0 ? (
                      <div className="p-6"><EmptyState icon={Star} title={t('Noch keine Bewertungen', 'No ratings yet')} desc={t('Sobald Gäste in diesem Zeitraum Gerichte bewerten, erscheinen sie hier.', 'As guests rate dishes in this period, they appear here.')} /></div>
                    ) : (
                      <>
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                                <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">#</th>
                                {DISH_COLUMNS.map(([key, de, en]) => (
                                  <th key={key} className="text-left px-5 py-3">
                                    <button onClick={() => toggleSort(key)}
                                      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${sort.key === key ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'}`}>
                                      {t(de, en)}
                                      {sort.key === key && (sort.desc
                                        ? <TrendingDown size={11} strokeWidth={2} />
                                        : <TrendingUp size={11} strokeWidth={2} />)}
                                    </button>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sortedDishes.map((d, i) => (
                                <tr key={d.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                                  <td className="px-5 py-3 text-[13px] text-gray-400 dark:text-gray-600">{i + 1}</td>
                                  <td className="px-5 py-3">
                                    <div className="flex items-center gap-3">
                                      {d.img && <img src={d.img} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0 bg-gray-100" />}
                                      <div className="min-w-0">
                                        <p className="text-[14px] font-medium text-gray-900 dark:text-white truncate">{d.name}</p>
                                        <p className="text-[11px] text-gray-400">{catLabel(d.cat)}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3">
                                    <div className="flex items-center gap-2">
                                      <StarRating value={Math.round(d.avg)} size={12} />
                                      <span className={`text-[14px] font-semibold ${d.avg >= 4 ? 'text-emerald-700' : ''}`}
                                        style={d.avg >= 4 ? undefined : { color: WEAK_RATING_DEFAULT }}>{d.avg.toFixed(1)}</span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3 text-[14px] text-gray-600 dark:text-gray-400">{d.count}</td>
                                  <td className="px-5 py-3 text-[14px] text-gray-600 dark:text-gray-400">{d.price.toFixed(2)} €</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="md:hidden divide-y divide-gray-50 dark:divide-gray-800">
                          {sortedDishes.map((d, i) => (
                            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                              <span className="text-[12px] text-gray-300 dark:text-gray-600 w-4 flex-shrink-0">{i + 1}</span>
                              {d.img && <img src={d.img} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-gray-100" />}
                              <div className="min-w-0 flex-1">
                                <p className="text-[14px] font-medium text-gray-900 dark:text-white truncate">{d.name}</p>
                                <p className="text-[11px] text-gray-400">{catLabel(d.cat)} · {d.price.toFixed(2)} € · {d.count}×</p>
                              </div>
                              <span className={`text-[15px] font-bold flex-shrink-0 ${d.avg >= 4 ? 'text-emerald-700' : ''}`}
                                style={d.avg >= 4 ? undefined : { color: WEAK_RATING_DEFAULT }}>
                                {d.avg.toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {insights?.totals.capped && (
                    <p className="text-[12px] text-gray-400">
                      {t('Hinweis: Die Auswertung berücksichtigt die neuesten 5000 Bewertungen dieses Zeitraums. Grenze den Zeitraum ein, um alles zu erfassen.', 'Note: the analysis covers the most recent 5000 ratings in this period. Narrow the period to capture everything.')}
                    </p>
                  )}
                </div>
              )}
              {page === 'design' && (
                <div className="space-y-5">
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">Design</p>
                    <p className="text-[13px] text-gray-400 mt-0.5">{t('Wie deine Gäste die App sehen. Logo, Name und Schrift gelten überall; Farbe, Titelbild und Karten-Stil sieht nur der Gast.', 'How your guests see the app. Logo, name and font apply everywhere; colour, cover image and card style are guest-only.')}</p>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
                    <div className="space-y-5">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-5">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Palette size={15} strokeWidth={1.5} className="text-gray-400" /> {t('Logo & Name', 'Logo & name')}</p>
                        <div className="flex flex-col sm:flex-row gap-6">
                          <div className="flex-shrink-0">
                            <p className="text-[12px] text-gray-400 mb-2">{t('Logo', 'Logo')}</p>
                            <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoBusy}
                              className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors overflow-hidden disabled:opacity-60">
                              {logoBusy
                                ? <Loader2 size={18} className="animate-spin text-gray-400" />
                                : <BrandLogo brand={{ logo: store.brand?.logo ?? '🍽️', logoImage: brandForm.logoImage }} size={80} textSize={36} rounded="rounded-none" />}
                            </button>
                            <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = ''; }} />
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <button onClick={() => logoInputRef.current?.click()} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1"><Upload size={10} /> {t('Hochladen', 'Upload')}</button>
                              {brandForm.logoImage && (
                                <button onClick={() => setBrandForm(p => ({ ...p, logoImage: null }))} className="text-[11px] text-gray-400 hover:text-red-500">{t('Entfernen', 'Remove')}</button>
                              )}
                            </div>
                          </div>
                          <div className="flex-1 space-y-4">
                            <div>
                              <p className="text-[12px] text-gray-400 mb-1.5">{t('Restaurantname, steht beim Gast in der Schlagzeile', 'Restaurant name — appears in the guest headline')}</p>
                              <input value={brandForm.name} onChange={e => setBrandForm(p => ({ ...p, name: e.target.value }))}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-700 text-[14px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors" />
                            </div>
                            <div>
                              <p className="text-[12px] text-gray-400 mb-1.5">{t('Akzentfarbe, sieht nur der Gast. Verwaltung und Service bleiben im Bitely-Blau.', 'Accent colour — guest-only. Admin and service stay in Bitely blue.')}</p>
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
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{t('Schriftart', 'Font')}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {BRAND_FONTS.map(f => (
                            <button key={f.name} onClick={() => setBrandForm(p => ({ ...p, font: f.name }))}
                              className="text-left px-4 py-3 rounded-xl border-2 transition-colors border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"
                              style={brandForm.font === f.name ? { borderColor: brandForm.accent, backgroundColor: `color-mix(in srgb, ${brandForm.accent} 8%, transparent)` } : {}}>
                              <p className="text-[16px] text-gray-900 dark:text-white" style={{ fontFamily: `'${f.name}', system-ui, sans-serif` }}>{f.name}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{t(f.category, f.categoryEn)}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{t('Kartenlayout für das Bewerten der Gerichte', 'Card layout for rating dishes')}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {BRAND_CARD_STYLES.map(cs => (
                            <button key={cs.id} onClick={() => setBrandForm(p => ({ ...p, cardStyle: cs.id }))}
                              className="text-left p-4 rounded-xl border-2 transition-colors border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"
                              style={brandForm.cardStyle === cs.id ? { borderColor: brandForm.accent, backgroundColor: `color-mix(in srgb, ${brandForm.accent} 8%, transparent)` } : {}}>
                              <p className="text-[13px] font-semibold text-gray-900 dark:text-white mb-1">{t(cs.label, cs.labelEn)}</p>
                              <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">{t(cs.desc, cs.descEn)}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                        <div>
                          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{t('Erscheinungsbild der Gastansicht', 'Guest view appearance')}</p>
                          <p className="text-[12px] text-gray-400 mt-0.5">
                            {t('Gilt nur für den Gast. Hell oder Dunkel der Verwaltung stellst du unter „Einstellungen" ein.', 'Guest-only. Light or dark for the admin is set under “Settings”.')}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {([['hell', t('Hell', 'Light'), t('Weißer Hintergrund', 'White background')], ['dunkel', t('Dunkel', 'Dark'), t('Dunkler Hintergrund', 'Dark background')]] as const).map(([id, label, desc]) => (
                            <button key={id} onClick={() => setBrandForm(p => ({ ...p, guestTheme: id }))}
                              className="text-left p-4 rounded-xl border-2 transition-colors border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"
                              style={brandForm.guestTheme === id ? { borderColor: brandForm.accent, backgroundColor: `color-mix(in srgb, ${brandForm.accent} 8%, transparent)` } : {}}>
                              <p className="text-[13px] font-semibold text-gray-900 dark:text-white mb-1">{label}</p>
                              <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* SPRACHE DER GASTANSICHT — vom Betrieb vorgegeben. Die
                          Sprache der Verwaltung wählt jeder für sich unter
                          „Einstellungen". */}
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                        <div>
                          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{t('Sprache der Gastansicht', 'Guest view language')}</p>
                          <p className="text-[12px] text-gray-400 mt-0.5">
                            {t('In dieser Sprache sehen Gäste die App am Tisch.', 'The language guests see at the table.')}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {LANGS.map(l => (
                            <button key={l.id} onClick={() => setBrandForm(p => ({ ...p, guestLang: l.id }))}
                              className="text-left p-4 rounded-xl border-2 transition-colors border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"
                              style={brandForm.guestLang === l.id ? { borderColor: brandForm.accent, backgroundColor: `color-mix(in srgb, ${brandForm.accent} 8%, transparent)` } : {}}>
                              <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{l.label}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* SCHRIFTFARBEN — zwei, unabhängig voneinander: die Zeile
                          „Filiale · Tisch" und der übrige Text (Schlagzeile,
                          Fließtext). Leer heißt: die üblichen Grau-/Schwarztöne
                          je nach Hell/Dunkel. */}
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                        <div>
                          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{t('Schriftfarben der Gastansicht', 'Guest view text colours')}</p>
                          <p className="text-[12px] text-gray-400 mt-0.5">
                            {t('Getrennt für den Standortnamen und den übrigen Text. Leer = die Standardfarben (Grau bzw. Schwarz/Weiß je nach Hell/Dunkel).', 'Separate for the location name and the rest of the text. Empty = the default colours (grey, or black/white by light/dark).')}
                          </p>
                        </div>
                        {([
                          { key: 'guestNameColor' as const, label: t('Standortname („Filiale · Tisch")', 'Location name (“Branch · Table”)'), fallback: '#6B7280' },
                          { key: 'guestTextColor' as const, label: t('Text (Schlagzeile und Fließtext)', 'Text (headline and body)'), fallback: brandForm.guestTheme === 'dunkel' ? '#FFFFFF' : '#111827' },
                        ]).map(({ key, label, fallback }) => {
                          const value = brandForm[key];
                          return (
                            <div key={key}>
                              <p className="text-[12px] text-gray-400 mb-1.5">{label}</p>
                              <div className="flex items-center gap-3 flex-wrap">
                                <input type="color" value={value ?? fallback}
                                  onChange={e => setBrandForm(p => ({ ...p, [key]: e.target.value }))}
                                  className="w-10 h-10 rounded-xl border border-gray-200 cursor-pointer p-0.5" />
                                <input value={value ?? ''} placeholder="Standard"
                                  onChange={e => setBrandForm(p => ({ ...p, [key]: e.target.value.trim() === '' ? null : e.target.value }))}
                                  className="flex-1 min-w-[120px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-700 text-[14px] text-gray-900 dark:text-white outline-none font-mono uppercase" />
                                {value && (
                                  <button onClick={() => setBrandForm(p => ({ ...p, [key]: null }))}
                                    className="text-[12px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">{t('Zurücksetzen', 'Reset')}</button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* TITELBILD — das Bild, das beim Gast über dem halben
                          Startbildschirm liegt. Ohne eines bleibt dort eine
                          Fläche in der Akzentfarbe: der Bildschirm funktioniert,
                          er lebt nur weniger. */}
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                        <div>
                          <p className="text-[15px] font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <ImagePlus size={15} strokeWidth={1.5} className="text-gray-400" /> {t('Titelbild', 'Cover image')}
                          </p>
                          <p className="text-[12px] text-gray-400 mt-1">
                            {t('Liegt beim Gast hinter der Begrüßung und läuft nach unten weich aus. Am besten ein ruhiges Bild vom Lokal. Gesichter und Schrift darauf verschwinden im Verlauf.',
                               'Sits behind the greeting for the guest and fades out downward. A calm photo of the place works best — faces and text on it disappear in the gradient.')}
                          </p>
                        </div>
                        <button type="button" onClick={() => coverInputRef.current?.click()} disabled={coverBusy}
                          className="w-full aspect-[16/9] rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 transition-colors flex items-center justify-center disabled:opacity-60">
                          {coverBusy
                            ? <span className="text-[12px] text-gray-400 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> {t('Wird verarbeitet…', 'Processing…')}</span>
                            : brandForm.coverImage
                              ? <img src={brandForm.coverImage} alt="" className="w-full h-full object-cover" />
                              : <span className="text-[12px] text-gray-400 flex items-center gap-1.5"><Upload size={12} /> {t('Bild auswählen', 'Choose image')}</span>}
                        </button>
                        <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); e.target.value = ''; }} />
                        {brandForm.coverImage && (
                          <>
                            <div className="pt-1">
                              <div className="flex items-center justify-between text-[12px] mb-1.5">
                                <span className="text-gray-400">{t('Deckkraft', 'Opacity')}</span>
                                <span className="font-medium text-gray-700 dark:text-gray-200 tabular-nums">{Math.round(brandForm.coverOpacity * 100)} %</span>
                              </div>
                              <input type="range" min={20} max={100} step={5}
                                value={Math.round(brandForm.coverOpacity * 100)}
                                onChange={e => setBrandForm(p => ({ ...p, coverOpacity: Number(e.target.value) / 100 }))}
                                className="w-full accent-gray-800 dark:accent-gray-300" />
                              <p className="text-[11px] text-gray-400 mt-1">
                                {t('Niedriger = das Bild tritt hinter der Begrüßung zurück. 100 % = voll.', 'Lower = the image sits back behind the greeting. 100% = full.')}
                              </p>
                            </div>
                            <button onClick={() => setBrandForm(p => ({ ...p, coverImage: null }))}
                              className="text-[11px] text-gray-400 hover:text-red-500">{t('Entfernen', 'Remove')}</button>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <PrimaryBtn full={false} sm onClick={handleSaveBrand} disabled={brandSaving || logoBusy || coverBusy}>
                          {brandSaving ? t('Speichert…', 'Saving…') : t('Änderungen speichern', 'Save changes')}
                        </PrimaryBtn>
                        {brandSaved && <span className="text-[12px] text-emerald-600 flex items-center gap-1"><Check size={13} /> {t('Gespeichert', 'Saved')}</span>}
                        {brandError && <span className="text-[12px] text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle size={13} /> {brandError}</span>}
                      </div>
                    </div>

                    <div className="xl:sticky xl:top-24">
                      <p className="text-[12px] text-gray-400 mb-2 uppercase tracking-wide">{t('Live-Vorschau', 'Live preview')}</p>
                      {/* Zeigt denselben Aufbau wie der Willkommensbildschirm
                          der Gäste — Titelbild bis an den Rand, Schlagzeile mit
                          dem Namen, Fußzeile —, damit die Vorschau nicht etwas
                          verspricht, was am Tisch anders aussieht. Darunter der
                          Gerichtsblock für das Listenlayout. */}
                      {/* Der Rahmen bleibt im Modus der Verwaltung, der „Bildschirm"
                          darin zeigt die Gastansicht in ihrem eigenen Hell/Dunkel —
                          das `light`/`dark` hier setzt den Modus der Verwaltung für
                          diesen Ausschnitt außer Kraft (siehe theme.css). */}
                      <div className="bg-gray-200 dark:bg-gray-950 rounded-[32px] p-3 shadow-inner">
                       <div className={brandForm.guestTheme === 'dunkel' ? 'dark' : 'light'}>
                        <div className="relative rounded-[24px] overflow-hidden bg-white dark:bg-gray-900"
                          style={{ fontFamily: `'${brandForm.font}', system-ui, sans-serif`, '--ba': readableAccent(brandForm.accent, brandForm.guestTheme === 'dunkel') } as React.CSSProperties}>
                          <div className="relative">
                            <div className="absolute inset-x-0 top-0 h-[62%] pointer-events-none">
                              {brandForm.coverImage ? (
                                <img src={brandForm.coverImage} alt="" aria-hidden className="w-full h-full object-cover"
                                  style={{ opacity: brandForm.coverOpacity }} />
                              ) : (
                                <div className="w-full h-full opacity-25"
                                  style={{ background: `linear-gradient(160deg, ${brandForm.accent}, transparent 70%)` }} />
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-white from-15% via-white/25 via-55% to-transparent dark:from-gray-900 dark:via-gray-900/50" />
                            </div>
                            <div className="relative z-10 px-5 pt-16 pb-5">
                              <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2"
                                style={brandForm.guestNameColor ? { color: brandForm.guestNameColor } : undefined}>
                                {branch?.name ?? store.branches[0]?.name} · {pick(brandForm.guestLang, 'Tisch', 'Table')} 1
                              </p>
                              <p className="text-[24px] font-bold leading-[1.1] tracking-tight text-gray-900 dark:text-white max-w-[200px]"
                                style={brandForm.guestTextColor ? { color: brandForm.guestTextColor } : undefined}>
                                {pick(brandForm.guestLang, 'Wie war dein Besuch bei', 'How was your visit to')} {brandForm.name || t('Dein Restaurant', 'Your restaurant')}?
                              </p>
                              <button className="w-full h-[44px] mt-5 rounded-[14px] shadow-lg flex items-center justify-between px-4 text-white text-[14px] font-medium"
                                style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
                                {pick(brandForm.guestLang, 'Feedback starten', 'Start feedback')} <ArrowRight size={16} strokeWidth={1.75} />
                              </button>
                              <div className="flex items-center justify-center gap-2 pt-5">
                                <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Powered by</span>
                                <BitelyWordmark className="h-5" />
                              </div>
                            </div>
                          </div>
                          {/* Der Gerichtsblock steht darunter, weil das Kartenlayout
                              sonst nirgends zu sehen wäre — beim Gast liegt er einen
                              Bildschirm weiter. */}
                          <div className="border-t border-gray-100 dark:border-gray-800">
                            {previewDish ? (
                              <DishRatingCard dish={previewDish} stars={previewStars} note="" expanded={false} cardStyle={brandForm.cardStyle}
                                onRate={setPreviewStars} onToggleExpand={() => {}} onNoteChange={() => {}} />
                            ) : (
                              <div className="w-full h-24 bg-gray-50 dark:bg-gray-800/50" />
                            )}
                          </div>
                        </div>
                       </div>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">{t('Tippe auf die Sterne in der Vorschau, um die Akzentfarbe zu testen. Änderungen sind noch nicht gespeichert.', 'Tap the stars in the preview to test the accent colour. Changes are not saved yet.')}</p>
                    </div>
                  </div>
                </div>
              )}

              {page === 'users' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{t('Benutzer', 'Users')}</p>
                      <p className="text-[13px] text-gray-400 mt-0.5">{t(`${store.users.length} Benutzer`, `${store.users.length} users`)} · {store.brand?.name}</p>
                    </div>
                    <button onClick={() => setShowInvite(true)}
                      className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl text-white font-medium" style={{ backgroundColor: 'var(--ba)' }}>
                      <UserPlus size={13} strokeWidth={1.5} /> {t('Einladen', 'Invite')}
                    </button>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                          {[t('Name', 'Name'), t('Rolle', 'Role'), t('Filiale', 'Branch'), t('Status', 'Status'), ''].map((h, i) => <th key={i} className="text-left px-6 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>)}
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
                              <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${u.role === 'Admin' ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : u.role === 'Manager' ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>{roleLabel(u.role)}</span>
                            </td>
                            <td className="px-6 py-3.5 text-[14px] text-gray-600 dark:text-gray-400">{store.branches.find(b => b.id === u.branchId)?.name ?? t('Alle Filialen', 'All branches')}</td>
                            <td className="px-6 py-3.5">
                              <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${u.status === 'aktiv' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : u.status === 'eingeladen' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>{statusLabel(u.status)}</span>
                              {u.status === 'eingeladen' && (
                                <p className="text-[11px] text-gray-400 mt-1">{t('kann sich noch nicht anmelden', 'cannot sign in yet')}</p>
                              )}
                            </td>
                            <td className="px-6 py-3.5 relative" onClick={e => e.stopPropagation()}>
                              <button onClick={() => setUserMenuOpen(p => p === u.id ? null : u.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><MoreHorizontal size={16} strokeWidth={1.5} /></button>
                              {userMenuOpen === u.id && (
                                <div className="absolute right-6 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden z-20 min-w-[190px]">
                                  {/* Rollen zu vergeben ist Ketten-Sache: eine
                                      Filialleitung, die ihren Kellner zum Admin
                                      machen kann, hebt die Rollentrennung mit
                                      einem Klick auf. Der Server lehnt es
                                      ohnehin ab (PATCH /users/:id), hier gar
                                      nicht erst anzubieten erspart die
                                      Fehlermeldung. */}
                                  {isChainAdmin && (
                                    <button onClick={() => { setRoleDialog({ user: u, role: u.role, branchId: u.branchId ?? '', error: null }); setUserMenuOpen(null); }}
                                      className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                                      <Shield size={12} /> {t('Rolle & Filiale', 'Role & branch')}
                                    </button>
                                  )}
                                  <button onClick={() => { setPwDialog({ user: u, value: '', error: null }); setUserMenuOpen(null); }}
                                    className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                                    <Lock size={12} /> {u.status === 'eingeladen' ? t('Freischalten', 'Activate') : t('Passwort ändern', 'Change password')}
                                  </button>
                                  <button onClick={() => { store.removeUser(u.id); setUserMenuOpen(null); }} className="w-full text-left px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950 flex items-center gap-2">
                                    <Trash2 size={12} /> {t('Entfernen', 'Remove')}
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
                      <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{t('Berechtigungsmatrix', 'Permissions matrix')}</p>
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                          <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('Berechtigung', 'Permission')}</th>
                          {['Admin', 'Manager', 'Kellner'].map(r => <th key={r} className="text-center px-6 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{roleLabel(r)}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {PERMISSIONS.map((p, i) => (
                          <tr key={i} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                            <td className="px-6 py-3 text-[14px] text-gray-700 dark:text-gray-300">{t(p.de, p.en)}</td>
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
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{t('Einstellungen', 'Settings')}</p>

                  {/* SPRACHE DER VERWALTUNG — pro Gerät, wie Hell/Dunkel. Die
                      Sprache der Gastansicht steht getrennt unter „Design". */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                    <div>
                      <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{t('Sprache der Verwaltung', 'Admin language')}</p>
                      <p className="text-[12px] text-gray-400 mt-1">
                        {t('Gilt für dieses Gerät. Die Sprache, in der Gäste die App sehen, stellst du unter „Design" ein.',
                           'Applies to this device. The language guests see is set under “Design”.')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {LANGS.map(l => (
                        <button key={l.id} onClick={() => setUiLang(l.id)}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-[13px] font-medium transition-colors ${uiLang === l.id ? 'text-gray-900 dark:text-white' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}
                          style={uiLang === l.id ? { borderColor: 'var(--ba)', backgroundColor: 'color-mix(in srgb, var(--ba) 8%, transparent)' } : {}}>
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* DARSTELLUNG — stand vorher als Schalter in der schwarzen
                      Leiste über allem. Sie ist eine Einstellung wie jede
                      andere und gehört hierher; gemerkt wird sie auch über das
                      Neuladen hinaus, sonst wäre sie keine. */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                    <div>
                      <p className="text-[15px] font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        {dark ? <Moon size={15} strokeWidth={1.5} className="text-gray-400" /> : <Sun size={15} strokeWidth={1.5} className="text-gray-400" />} {t('Darstellung', 'Appearance')}
                      </p>
                      <p className="text-[12px] text-gray-400 mt-1">
                        {t('Gilt für dieses Gerät und nur für die Verwaltung. Das Erscheinungsbild der Gastansicht legst du unter „Design" fest.',
                           'Applies to this device and only to the admin. The guest view’s appearance is set under “Design”.')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {([[t('Hell', 'Light'), false], [t('Dunkel', 'Dark'), true]] as const).map(([label, value]) => (
                        <button key={label} onClick={() => setDark(() => value)}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-[13px] font-medium transition-colors ${dark === value ? 'text-gray-900 dark:text-white' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}
                          style={dark === value ? { borderColor: 'var(--ba)', backgroundColor: 'color-mix(in srgb, var(--ba) 8%, transparent)' } : {}}>
                          {value ? <Moon size={14} strokeWidth={1.5} /> : <Sun size={14} strokeWidth={1.5} />} {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* EIGENER API-SCHLÜSSEL — jede Rolle, nicht nur Admin: ein
                      Kellner braucht ihn für den Bon-Scan genauso wie ein Admin
                      für den Wochenrückblick. Ohne eigenen Schlüssel ändert sich
                      nichts: gemeinsamer Server-Schlüssel bzw. Notausgang wie bisher. */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                    <div>
                      <p className="text-[15px] font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Lock size={15} strokeWidth={1.5} className="text-gray-400" /> {t('Eigener API-Schlüssel', 'Your own API key')}
                      </p>
                      <p className="text-[12px] text-gray-400 mt-1">
                        {t('Treibt den Wochenrückblick im Dashboard und den Bon-Scan mit deinem eigenen Anthropic-Zugang an, statt mit dem gemeinsamen dieses Servers. Verschlüsselt gespeichert und dir nie wieder angezeigt.',
                           'Powers the weekly review and the receipt scan with your own Anthropic access instead of this server’s shared one. Stored encrypted and never shown to you again.')}
                      </p>
                    </div>
                    {apiKeyError && <p className="text-[12px] text-red-500">{apiKeyError}</p>}
                    {apiKeyOpen ? (
                      <div className="space-y-2">
                        <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
                          placeholder="sk-ant-…" autoComplete="off"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[14px] text-gray-900 dark:text-white outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white" />
                        <div className="flex gap-2">
                          <button onClick={() => { setApiKeyOpen(false); setApiKeyInput(''); setApiKeyError(null); }}
                            className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            {t('Abbrechen', 'Cancel')}
                          </button>
                          <button disabled={apiKeySaving || !apiKeyInput.trim()} onClick={async () => {
                              setApiKeySaving(true); setApiKeyError(null);
                              try {
                                await store.setMyApiKey(apiKeyInput.trim());
                                setApiKeyOpen(false); setApiKeyInput('');
                              } catch (err) {
                                setApiKeyError(err instanceof Error ? err.message : t('Speichern fehlgeschlagen.', 'Saving failed.'));
                              } finally {
                                setApiKeySaving(false);
                              }
                            }}
                            className="flex-1 py-2.5 rounded-xl text-[13px] font-medium text-white transition-colors disabled:opacity-50"
                            style={{ backgroundColor: 'var(--ba)' }}>
                            {apiKeySaving ? t('Speichert…', 'Saving…') : t('Speichern', 'Save')}
                          </button>
                        </div>
                      </div>
                    ) : store.authUser?.hasApiKey ? (
                      <div className="space-y-2">
                        <p className="text-[13px] text-gray-700 dark:text-gray-300">{t('Schlüssel hinterlegt.', 'Key stored.')}</p>
                        {confirmRemoveApiKey ? (
                          <div className="flex gap-2">
                            <button onClick={() => setConfirmRemoveApiKey(false)}
                              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                              {t('Abbrechen', 'Cancel')}
                            </button>
                            <button onClick={async () => { await store.removeMyApiKey(); setConfirmRemoveApiKey(false); }}
                              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                              {t('Ja, entfernen', 'Yes, remove')}
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => setApiKeyOpen(true)}
                              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                              {t('Ersetzen', 'Replace')}
                            </button>
                            <button onClick={() => setConfirmRemoveApiKey(true)}
                              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                              {t('Entfernen', 'Remove')}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => setApiKeyOpen(true)}
                        className="w-full py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        {t('Schlüssel hinzufügen', 'Add key')}
                      </button>
                    )}
                  </div>

                  {/* Filialen anzulegen oder zu löschen ist Sache der Kette. Die
                      Filialleitung sieht ihre eigene, kann sie aber nicht ändern. */}
                  {isChainAdmin && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Building2 size={15} strokeWidth={1.5} className="text-gray-400" /> {t('Filialen', 'Branches')}</p>
                        <button onClick={() => setBranchDialog({ branch: null })}
                          className="flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-xl text-white" style={{ backgroundColor: 'var(--ba)' }}>
                          <Plus size={12} strokeWidth={2} /> {t('Hinzufügen', 'Add')}
                        </button>
                      </div>
                      {store.branches.map(b => {
                        const tableCount = store.tables.filter(x => x.branchId === b.id).length;
                        return (
                          <div key={b.id} className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
                            <BranchIcon size={24} className="text-gray-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-medium text-gray-900 dark:text-white">{b.name}</p>
                              <p className="text-[12px] text-gray-400 flex items-center gap-1"><MapPin size={10} />{b.address}</p>
                              {!branch && (
                                <p className="text-[11px] text-gray-400 mt-0.5">{t(`${tableCount} ${tableCount === 1 ? 'Tisch' : 'Tische'}`, `${tableCount} ${tableCount === 1 ? 'table' : 'tables'}`)}</p>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => setBranchDialog({ branch: b })} title={t('Filiale bearbeiten', 'Edit branch')}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={13} /></button>
                              <button title={t('Filiale löschen', 'Delete branch')}
                                onClick={() => { if (confirm(t(`Filiale „${b.name}" wirklich löschen?`, `Really delete branch “${b.name}”?`))) runAction(() => store.removeBranch(b.id)); }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 size={13} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              )}

              {page === 'tables' && (
                <div className="space-y-5 max-w-4xl">
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{t('Tische & QR-Codes', 'Tables & QR codes')}</p>
                    <p className="text-[13px] text-gray-400 mt-0.5">
                      {branch ? branch.name : t('Erst eine Filiale wählen', 'Choose a branch first')}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                    <p className="text-[15px] font-semibold text-gray-900 dark:text-white flex items-center gap-2"><QrCode size={15} strokeWidth={1.5} className="text-gray-400" /> {t('QR-Codes per Tisch', 'QR code per table')}</p>
                    <p className="text-[13px] text-gray-500 dark:text-gray-400">
                      {t('Jeder QR-Code zeigt auf die Route, die Gäste beim Scannen öffnen. Die Filiale steht mit drin: Tisch 5 in der einen ist ein anderer Tisch als Tisch 5 in der anderen.',
                         'Each QR code points to the route guests open when scanning. The branch is part of it: table 5 in one branch is a different table from table 5 in another.')}
                    </p>
                    {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                      <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
                        <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                        <p className="text-[12px] text-amber-800 dark:text-amber-200 leading-relaxed">
                          {t('Diese QR-Codes zeigen auf localhost — sie funktionieren nur auf diesem Rechner, nicht wenn ein Handy sie scannt. Öffne diese Admin-Seite stattdessen über die Netzwerk-Adresse deines Rechners (z. B. http://192.168.x.x:5173/…), dann werden die QR-Codes damit erzeugt. Für den echten Einsatz: eine öffentliche Domain statt der lokalen IP.',
                             'These QR codes point to localhost — they only work on this machine, not when a phone scans them. Open this admin page via your machine’s network address instead (e.g. http://192.168.x.x:5173/…) and the QR codes will use it. For real use: a public domain rather than the local IP.')}
                        </p>
                      </div>
                    )}
                    {/* Tische und QR-Codes gehören immer GENAU einer Filiale.
                        Im Ketten-Blick gibt es deshalb nichts anzulegen — erst
                        die Filiale wählen. */}
                    {!branch ? (
                      /* Vorher stand hier nur der Satz „wechsle oben links" —
                         und damit ein Verweis auf einen Regler, der woanders
                         steht, statt der Sache selbst. Wer Tische einer Filiale
                         sucht, wählt sie jetzt hier, wo er danach fragt; der
                         Umschalter in der Seitenleiste zieht mit, weil es
                         derselbe Wechsel ist. */
                      <div className="space-y-3 py-2">
                        <div className="text-center">
                          <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                            <Building2 size={18} strokeWidth={1.5} className="text-gray-400" />
                          </div>
                          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{t('Welche Filiale?', 'Which branch?')}</p>
                          <p className="text-[13px] text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
                            {t('Tische und QR-Codes gehören immer genau einer Filiale. Tisch 5 hier ist ein anderer Tisch als Tisch 5 dort.',
                               'Tables and QR codes always belong to exactly one branch. Table 5 here is a different table from table 5 there.')}
                          </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {store.branches.map(b => (
                            <button key={b.id} onClick={() => onPick(b.slug)}
                              className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 text-left hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                              <BranchIcon size={20} className="text-gray-400 flex-shrink-0" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[14px] font-medium text-gray-900 dark:text-white truncate">{b.name}</span>
                                <span className="block text-[12px] text-gray-400 truncate">
                                  {t(`${store.tables.filter(x => x.branchId === b.id).length} Tische`, `${store.tables.filter(x => x.branchId === b.id).length} tables`)}
                                </span>
                              </span>
                              <ArrowRight size={15} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-end gap-3 flex-wrap pb-1 border-b border-gray-100 dark:border-gray-800">
                          <div>
                            <p className="text-[12px] text-gray-400 mb-1.5">{t('Neue Tische', 'New tables')}</p>
                            <input type="number" min={1} max={50} value={addTableCount}
                              onChange={e => setAddTableCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                              className="w-24 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-700 text-[13px] text-gray-700 dark:text-gray-300 outline-none" />
                          </div>
                          <button onClick={handleAddTables} disabled={addingTables}
                            className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl text-white font-medium disabled:opacity-50 mb-0"
                            style={{ backgroundColor: 'var(--ba)' }}>
                            <Plus size={14} strokeWidth={2} /> {addingTables ? t('Wird angelegt…', 'Creating…') : t('Tisch(e) anlegen', 'Create table(s)')}
                          </button>
                          <p className="text-[11px] text-gray-400">
                            {t(`${branchTables.length} ${branchTables.length === 1 ? 'Tisch' : 'Tische'} in ${branch.name}`, `${branchTables.length} ${branchTables.length === 1 ? 'table' : 'tables'} at ${branch.name}`)}
                          </p>
                        </div>
                        {branchTables.length === 0 ? (
                          <EmptyState icon={QrCode} title={t(`Noch keine Tische in ${branch.name}`, `No tables at ${branch.name} yet`)}
                            desc={t('Lege oben Tische an. Jeder bekommt eine eigene Nummer und einen QR-Code, der nur zu dieser Filiale führt.', 'Add tables above. Each gets its own number and a QR code that only leads to this branch.')} />
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                            {[...branchTables].sort((a, b) => a.number - b.number).map(tbl => (
                              <div key={tbl.id} className="relative bg-gray-50 dark:bg-gray-900 rounded-2xl p-4 flex flex-col items-center gap-3 border border-gray-100 dark:border-gray-800">
                                <TableQRCode orgSlug={orgSlug} branchSlug={branch.slug} tableNumber={tbl.number}
                                  onDelete={() => { if (confirm(t(`Tisch ${tbl.number} in ${branch.name} und seinen QR-Code wirklich löschen?`, `Really delete table ${tbl.number} at ${branch.name} and its QR code?`))) store.removeTable(branch.slug, tbl.id); }} />
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
                  {/* Diese Seite steht nicht mehr im Menü — sie wird vom
                      Dashboard aus geöffnet. Ohne Rückweg wäre sie eine
                      Sackgasse. */}
                  <button onClick={() => setPage('dashboard')}
                    className="flex items-center gap-1.5 text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                    <ChevronLeft size={15} strokeWidth={1.5} /> {t('Zurück zum Dashboard', 'Back to dashboard')}
                  </button>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{t('Bewertungen', 'Reviews')}</p>
                      <p className="text-[13px] text-gray-400 mt-0.5">
                        {t('Was Gäste zu einzelnen Gerichten geschrieben haben, neueste zuerst', 'What guests wrote about individual dishes, newest first')} · {branch ? branch.name : t('alle Filialen', 'all branches')}
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
                      <EmptyState icon={MessageSquare} title={t('Noch keine Bewertungen', 'No reviews yet')}
                        desc={t('Sobald Gäste über den QR-Code Feedback abgeben, erscheinen die Rückmeldungen hier, inklusive der Freitexte zu einzelnen Gerichten.', 'As guests give feedback via the QR code, their responses appear here, including free-text comments on individual dishes.')} />
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
                                <span className="text-[13px] font-semibold text-gray-900 dark:text-white">{t('Tisch', 'Table')} {rv.tableNumber}</span>
                                <span className="text-[12px] text-gray-400">
                                  {new Date(rv.createdAt).toLocaleString(uiLang === 'en' ? 'en-GB' : 'de-AT', {
                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              {rated.length > 0 && (
                                <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: STAR_COLOR }}>
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
                                          {dish?.name ?? t('Gelöschtes Gericht', 'Deleted dish')}
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
                                [t('Service', 'Service'), rv.overall.service],
                                [t('Ambiente', 'Ambience'), rv.overall.ambience],
                                [t('Tempo', 'Speed'), rv.overall.speed],
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
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{t('Menü', 'Menu')}</p>
                      <p className="text-[13px] text-gray-400 mt-0.5">
                        {t(`${store.dishes.length} Gerichte`, `${store.dishes.length} dishes`)} · {isChainAdmin
                          ? t('Stammkarte der Kette', 'Chain master menu')
                          : t(`Verfügbarkeit in ${branch?.name ?? 'deiner Filiale'}`, `Availability at ${branch?.name ?? 'your branch'}`)}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={exportDishesCsv}
                        className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 transition-colors">
                        <Download size={13} strokeWidth={1.5} /> {t('Export', 'Export')}
                      </button>
                      {/* Der Gegenpart zum Export, und derselbe Dateityp: eine
                          Karte kommt selten getippt, sondern als Tabelle aus
                          der Kasse. Nur die Kette darf die Stammkarte ändern —
                          für die Filialleitung wäre der Knopf ein Versprechen,
                          das der Server ablehnt. */}
                      {isChainAdmin && (
                        <button onClick={() => setImportOpen(true)}
                          className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 transition-colors">
                          <Upload size={13} strokeWidth={1.5} /> {t('Import', 'Import')}
                        </button>
                      )}
                      {isChainAdmin && (
                        <button onClick={() => setDishDialog({ dish: null })}
                          className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl text-white font-medium" style={{ backgroundColor: 'var(--ba)' }}>
                          <Plus size={13} strokeWidth={2} /> {t('Gericht', 'Dish')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Die Gerichts-Matrix stand hier und liegt jetzt im
                      Dashboard: sie ist eine Auswertung, keine Verwaltung.
                      Das Menü ist die Karte — anlegen, ändern, ein- und
                      ausschalten. */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                    {store.dishes.length === 0 ? (
                      <EmptyState icon={UtensilsCrossed} title={t('Noch keine Gerichte', 'No dishes yet')}
                        desc={t('Lege die Karte an. Jedes Gericht kann danach am Tisch einzeln bewertet werden.', 'Build the menu. Each dish can then be rated individually at the table.')} />
                    ) : (
                    <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                          {['#', t('Gericht', 'Dish'), t('Kategorie', 'Category'), t('Ø Bewertung', 'Avg rating'), t('Rezensionen', 'Reviews'), t('Preis', 'Price'),
                            branch ? t(`In ${branch.name}`, `At ${branch.name}`) : t('Filialen', 'Branches'), t('Trend', 'Trend'), ''].map((h, i) => (
                            <th key={i} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...store.dishes].sort((a, b) => (dishAvg(b) ?? 0) - (dishAvg(a) ?? 0)).map((dish, i) => {
                          const avg = dishAvg(dish) ?? 0;
                          // Zwei Stufen: ab 4,0 grün, darunter warmes Orange
                          // (WEAK_RATING_DEFAULT). Der getönte Hintergrund wird
                          // aus der Textfarbe gerechnet.
                          const good = avg >= 4;
                          const scoreCls = good ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950' : '';
                          const scoreStyle = good ? undefined : weakRatingStyle(WEAK_RATING_DEFAULT);
                          const TrendIcon = avg >= 4.4 ? TrendingUp : (avg > 0 && avg < 3) ? TrendingDown : null;
                          const trendColor = avg >= 4.4 ? 'text-gray-500' : '';
                          const trendStyle = avg >= 4.4 ? undefined : { color: WEAK_RATING_DEFAULT };
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
                                <span className="text-[11px] px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{catLabel(dish.cat)}</span>
                              </td>
                              <td className="px-5 py-3.5">
                                {dish.ratingsCount > 0 ? (
                                  <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-2.5 py-1 rounded-lg ${scoreCls}`} style={scoreStyle}>
                                    <Star size={11} fill="currentColor" strokeWidth={0} />{avg.toFixed(1)}
                                  </span>
                                ) : <span className="text-[12px] text-gray-400">{t('Noch keine', 'None yet')}</span>}
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
                                  <span className="text-[12px] text-gray-400">{t('Alle', 'All')}</span>
                                ) : (
                                  <span className="text-[11px] px-2 py-1 rounded-full font-medium bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                    {t(`${dish.branchIds.length} von ${store.branches.length}`, `${dish.branchIds.length} of ${store.branches.length}`)}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                {TrendIcon ? <TrendIcon size={16} className={trendColor} style={trendStyle} strokeWidth={2} /> : <span className="w-4 h-0.5 bg-gray-200 dark:bg-gray-700 inline-block rounded-full" />}
                              </td>
                              <td className="px-5 py-3.5">
                                {/* Stammdaten ändern darf nur die Kette — die
                                    Filialleitung hat den Schalter links. */}
                                {isChainAdmin && (
                                  <div className="flex gap-1 justify-end">
                                    <button onClick={() => setDishDialog({ dish })} title={t('Gericht bearbeiten', 'Edit dish')}
                                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={13} /></button>
                                    <button title={t('Gericht löschen', 'Delete dish')}
                                      onClick={() => { if (confirm(t(`„${dish.name}" wirklich aus dem Menü löschen? Bereits abgegebene Bewertungen bleiben erhalten.`, `Really delete “${dish.name}” from the menu? Ratings already given are kept.`))) runAction(() => store.removeDish(dish.id)); }}
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
                  {isChainAdmin && (
                    <button onClick={() => setPage('vouchers')}
                      className="flex items-center gap-1.5 text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                      <ChevronLeft size={15} strokeWidth={1.5} /> {t('Zurück zu den Gutscheinen', 'Back to vouchers')}
                    </button>
                  )}
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{t('Einlösungen', 'Redemptions')}</p>
                    <p className="text-[13px] text-gray-400 mt-0.5">
                      {t('Wer wann welchen Gutschein eingelöst hat', 'Who redeemed which voucher and when')} · {branch ? branch.name : t('alle Filialen', 'all branches')}
                    </p>
                  </div>

                  {/* Kennzahlen. Der Wisch löst ein und bucht die Punkte ab —
                      ein Zwischenschritt „Ausgabe offen" gibt es nicht mehr.
                      „Ausstehend" und „Zurückgebucht" erscheinen nur, wenn aus
                      der Zeit der 60-Sekunden-Frist noch Altbestand da ist. */}
                  {(() => {
                    const done = store.redemptions.filter(r => r.status === 'eingelöst').length;
                    const pending = store.redemptions.filter(r => r.status === 'entwertet' || r.status === 'offen').length;
                    const refunded = store.redemptions.filter(r => r.status === 'verfallen' || r.status === 'abgebrochen').length;
                    const spentPoints = store.redemptions
                      .filter(r => r.status !== 'verfallen' && r.status !== 'abgebrochen')
                      .reduce((a, r) => a + r.points, 0);
                    const tiles: [string, number, string][] = [
                      [t('Eingelöst', 'Redeemed'), done, 'text-emerald-700 dark:text-emerald-300'],
                      [t('Punkte verbraucht', 'Points spent'), spentPoints, 'text-gray-900 dark:text-white'],
                    ];
                    if (pending > 0) tiles.push([t('Ausstehend (alt)', 'Pending (old)'), pending, 'text-amber-700 dark:text-amber-300']);
                    if (refunded > 0) tiles.push([t('Zurückgebucht', 'Refunded'), refunded, 'text-gray-500']);
                    return (
                      <div className={`grid grid-cols-2 gap-3 ${tiles.length >= 4 ? 'sm:grid-cols-4' : tiles.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                        {tiles.map(([label, value, cls]) => (
                          <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
                            <p className="text-[11px] text-gray-400 uppercase tracking-wider">{label}</p>
                            <p className={`text-2xl font-bold mt-1 ${cls}`}>{value}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                    {store.redemptions.length === 0 ? (
                      <EmptyState icon={Ticket} title={t('Noch keine Einlösungen', 'No redemptions yet')}
                        desc={t('Sobald ein Gast einen Gutschein am Tisch einlöst, erscheint er hier — mit Zeitpunkt, Tisch und Punktepreis.', 'As soon as a guest redeems a voucher at the table, it appears here — with time, table and points cost.')} />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                              {[t('Gutschein', 'Voucher'), t('Status', 'Status'), t('Tisch', 'Table'), t('Punkte', 'Points'), t('Wann', 'When')].map((h, i) => (
                                <th key={i} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {store.redemptions.map(r => {
                              // Grün = eingelöst (der Normalfall). Bernstein nur
                              // noch für Altbestand aus der Zeit der Frist.
                              const badge = r.status === 'eingelöst'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : r.status === 'entwertet' || r.status === 'offen'
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
                              return (
                                <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                                  <td className="px-5 py-3.5 text-[14px] font-medium text-gray-900 dark:text-white">{r.voucherTitle}</td>
                                  <td className="px-5 py-3.5">
                                    <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${badge}`}>{r.status === 'eingelöst' ? t('eingelöst', 'redeemed') : r.status === 'entwertet' ? t('entwertet', 'voided') : r.status}</span>
                                  </td>
                                  <td className="px-5 py-3.5 text-[14px] text-gray-600 dark:text-gray-400">{r.tableNumber ?? '—'}</td>
                                  <td className="px-5 py-3.5 text-[14px] text-gray-600 dark:text-gray-400">{r.points}</td>
                                  <td className="px-5 py-3.5 text-[13px] text-gray-500 dark:text-gray-400">
                                    {new Date(r.redeemedAt ?? r.createdAt).toLocaleString(uiLang === 'en' ? 'en-GB' : 'de-AT', {
                                      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                                    })}
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

              {page === 'vouchers' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{t('Gutscheine', 'Vouchers')}</p>
                      <p className="text-[13px] text-gray-400 mt-0.5">
                        {t(`${activeVouchers.length} gültig · was Gäste für ihre gesammelten Punkte einlösen können`, `${activeVouchers.length} active · what guests can redeem their points for`)}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {expiredVouchers.length > 0 && (
                        <button onClick={() => setShowExpiredVouchers(p => !p)}
                          className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 transition-colors">
                          <Clock size={13} strokeWidth={1.5} />
                          {showExpiredVouchers ? t('Abgelaufene ausblenden', 'Hide expired') : t(`${expiredVouchers.length} abgelaufene`, `${expiredVouchers.length} expired`)}
                        </button>
                      )}
                      <button onClick={() => setPage('redemptions')}
                        className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 transition-colors">
                        <CheckCircle2 size={13} strokeWidth={1.5} /> {t('Eingelöste ansehen', 'View redemptions')}
                      </button>
                      <button onClick={() => setVoucherDialog({ voucher: null })}
                        className="flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl text-white font-medium" style={{ backgroundColor: 'var(--ba)' }}>
                        <Plus size={13} strokeWidth={2} /> {t('Gutschein', 'Voucher')}
                      </button>
                    </div>
                  </div>

                  {visibleVouchers.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                      <EmptyState icon={Ticket}
                        title={store.vouchers.length === 0 ? t('Noch keine Gutscheine', 'No vouchers yet') : t('Kein gültiger Gutschein', 'No active voucher')}
                        desc={store.vouchers.length === 0
                          ? t('Ohne Gutscheine haben gesammelte Punkte keinen Gegenwert. Lege eine erste Belohnung an.', 'Without vouchers, collected points are worth nothing. Create a first reward.')
                          : t('Alle angelegten Gutscheine sind abgelaufen. Für den Gast ist gerade nichts zu holen, blende sie oben ein, um sie zu verlängern.', 'Every voucher has expired. There is nothing for guests to redeem right now — show them above to extend them.')} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {visibleVouchers.map(v => {
                        const expired = voucherExpired(v);
                        return (
                          <div key={v.id} className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm overflow-hidden ${expired ? 'border-gray-200 dark:border-gray-700 opacity-60' : 'border-gray-100 dark:border-gray-700'}`}>
                            <div className="h-28 bg-gray-100 dark:bg-gray-900">
                              <img src={v.img} alt="" className={`w-full h-full object-cover ${expired ? 'grayscale' : ''}`} />
                            </div>
                            <div className="p-4 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[14px] font-semibold text-gray-900 dark:text-white leading-snug">{v.title}</p>
                                <span className="text-[11px] px-2 py-1 rounded-full font-medium text-white flex-shrink-0" style={{ backgroundColor: 'var(--ba)' }}>{v.points} P</span>
                              </div>
                              <p className="text-[12px] flex items-center gap-1.5 text-gray-400">
                                <Clock size={11} strokeWidth={1.5} />
                                {expired
                                  ? <span className="text-red-600 dark:text-red-400 font-medium">{t(`Abgelaufen am ${v.expiry}`, `Expired on ${v.expiry}`)}</span>
                                  : <>{t(`Gültig bis ${v.expiry}`, `Valid until ${v.expiry}`)}</>}
                              </p>
                              <p className="text-[12px] text-gray-400 flex items-center gap-1.5">
                                <Building2 size={11} strokeWidth={1.5} />
                                {v.branchIds == null
                                  ? t('In allen Filialen', 'At all branches')
                                  : v.branchIds.map(id => store.branches.find(b => b.id === id)?.name ?? '?').join(', ')}
                              </p>
                              <div className="flex gap-1 pt-1">
                                <button onClick={() => setVoucherDialog({ voucher: v })} title={t('Gutschein bearbeiten', 'Edit voucher')}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={13} /></button>
                                <button title={t('Gutschein löschen', 'Delete voucher')}
                                  onClick={() => { if (confirm(t(`„${v.title}" wirklich löschen?`, `Really delete “${v.title}”?`))) runAction(() => store.removeVoucher(v.id)); }}
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
        {importOpen && <DishImportDialog onClose={() => setImportOpen(false)} />}
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
                  <p className="text-[18px] font-semibold text-gray-900 dark:text-white">{t('Benutzer einladen', 'Invite user')}</p>
                  <button onClick={() => setShowInvite(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} className="text-gray-500" /></button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] text-gray-500 mb-1 block">{t('Name', 'Name')}</label>
                    <input value={inviteForm.name} onChange={e => setInviteForm(p => ({ ...p, name: e.target.value }))} placeholder="Max Mustermann" type="text"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[14px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors" />
                  </div>
                  <div>
                    <label className="text-[12px] text-gray-500 mb-1 block">{t('E-Mail', 'Email')}</label>
                    <input value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))} placeholder="name@restaurant.at" type="email"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[14px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors" />
                  </div>
                  {/* Die Filialleitung darf nur Servicekräfte und nur in der
                      eigenen Filiale anlegen. Der Server erzwingt das ohnehin
                      (POST /users); hier gar nicht erst anzubieten erspart die
                      Fehlermeldung. */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[12px] text-gray-500 mb-1 block">{t('Rolle', 'Role')}</label>
                      <select value={inviteForm.role} onChange={e => setInviteForm(p => ({ ...p, role: e.target.value as AdminUser['role'] }))}
                        disabled={!isChainAdmin}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[13px] text-gray-700 dark:text-gray-300 outline-none disabled:opacity-60">
                        {(isChainAdmin ? ['Kellner', 'Manager', 'Admin'] : ['Kellner']).map(o => <option key={o} value={o}>{roleLabel(o)}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[12px] text-gray-500 mb-1 block">{t('Filiale', 'Branch')}</label>
                      <select value={inviteForm.branchId} onChange={e => setInviteForm(p => ({ ...p, branchId: e.target.value }))}
                        disabled={!isChainAdmin}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[13px] text-gray-700 dark:text-gray-300 outline-none disabled:opacity-60">
                        {isChainAdmin
                          ? store.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                          : <option value="">{store.branches.find(b => b.id === store.authUser?.branchId)?.name ?? t('Eigene Filiale', 'Own branch')}</option>}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[12px] text-gray-500 mb-1 block">{t('Erstes Passwort (mind. 8 Zeichen)', 'First password (min. 8 characters)')}</label>
                    <input value={inviteForm.password} onChange={e => setInviteForm(p => ({ ...p, password: e.target.value }))}
                      placeholder={t('wird beim Anlegen gesetzt', 'set when the account is created')} type="text" autoComplete="off"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[14px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors" />
                    <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                      {t('Es wird keine E-Mail verschickt, gib das Passwort persönlich weiter. Die Person meldet sich damit und der E-Mail-Adresse an; ändern lässt es sich hier jederzeit wieder.',
                         'No email is sent — pass the password on in person. The user signs in with it and their email address; you can change it here any time.')}
                    </p>
                  </div>
                </div>
                {inviteError && <p className="text-[13px] text-red-600 dark:text-red-400">{inviteError}</p>}
                <div className="flex gap-3 pt-1">
                  <SecondaryBtn onClick={() => { setShowInvite(false); setInviteError(null); }}>{t('Abbrechen', 'Cancel')}</SecondaryBtn>
                  <PrimaryBtn onClick={handleInviteSubmit}>{t('Benutzer anlegen', 'Create user')}</PrimaryBtn>
                </div>
              </div>
            </motion.div>
          </>
        )}

        {roleDialog && (
          <>
            <motion.div className="fixed inset-0 bg-black/50 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRoleDialog(null)} />
            <motion.div className="fixed inset-0 flex items-center justify-center z-50 p-4 sm:p-8"
              initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}>
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[18px] font-semibold text-gray-900 dark:text-white">{t('Rolle & Filiale', 'Role & branch')}</p>
                  <button onClick={() => setRoleDialog(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} className="text-gray-500" /></button>
                </div>
                <p className="text-[13px] text-gray-500 dark:text-gray-400">{roleDialog.user.name} · {roleDialog.user.email}</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[12px] text-gray-500 mb-1 block">{t('Rolle', 'Role')}</label>
                    <select value={roleDialog.role}
                      onChange={e => setRoleDialog(p => p && { ...p, role: e.target.value as AdminUser['role'], error: null })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[13px] text-gray-700 dark:text-gray-300 outline-none">
                      {(['Kellner', 'Manager', 'Admin'] as const).map(o => <option key={o} value={o}>{roleLabel(o)}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[12px] text-gray-500 mb-1 block">{t('Filiale', 'Branch')}</label>
                    <select value={roleDialog.branchId}
                      onChange={e => setRoleDialog(p => p && { ...p, branchId: e.target.value, error: null })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[13px] text-gray-700 dark:text-gray-300 outline-none">
                      <option value="">{t('Alle Filialen (Kette)', 'All branches (chain)')}</option>
                      {store.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  {t('Die neue Rolle gilt, sobald sich die Person das nächste Mal anmeldet. Ein laufendes Token trägt noch die alte. Die eigene Rolle und die des letzten Admins lassen sich nicht ändern.',
                     'The new role takes effect the next time the person signs in — a running session still carries the old one. You cannot change your own role or the last admin’s.')}
                </p>
                {roleDialog.error && <p className="text-[13px] text-red-600 dark:text-red-400">{roleDialog.error}</p>}
                <div className="flex gap-3 pt-1">
                  <SecondaryBtn onClick={() => setRoleDialog(null)}>{t('Abbrechen', 'Cancel')}</SecondaryBtn>
                  <PrimaryBtn onClick={handleSaveRole}>{t('Speichern', 'Save')}</PrimaryBtn>
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
                    {pwDialog.user.status === 'eingeladen' ? t('Konto freischalten', 'Activate account') : t('Passwort ändern', 'Change password')}
                  </p>
                  <button onClick={() => setPwDialog(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} className="text-gray-500" /></button>
                </div>
                <p className="text-[13px] text-gray-500 dark:text-gray-400">{pwDialog.user.name} · {pwDialog.user.email}</p>
                <div>
                  <label className="text-[12px] text-gray-500 mb-1 block">{t('Neues Passwort (mind. 8 Zeichen)', 'New password (min. 8 characters)')}</label>
                  <input value={pwDialog.value} autoFocus type="text" autoComplete="off"
                    onChange={e => setPwDialog(p => p && { ...p, value: e.target.value, error: null })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-[14px] text-gray-900 dark:text-white outline-none focus:border-gray-400 transition-colors" />
                  <p className="text-[11px] text-gray-400 mt-1.5">{t('Gib es der Person persönlich weiter, verschickt wird nichts.', 'Pass it on in person — nothing is sent.')}</p>
                </div>
                {pwDialog.error && <p className="text-[13px] text-red-600 dark:text-red-400">{pwDialog.error}</p>}
                <div className="flex gap-3 pt-1">
                  <SecondaryBtn onClick={() => setPwDialog(null)}>{t('Abbrechen', 'Cancel')}</SecondaryBtn>
                  <PrimaryBtn onClick={handleSetPassword}>{t('Speichern', 'Save')}</PrimaryBtn>
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
    <div className="bg-gray-950 text-white px-3 sm:px-4 h-12 flex items-center gap-2 sm:gap-3 text-[12px] sticky top-0 z-50 overflow-hidden">
      <BitelyWordmark tone="light" className="h-7 flex-shrink-0" />
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

  // Die Gastansicht spricht als Gastkonto mit dem Server, die Personalansichten
  // als Mitarbeiterkonto. Wer beides im Browser hat — Admin offen, QR-Code am
  // eigenen Handy — bekäme sonst überall das Personal-Token angehängt und wäre
  // als Gast scheinbar nie angemeldet.
  return (
    <StoreProvider orgSlug={orgSlug} scope={scope} audience={view === 'guest' ? 'guest' : 'staff'}>
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
  const t = useT();
  // Hell oder Dunkel ist eine Einstellung, kein Bildschirmzustand — sie
  // überlebt das Neuladen. Im Privatmodus schlägt der Zugriff fehl; dann bleibt
  // es bei Hell, statt dass die Seite gar nicht erst startet.
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('bitely.theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('bitely.theme', dark ? 'dark' : 'light'); } catch { /* Privatmodus */ }
  }, [dark]);
  useGoogleFont(store.brand?.font);
  useDocumentTitle(store.brand?.name,
    view === 'admin' ? t('Verwaltung', 'Admin')
      : view === 'waiter' ? t('Service', 'Service')
      : tableNumber != null ? `${t('Tisch', 'Table')} ${tableNumber}` : null);

  const needsLogin = view === 'admin' || view === 'waiter';

  // Die Anmeldung wird VOR dem Zustand geprüft: ohne Konto lehnt /state für
  // Mitarbeiteransichten ab, und diese Absage soll als Login-Maske erscheinen,
  // nicht als Serverfehler.
  //
  // Die Prüfung hier ersetzt NICHT den Schutz auf dem Server (requireAuth) —
  // sie verhindert nur, dass jemand eine Ansicht sieht, deren Schaltflächen
  // ohnehin mit 401/403 abgewiesen würden.
  if (needsLogin) {
    if (store.authLoading) return <FullScreenMessage>{t("Anmeldung wird geprüft…", "Checking sign-in…")}</FullScreenMessage>;
    if (!store.authUser) {
      return (
        // Ohne Kopfleiste: wer noch nicht angemeldet ist, hat dort nichts zu
        // holen — kein Name, kein Abmelden, nur der Markenname, und der steht
        // jetzt in der Maske selbst. Der Hell/Dunkel-Schalter fällt hier damit
        // weg; die Wahl steckt in localStorage und gilt nach der Anmeldung
        // weiter.
        <div className={dark ? 'dark' : ''}>
          <LoginScreen />
        </div>
      );
    }
    if (view === 'admin' && !isAdminRole(store.authUser.role)) {
      return (
        <div className={dark ? 'dark' : ''}>
          <TopBar dark={dark} setDark={setDark} />
          <FullScreenMessage error action={
            <Link to={`/${orgSlug}/staff`} className="px-4 py-2 rounded-xl text-white text-[13px]" style={{ backgroundColor: BITELY_ACCENT }}>
              {t("Zur Tischübersicht", "To the table overview")}
            </Link>
          }>
            {t(`Als ${store.authUser.role} hast du auf die Verwaltung keinen Zugriff.`, `As ${store.authUser.role === 'Kellner' ? 'a waiter' : store.authUser.role === 'Manager' ? 'a manager' : 'an admin'} you have no access to the admin.`)}
          </FullScreenMessage>
        </div>
      );
    }
  }

  if (store.loading) return <FullScreenMessage>{t("Lädt Restaurantdaten…", "Loading restaurant data…")}</FullScreenMessage>;
  if (store.connectionLost) return <NetworkErrorPage onRetry={store.refresh} />;
  if (store.error) {
    return (
      <FullScreenMessage error action={
        <button onClick={() => store.refresh()} className={`inline-flex items-center gap-2 px-5 min-h-[44px] rounded-xl text-white text-[13px] font-semibold ${FOCUS_RING}`} style={{ backgroundColor: BITELY_ACCENT }}>
          <RefreshCw size={14} strokeWidth={2} /> Erneut versuchen
        </button>
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

  // Hell oder Dunkel entscheidet sich getrennt: die Gastansicht folgt der
  // Marke (`guestTheme`, in den Design-Einstellungen gesetzt), Personal und
  // Verwaltung der persönlichen Einstellung `dark`. Sonst gäbe der Schalter
  // in den Verwaltungs-Einstellungen versehentlich das Erscheinungsbild
  // vor, das die Gäste sehen.
  const viewDark = view === 'guest' ? store.brand.guestTheme === 'dunkel' : dark;

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
        <div className={viewDark ? 'dark' : ''}>
          <TopBar dark={dark} setDark={setDark} />
          <BranchPicker branches={store.branches} onPick={onPick} />
        </div>
      );
    }
    return (
      <div className={viewDark ? 'dark' : ''}>
        <TopBar dark={dark} setDark={setDark} />
        <FullScreenMessage error>
          {view === 'guest'
            ? `Die Filiale "${branchSlug}" gibt es nicht. Bitte scanne den QR-Code am Tisch erneut.`
            : 'Für diese Organisation ist noch keine Filiale angelegt.'}
        </FullScreenMessage>
      </div>
    );
  }

  // Die schwarze Leiste bleibt nur noch im Kellner-Bereich, der keine eigene
  // Navigation hat. In der Gastansicht hat sie nichts zu suchen — dort soll das
  // Restaurant den Bildschirm besitzen, nicht die Software. In der Verwaltung
  // stand sie doppelt zur Seitenleiste: zwei Abmelden-Knöpfe, von denen einer
  // nichts tat, und ein Schalter für Hell/Dunkel, der eine Einstellung ist.
  const showTopBar = view === 'waiter';

  // `--ba` trägt die Markenfarbe nur in die Gastansicht. Personal und
  // Verwaltung bekommen die feste Bitely-Farbe (siehe BITELY_ACCENT).
  // Die Marke wird auf einen lesbaren Kontrast gebracht (readableAccent):
  // sonst verschwindet weiße Schrift auf einem beigen Knopf und die
  // Punktezahl in Markenfarbe auf Weiß.
  const accent = view === 'guest'
    ? readableAccent(store.brand.accent, viewDark)
    : BITELY_ACCENT;

  return (
    <div className={viewDark ? 'dark' : ''} style={{ fontFamily: `'${store.brand.font ?? 'Inter'}', system-ui, sans-serif`, '--ba': accent } as React.CSSProperties}>
      {showTopBar && <TopBar dark={dark} setDark={setDark} />}

      {view === 'guest' && branch && (
        // Mobil (der eigentliche Anwendungsfall über QR-Code): randlos, bildschirmfüllend,
        // kein Geräte-Mockup. Ab sm-Breakpoint (Desktop-Vorschau): zentrierte Karte.
        //
        // Genau eine Bildschirmhöhe, hier wie dort, und `overflow-hidden` gilt
        // auf jeder Breite. Vorher stand am Desktop `min-h-[100dvh]` neben
        // `py-8`: die Seite war damit 64 Pixel höher als das Fenster, und dafür
        // legte der Browser eine Rollleiste an den rechten Rand, die nichts zu
        // rollen hatte. Gerollt wird INNERHALB der Karte, das erledigen die
        // Bildschirme selbst.
        <div className="h-[100dvh] overflow-hidden bg-[#F7F8FA] dark:bg-[#0D1117] sm:bg-gray-200 sm:dark:bg-gray-950 flex justify-center sm:py-8 sm:px-4">
          <div className="w-full h-full flex flex-col overflow-hidden sm:w-full sm:max-w-[420px] sm:h-[calc(100dvh-64px)] sm:rounded-[28px] sm:shadow-xl sm:border sm:border-gray-200 dark:sm:border-gray-800 bg-[#F7F8FA] dark:bg-[#0D1117]">
            <GuestApp branch={branch} tableNumber={tableNumber ?? 1} />
          </div>
        </div>
      )}

      {view === 'waiter' && branch && <WaiterApp orgSlug={orgSlug} branch={branch} />}
      {view === 'admin' && (
        <AdminApp orgSlug={orgSlug} branch={branch} canSwitchBranch={canSwitchBranch}
          onPick={onPick} dark={dark} setDark={setDark} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GUTSCHEIN EINLÖSEN (Gast)
//
// Der Wisch entwertet sofort: Punkte weg, Gutschein verbraucht, ohne Frist und
// ohne Rückweg. Danach zeigt der Gast den Code der Servicekraft, die die
// Ausgabe in ihrer App einträgt.
//
// Vorher lief nach dem Wischen ein Countdown über 60 Sekunden, und erst die
// Quittung machte die Einlösung endgültig. Das setzte den Gast unter Zeitdruck
// für etwas, das er nicht in der Hand hat: ob gerade jemand am Tisch vorbeikommt.
// ═══════════════════════════════════════════════════════════


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
    store.authOptions.google ? store.authOptions.googleClientId : null,
    credential => { run(() => store.guestGoogleLogin(credential)); },
    { type: 'icon', shape: 'square', theme: 'outline', size: 'large' },
  );

  const submit = () => run(() => mode === 'login'
    ? store.guestLogin(form.email.trim(), form.password)
    : store.guestRegister(form.email.trim(), form.name.trim(), form.password));

  return (
    <>
      <motion.div className="fixed inset-0 bg-black/50 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl z-50 max-h-[92vh] overflow-y-auto"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
        <div className="p-6 pb-8 flex flex-col items-center gap-4">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />

          <AuthHeader
            title="Punkte sichern"
            subtitle="Deine Punkte hängen an deinem Konto. Damit sind sie auf jedem Gerät da, auch beim nächsten Besuch."
          />

          {/* Google steht ZUERST. Es ist der kürzeste Weg zu einem Konto: kein
              Passwort ausdenken, keins vergessen. Wer lieber tippt, findet das
              Formular direkt darunter. Ohne hinterlegte Client-ID entfällt der
              ganze Block, statt eine tote Reihe zu zeigen. */}
          {store.authOptions.google && (
            <AuthSocialRow placeholders={false} label="Am schnellsten"
              googleSlot={<div ref={googleRef} className="w-12 h-12 flex items-center justify-center overflow-hidden shrink-0" />} />
          )}

          <div className="w-full flex flex-col gap-3">
            {mode === 'register' && (
              <AuthInput icon={User} type="text" placeholder="Dein Name" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            )}
            <AuthInput icon={Mail} type="email" placeholder="E-Mail" autoComplete="email" value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            <AuthPasswordInput value={form.password}
              placeholder={mode === 'login' ? 'Passwort' : 'Passwort (mind. 8 Zeichen)'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
          </div>

          {mode === 'login' && (
            <div className="w-full flex justify-end -mt-1">
              <ForgotPasswordLink />
            </div>
          )}

          {error && <p className="w-full text-[13px] text-red-500 text-center">{error}</p>}

          <AuthPrimaryButton onClick={submit} disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? 'Einen Moment…' : mode === 'login' ? 'Anmelden' : 'Konto anlegen'}
          </AuthPrimaryButton>

          {/* Anmelden und Registrieren sind nicht zwei Angebote, sondern zwei
              Zustände derselben Maske. Deshalb ein Textlink und kein zweiter
              Knopf neben dem ersten. */}
          <button onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(null); }}
            className="w-full min-h-[44px] text-[13px] font-medium rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600">
            {mode === 'login' ? 'Noch kein Konto? Jetzt anlegen' : 'Schon ein Konto? Anmelden'}
          </button>
          <button onClick={onClose}
            className="w-full min-h-[44px] text-[13px] rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600">
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

  // Eine bereits entwertete, aber noch nicht eingetragene Einlösung dieses
  // Gutscheins. Damit lässt sich der Bildschirm wieder aufmachen: der Gast darf
  // ihn schließen, ohne den Code zu verlieren, den er noch vorzeigen muss.
  //
  // `loggedIn` steht bewusst in der Bedingung. Ohne Konto kann es keine EIGENE
  // Einlösung geben — einlösen setzt eines voraus. Was hier ohne Anmeldung
  // auftaucht, gehört also jemand anderem, und darauf zu antworten hieße: der
  // Wisch entfällt, es werden keine Punkte abgebucht, und der Gast sieht ein
  // Häkchen für einen Gutschein, den er nie eingelöst hat.
  //
  // Der Server liefert einem Gast seit dem Umbau ohnehin nur seine eigenen
  // Einlösungen. Die Prüfung bleibt trotzdem, weil es einen Weg gibt, auf dem
  // er sie NICHT als Gast sieht: wer die Verwaltung im selben Browser offen
  // hat und daneben den QR-Code aufruft, hat nur ein Personal-Token — der
  // Server hält ihn dann für Personal und schickt die Einlösungen der ganzen
  // Filiale. Genau so testet man diese App.
  const pending = store.guest.loggedIn
    ? store.redemptions.find(r => r.voucherId === voucher.id && (r.status === 'eingelöst' || r.status === 'entwertet'))
    : undefined;
  const live = started
    ? store.redemptions.find(r => r.id === started.id) ?? started
    : pending ?? null;
  // Der Wisch löst direkt ein — 'entwertet' ist nur noch Altbestand. Beides
  // führt auf denselben Bildschirm: das Zeichen, das der Gast der Servicekraft
  // zeigt.
  const open = live != null && (live.status === 'eingelöst' || live.status === 'entwertet');

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await store.startRedemption(branch.slug, voucher.id, tableNumber);
    if (result.ok) setStarted(result.redemption);
    else setError(result.error);
    setBusy(false);
  };

  return (
    <>
      <motion.div className="fixed inset-0 bg-black/50 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} />
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
              {/* Der Wisch gilt für JEDEN Gutschein, auch für einen ohne
                  Punktepreis. Er ist nicht nur eine Sperre gegen den
                  unabsichtlichen Daumen — er ist der Vorgang, den die
                  Servicekraft am Tisch zu sehen bekommt. Ein Knopf, der
                  lautlos ein Häkchen setzt, sieht aus wie ein Screenshot;
                  die Geste tut das nicht, und genau darum geht es.

                  Kein Erklärtext zur Geste selbst: gewischt wird vor der
                  Servicekraft, und in dem Moment erklärt sie sich. Was sie
                  kostet, steht dagegen dabei — sie ist nicht umkehrbar. */}
              <p className="text-[13px] text-gray-500 dark:text-gray-400 text-center leading-relaxed max-w-[280px] mx-auto">
                {voucher.points > 0
                  ? <>Wischen bucht die {voucher.points} Punkte sofort ab. Erst danach zeigst du ihn der Servicekraft.</>
                  : <>Wischen entwertet den Gutschein sofort. Erst danach zeigst du ihn der Servicekraft.</>}
              </p>
              {error && <p className="text-[13px] text-red-600 dark:text-red-400 text-center">{error}</p>}
              <SwipeToRedeem onRedeem={start} redeemed={busy} />
              <button onClick={onClose} className="w-full text-[13px] py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                Abbrechen
              </button>
            </div>
          )}

          {/* ── Schritt 2: eingelöst — das Zeichen, das die Servicekraft sieht ──
              Der Wisch hat den Gutschein eingelöst und die Punkte abgebucht.
              Ein großes, ruhig pulsierendes Zeichen beantwortet die einzige
              Frage, die am Tisch zählt: hat es geklappt? Der Bildschirm liegt
              womöglich eine Weile, bis jemand vorbeikommt. */}
          {open && live && (
            <div className="space-y-6 text-center">
              <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
                {/* Zwei Ringe, die langsam nach außen laufen: sichtbar, ohne zu
                    blinken — der Bildschirm liegt womöglich eine Weile auf dem
                    Tisch, bis jemand vorbeikommt. */}
                {[0, 1].map(i => (
                  <motion.span key={i} className="absolute rounded-full"
                    style={{ width: 176, height: 176, backgroundColor: 'var(--ba, #16A34A)' }}
                    initial={{ scale: 0.7, opacity: 0.22 }}
                    animate={{ scale: [0.7, 1.05], opacity: [0.22, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, delay: i * 1.2, ease: 'easeOut' }} />
                ))}
                <motion.div className="relative w-28 h-28 rounded-full flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: 'var(--ba, #16A34A)' }}
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 240, damping: 15 }}>
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white"
                    strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <motion.path d="M4 12.5l5 5L20 6.5"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ delay: 0.18, duration: 0.45, ease: 'easeOut' }} />
                  </svg>
                </motion.div>
              </div>

              <div>
                <p className="text-[26px] font-bold tracking-tight text-gray-900 dark:text-white">Eingelöst</p>
                <p className="text-[17px] font-medium mt-1" style={{ color: 'var(--ba, #16A34A)' }}>{live.voucherTitle}</p>
                {live.tableNumber != null && (
                  <p className="text-[13px] text-gray-400 mt-1">Tisch {live.tableNumber}</p>
                )}
                <p className="text-[14px] text-gray-500 dark:text-gray-400 mt-3 leading-relaxed max-w-[280px] mx-auto">
                  {live.points > 0 && <>Die {live.points} Punkte sind abgebucht. </>}
                  Zeig diesen Bildschirm der Servicekraft, sie gibt den Gutschein aus.
                </p>
              </div>

              <button onClick={onClose}
                className="w-full py-3 rounded-xl text-[14px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800">
                Schließen
              </button>
            </div>
          )}

        </div>
      </motion.div>
    </>
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
    <div className="min-h-[calc(100dvh-48px)] flex items-center justify-center p-4 bg-[#F7F8FA] dark:bg-[#0D1117]">
      <div className="w-full max-w-sm">
        <p className="text-[17px] font-semibold text-gray-900 dark:text-white mb-1">Filiale wählen</p>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-4">
          Dein Konto ist an keine Filiale gebunden. Wähle, an welcher du arbeiten möchtest.
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

/**
 * Wegweiser für eine Adresse ohne Tisch — /<org> oder /<org>/<filiale>.
 *
 * Solche Adressen entstehen, wenn jemand den QR-Link von Hand kürzt oder eine
 * Adresse aus dem Verlauf aufruft. Vorher endete das im nackten „Seite nicht
 * gefunden". Ein stiller Redirect auf einen Tisch wäre falsch — welcher Tisch
 * wäre gemeint? Also eine Seite, die sagt, wo man ist, und in jede der drei
 * Ansichten führt.
 */
function OrgLanding({ notFound = false }: { notFound?: boolean }) {
  const { orgSlug, branchSlug } = useParams<{ orgSlug: string; branchSlug?: string }>();
  if (!orgSlug) return <Navigate to="/" replace />;
  return (
    <StoreProvider orgSlug={orgSlug} scope={branchSlug ?? 'self'} audience="guest">
      <LandingChrome orgSlug={orgSlug} branchSlug={branchSlug ?? null} notFound={notFound} />
    </StoreProvider>
  );
}

function LandingChrome({ orgSlug, branchSlug, notFound }: {
  orgSlug: string; branchSlug: string | null; notFound: boolean;
}) {
  const store = useStore();
  useGoogleFont(store.brand?.font);
  useDocumentTitle(store.brand?.name);
  const branch = branchSlug ? store.branches.find(b => b.slug === branchSlug) ?? null : null;

  if (store.loading) return <FullScreenMessage>Lädt…</FullScreenMessage>;
  if (store.connectionLost) return <NetworkErrorPage onRetry={store.refresh} />;

  const links: { to: string; label: string; desc: string; Icon: React.ElementType }[] = [
    ...(branch ? [{
      to: `/${orgSlug}/${branch.slug}/table/1`,
      label: 'Feedback geben',
      desc: `Als Gast an einem Tisch in ${branch.name}. Am Tisch führt der QR-Code direkt zur richtigen Nummer.`,
      Icon: Star,
    }] : []),
    { to: `/${orgSlug}/staff`, label: 'Servicekraft', desc: 'Bestellungen buchen, Tische für neue Gäste freigeben, Gutscheine ausgeben.', Icon: UtensilsCrossed },
    { to: `/${orgSlug}/admin`, label: 'Verwaltung', desc: 'Dashboard, Menü, Gutscheine, Benutzer, Einstellungen.', Icon: LayoutDashboard },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#F7F8FA] dark:bg-[#0D1117] flex items-center justify-center p-6"
      style={{ fontFamily: `'${store.brand?.font ?? 'Inter'}', system-ui, sans-serif`, '--ba': BITELY_ACCENT } as React.CSSProperties}>
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          {store.brand && (
            <div className="flex justify-center mb-4">
              <BrandLogo brand={store.brand} size={56} textSize={52} rounded="rounded-2xl" />
            </div>
          )}
          <p className="text-[22px] font-bold text-gray-900 dark:text-white">{store.brand?.name ?? orgSlug}</p>
          <p className="text-[14px] text-gray-500 dark:text-gray-400 mt-1">
            {notFound
              ? 'Diese Seite gibt es nicht. Hier geht es weiter:'
              : branch ? `${branch.name} · Wohin möchtest du?` : 'Wohin möchtest du?'}
          </p>
        </div>
        <div className="space-y-2.5">
          {links.map(({ to, label, desc, Icon }) => (
            <Link key={to} to={to}
              className="flex items-start gap-3.5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
              <span className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                <Icon size={16} strokeWidth={1.5} className="text-gray-500 dark:text-gray-400" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-gray-900 dark:text-white">{label}</span>
                <span className="block text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Wohin „/" führt.
 *
 * Stand als fester Pfad im Router — der Name genau eines Restaurants,
 * einkompiliert in eine Anwendung, die mandantenfähig ist. Wer sie für ein
 * anderes Lokal betreibt, landete auf der Startseite eines fremden. Jetzt eine
 * Variable zur Buildzeit; ohne sie bleibt es beim bisherigen Ziel, damit die
 * bestehende Netlify-Seite unverändert weiterläuft.
 */
const DEFAULT_ORG_PATH = import.meta.env.VITE_DEFAULT_ORG_PATH ?? '/sakura-sushi/herrengasse';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={DEFAULT_ORG_PATH} replace />} />
        <Route path="/:orgSlug/:branchSlug/table/:tableNumber" element={<OrgShell view="guest" />} />
        <Route path="/:orgSlug/staff" element={<OrgShell view="waiter" />} />
        <Route path="/:orgSlug/admin" element={<OrgShell view="admin" />} />
        {/* Die alte, filiallose QR-Route. Kein Redirect auf einen Tisch: ohne
            Filiale ist nicht entscheidbar, welcher Tisch 5 gemeint ist. Eine
            eigene Meldung, damit ein alter Ausdruck nicht wie ein kaputter
            Server aussieht — mit Weg zurück statt Sackgasse. */}
        <Route path="/:orgSlug/table/:tableNumber" element={
          <FullScreenMessage error action={
            <Link to={DEFAULT_ORG_PATH} className="px-4 py-2 rounded-xl text-white text-[13px]" style={{ backgroundColor: '#16A34A' }}>
              Zur Startseite
            </Link>
          }>
            Dieser QR-Code ist veraltet, er nennt keine Filiale. Bitte verwende den neuen Code am Tisch.
          </FullScreenMessage>
        } />
        {/* Adressen ohne Tisch landen auf dem Wegweiser statt im Nichts. */}
        <Route path="/:orgSlug" element={<OrgLanding />} />
        <Route path="/:orgSlug/:branchSlug" element={<OrgLanding />} />
        <Route path="/:orgSlug/:branchSlug/*" element={<OrgLanding notFound />} />
        <Route path="*" element={
          <FullScreenMessage error action={
            <Link to={DEFAULT_ORG_PATH} className="px-4 py-2 rounded-xl text-white text-[13px]" style={{ backgroundColor: '#16A34A' }}>
              Zur Startseite
            </Link>
          }>
            Seite nicht gefunden.
          </FullScreenMessage>
        } />
      </Routes>
    </BrowserRouter>
  );
}
