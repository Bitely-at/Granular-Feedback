import React, { useState } from 'react';
import {
  ChevronLeft, TrendingUp, TrendingDown, Download, X,
  AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp,
  Plus, ArrowUpDown
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ReferenceLine, Customized
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Dish {
  name: string; sales: number; avg: number; spread: number[];
  outlierPct: number; trend: 1 | 0 | -1; comments: number;
  price: number; db: number; category: string; minReached: boolean;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const DISHES: Dish[] = [
  { name: 'Spicy Tuna Roll', sales: 87, avg: 4.6, spread: [2,3,8,28,46], outlierPct: 6, trend: 1, comments: 14, price: 14.5, db: 6.8, category: 'Rolls', minReached: true },
  { name: 'Dragon Roll', sales: 65, avg: 2.4, spread: [24,18,14,7,2], outlierPct: 64, trend: -1, comments: 31, price: 16.0, db: 7.2, category: 'Rolls', minReached: true },
  { name: 'Miso Suppe', sales: 91, avg: 3.1, spread: [12,19,22,24,14], outlierPct: 34, trend: -1, comments: 22, price: 4.5, db: 3.2, category: 'Suppen', minReached: true },
  { name: 'California Roll', sales: 74, avg: 4.2, spread: [3,5,10,32,24], outlierPct: 11, trend: 0, comments: 8, price: 12.5, db: 5.5, category: 'Rolls', minReached: true },
  { name: 'Lachs Nigiri', sales: 52, avg: 4.8, spread: [1,2,4,14,31], outlierPct: 6, trend: 1, comments: 5, price: 13.0, db: 5.9, category: 'Nigiri', minReached: true },
  { name: 'Wakame Salat', sales: 12, avg: 2.6, spread: [5,3,2,1,1], outlierPct: 67, trend: -1, comments: 7, price: 6.5, db: 4.1, category: 'Beilagen', minReached: false },
  { name: 'Thunfisch Nigiri', sales: 28, avg: 4.7, spread: [0,1,3,8,16], outlierPct: 4, trend: 1, comments: 3, price: 14.0, db: 6.2, category: 'Nigiri', minReached: true },
  { name: 'Edamame', sales: 8, avg: 4.1, spread: [0,1,1,3,3], outlierPct: 13, trend: 0, comments: 1, price: 5.0, db: 3.8, category: 'Beilagen', minReached: false },
];

const MATRIX_DATA = DISHES.filter(d => d.minReached).map(d => ({ name: d.name, x: d.sales, y: d.avg, z: d.db, problem: d.sales > 50 && d.avg < 3.5 }));
const MATRIX_LOW = DISHES.filter(d => !d.minReached);

const KITCHEN_SERVICE = [
  { week: 'KW 28', kitchen: 3.8, service: 4.2 },
  { week: 'KW 29', kitchen: 3.5, service: 4.1 },
  { week: 'KW 30', kitchen: 2.9, service: 4.3 },
  { week: 'KW 31', kitchen: 3.1, service: 3.7 },
  { week: 'KW 32', kitchen: 3.4, service: 4.0 },
];

const DETAIL_HISTORY = [
  { week: 'KW 27', avg: 3.2 }, { week: 'KW 28', avg: 2.8 }, { week: 'KW 29', avg: 2.5 },
  { week: 'KW 30', avg: 2.1 }, { week: 'KW 31', avg: 2.4 }, { week: 'KW 32', avg: 2.4 },
];

const HEATMAP: Record<string, Record<string, number | null>> = {
  'Mo': { 'Mittag': 3.2, 'Nachmittag': null, 'Abend': 2.4 },
  'Di': { 'Mittag': 2.8, 'Nachmittag': 2.6, 'Abend': 2.1 },
  'Mi': { 'Mittag': 3.0, 'Nachmittag': null, 'Abend': 2.3 },
  'Do': { 'Mittag': 2.9, 'Nachmittag': 2.5, 'Abend': 1.9 },
  'Fr': { 'Mittag': null, 'Nachmittag': null, 'Abend': 2.2 },
  'Sa': { 'Mittag': null, 'Nachmittag': null, 'Abend': 2.0 },
  'So': { 'Mittag': null, 'Nachmittag': null, 'Abend': null },
};

const CLUSTERS = [
  { theme: 'zu kalt serviert', count: 7, trend: 1, quotes: [{ text: 'War leider kalt als es ankam.', date: '02.08.' }, { text: 'Hätte wärmer sein können.', date: '31.07.' }] },
  { theme: 'Portion zu klein', count: 4, trend: 0, quotes: [{ text: 'Für den Preis etwas wenig.', date: '01.08.' }] },
  { theme: 'zu salzig', count: 3, trend: -1, quotes: [{ text: 'Sehr intensiv gewürzt.', date: '29.07.' }] },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StarRow({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5 items-center">
      {[1,2,3,4,5].map((s) => (
        <svg key={s} width="11" height="11" viewBox="0 0 24 24"
          fill={s <= Math.round(value) ? '#FB923C' : 'none'}
          stroke={s <= Math.round(value) ? '#FB923C' : '#D1D5DB'} strokeWidth="1.5">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      ))}
      <span className="text-xs text-slate-600 ml-1">{value.toFixed(1)}</span>
    </span>
  );
}

function Sparkline({ spread }: { spread: number[] }) {
  const total = spread.reduce((a, b) => a + b, 0) || 1;
  const colors = ['#e2e8f0','#cbd5e1','#94a3b8','#f59e0b','#d97706'];
  return (
    <div className="flex items-end gap-px h-5 w-16">
      {spread.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(10,(v/total)*100)}%`, backgroundColor: colors[i] }} />
      ))}
    </div>
  );
}

function TrendIcon({ t }: { t: 1 | 0 | -1 }) {
  if (t === 1) return <TrendingUp size={14} strokeWidth={1.5} className="text-emerald-700" />;
  if (t === -1) return <TrendingDown size={14} strokeWidth={1.5} className="text-red-600" />;
  return <span className="text-xs text-slate-400">—</span>;
}

function heatColor(v: number | null): string {
  if (v === null) return '#f8fafc';
  const t = (v - 1) / 4;
  // schlechte Bewertung = amber-100, gute = slate-100
  const from = [254, 243, 199]; // amber-100
  const to   = [241, 245, 249]; // slate-100
  const r = Math.round(from[0] + t * (to[0] - from[0]));
  const g = Math.round(from[1] + t * (to[1] - from[1]));
  const b = Math.round(from[2] + t * (to[2] - from[2]));
  return `rgb(${r},${g},${b})`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function InsightCard({ color, icon: Icon, text, onView }: { color: 'amber'|'emerald'|'slate'; icon: React.ElementType; text: string; onView?: () => void }) {
  const border = { amber: 'border-amber-300 bg-amber-50', emerald: 'border-emerald-300 bg-emerald-50', slate: 'border-slate-300 bg-white' }[color];
  const iconColor = { amber: 'text-amber-500', emerald: 'text-emerald-500', slate: 'text-slate-400' }[color];
  return (
    <div className={`rounded-lg border p-4 flex flex-col gap-3 ${border}`}>
      <div className="flex gap-2 items-start">
        <Icon size={15} strokeWidth={1.5} className={`mt-0.5 flex-shrink-0 ${iconColor}`} />
        <p className="text-sm text-slate-700 leading-snug">{text}</p>
      </div>
      {onView && (
        <button onClick={onView} className="self-start text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2">Ansehen</button>
      )}
    </div>
  );
}

function KpiTile({ label, value, delta, up, highlight, insufficient, needed }: {
  label: string; value?: string; delta?: string; up?: boolean; highlight?: boolean;
  insufficient?: boolean; needed?: number;
}) {
  return (
    <div className={`bg-white rounded-lg border p-4 space-y-1 ${highlight ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
      <p className="text-xs text-slate-500 leading-tight">{label}</p>
      {insufficient ? (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs text-slate-400">Noch {needed} Bewertungen</p>
          <div className="bg-slate-100 rounded-full h-1 overflow-hidden">
            <div className="bg-slate-300 h-full rounded-full" style={{ width: '30%' }} />
          </div>
        </div>
      ) : (
        <div className="flex items-end justify-between gap-2">
          <p className={`text-2xl ${highlight ? 'text-amber-700' : 'text-slate-700'}`}>{value}</p>
          {delta && (
            <span className={`text-xs flex items-center gap-0.5 pb-0.5 ${up ? 'text-emerald-700' : 'text-red-600'}`}>
              {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{delta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface CustomDotProps { cx?: number; cy?: number; payload?: typeof MATRIX_DATA[0]; problem?: boolean; }
function MatrixDot({ cx = 0, cy = 0, payload, problem: propProblem }: CustomDotProps) {
  if (!payload) return null;
  const isProblem = propProblem ?? payload.problem;
  const r = Math.sqrt(payload.z) * 2.8;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={isProblem ? '#f59e0b' : '#94a3b8'} fillOpacity={0.55}
        stroke={isProblem ? '#d97706' : '#64748b'} strokeWidth={1.5} />
    </g>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { onBack: () => void; }

export function AdminDashboard({ onBack }: Props) {
  const [period, setPeriod] = useState<'7 Tage'|'30 Tage'|'Quartal'>('30 Tage');
  const [sortCol, setSortCol] = useState<keyof Dish>('sales');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [detailDish, setDetailDish] = useState<Dish | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [dbEditing, setDbEditing] = useState<string | null>(null);
  const [dbValues, setDbValues] = useState<Record<string, number>>(Object.fromEntries(DISHES.map(d => [d.name, d.db])));

  const sorted = [...DISHES].sort((a, b) => {
    const av = a[sortCol] as number, bv = b[sortCol] as number;
    return sortAsc ? av - bv : bv - av;
  });

  const toggleSort = (col: keyof Dish) => { if (sortCol === col) setSortAsc(p => !p); else { setSortCol(col); setSortAsc(false); } };


  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors flex-shrink-0">
            <ChevronLeft size={16} strokeWidth={1.5} /> Zurück
          </button>
          <span className="text-base text-slate-800 flex-1 min-w-0 truncate">Sakura Sushi</span>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg">
              {(['7 Tage','30 Tage','Quartal'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${period === p ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {p}
                </button>
              ))}
            </div>
            <button onClick={() => setShowExport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
              <Download size={14} strokeWidth={1.5} /> Export
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">

        {/* ── Action bar ── */}
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Handlungsbedarf</p>
          <div className="grid grid-cols-3 gap-4">
            <InsightCard color="amber" icon={AlertTriangle}
              text="Dragon Roll — 4 Bewertungen unter 3 diese Woche, alle zwischen 19 und 21 Uhr"
              onView={() => setDetailDish(DISHES.find(d => d.name === 'Dragon Roll') ?? null)} />
            <InsightCard color="emerald" icon={CheckCircle2}
              text="Lachs Nigiri wird stark bewertet, aber selten bestellt — überleg einen Promotion-Preis"
              onView={() => setDetailDish(DISHES.find(d => d.name === 'Lachs Nigiri') ?? null)} />
            <InsightCard color="slate" icon={Info}
              text="Seit dem Preiswechsel am 12.7. fällt die Bewertung der Miso Suppe kontinuierlich" />
          </div>
        </div>

        {/* ── KPI row ── */}
        <div className="grid grid-cols-6 gap-3">
          <KpiTile label="Bewertungen" value="247" delta="+18 %" up />
          <KpiTile label="Ø Bewertung" value="3.8" delta="+0.2" up />
          <KpiTile label="Ausreißerquote ≤ 2 ★" value="22 %" delta="+4 %" up={false} highlight />
          <KpiTile label="Scan-Rate" value="68 %" delta="−4 %" up={false} />
          <KpiTile label="Ausgegebene Gutscheine" value="89" delta="+12" up />
          <KpiTile label="Einlösequote" insufficient needed={12} />
        </div>

        {/* ── Menu Matrix + Kitchen/Service ── */}
        <div className="grid grid-cols-3 gap-4">
          {/* Matrix — 2/3 width */}
          <div className="col-span-2 bg-white rounded-lg border border-slate-200 p-5">
            <p className="text-sm text-slate-800 mb-0.5">Menü-Matrix</p>
            <p className="text-xs text-slate-400 mb-4">X = Verkäufe · Y = Ø Bewertung · Punktgröße = Deckungsbeitrag</p>
            <div className="relative" style={{ height: 460 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 24, right: 24, bottom: 24, left: 0 }}>
                  <XAxis dataKey="x" type="number" domain={[0, 110]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} label={{ value: 'Verkäufe', position: 'insideBottom', offset: -12, style: { fontSize: 11, fill: '#64748b' } }} />
                  <YAxis dataKey="y" type="number" domain={[1, 5]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} label={{ value: 'Ø Bewertung', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 11, fill: '#64748b' } }} />
                  <Tooltip content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload;
                    const dish = DISHES.find(x => x.name === d.name);
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-md text-xs space-y-1 min-w-[160px]">
                        <p className="text-slate-800 font-medium">{d.name}</p>
                        <p className="text-slate-500">Verkäufe: {d.x}</p>
                        <p className="text-slate-500">Ø Bewertung: {d.y}</p>
                        {dish && <p className="text-slate-500">Ausreißer: {dish.outlierPct} %</p>}
                        <p className="text-slate-500">Deckungsbeitrag: {d.z} €</p>
                      </div>
                    );
                  }} />
                  <ReferenceLine x={50} stroke="#e2e8f0" strokeDasharray="4 4" />
                  <ReferenceLine y={3.5} stroke="#e2e8f0" strokeDasharray="4 4" />
                  <Scatter data={MATRIX_DATA} shape={(p: any) => <MatrixDot {...p} problem={p.problem} />} />
                  <Customized component={({ xAxisMap, yAxisMap }: any) => {
                    const xAxis = Object.values(xAxisMap)[0] as any;
                    const yAxis = Object.values(yAxisMap)[0] as any;
                    if (!xAxis?.scale || !yAxis?.scale) return null;
                    const midX = xAxis.scale(50);
                    const midY = yAxis.scale(3.5);
                    const top = yAxis.y;
                    const bottom = yAxis.y + yAxis.height;
                    return (
                      <g style={{ pointerEvents: 'none' }}>
                        <rect x={midX} y={midY} width={xAxis.x + xAxis.width - midX} height={bottom - midY} fill="rgba(251,191,36,0.07)" />
                        <text x={xAxis.x + 6} y={top + 13} textAnchor="start" fontSize={11} fill="#94a3b8">Verkannt</text>
                        <text x={xAxis.x + xAxis.width - 6} y={top + 13} textAnchor="end" fontSize={11} fill="#94a3b8">Zugpferde</text>
                        <text x={xAxis.x + 6} y={bottom - 6} textAnchor="start" fontSize={11} fill="#94a3b8">Streichkandidaten</text>
                        <text x={xAxis.x + xAxis.width - 6} y={bottom - 6} textAnchor="end" fontSize={11} fill="#b45309" fontWeight={600}>Problemfälle</text>
                      </g>
                    );
                  }} />
                </ScatterChart>
              </ResponsiveContainer>
              {MATRIX_LOW.length > 0 && (
                <p className="absolute bottom-0 left-0 text-xs text-slate-400">{MATRIX_LOW.length} Gerichte noch ohne Auswertung</p>
              )}
            </div>
          </div>

          {/* Kitchen vs Service — 1/3 width */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <p className="text-sm text-slate-800 mb-0.5">Küche vs. Service</p>
            <p className="text-xs text-slate-400 mb-4">Durchschnittsbewertung je Woche</p>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={KITCHEN_SERVICE} margin={{ top: 16, right: 40, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 0" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[1, 5]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={24} />
                  <Line type="monotone" dataKey="kitchen" stroke="#64748b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="service" stroke="#cbd5e1" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-5 h-0.5 bg-slate-500" /><span className="text-xs text-slate-500">Küche</span></div>
              <div className="flex items-center gap-1.5"><div className="w-5 h-0.5 bg-slate-300" style={{ borderTop: '2px dashed #cbd5e1', background: 'none' }} /><span className="text-xs text-slate-400">Service</span></div>
            </div>
          </div>
        </div>

        {/* ── Dish table ── */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm text-slate-800">Gerichtsübersicht</p>
            <span className="text-xs text-slate-400">{DISHES.length} Gerichte</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {([
                    { label: 'Gericht', col: 'name' },
                    { label: 'Verkäufe', col: 'sales' },
                    { label: 'Ø Bewertung', col: 'avg' },
                    { label: 'Streuung', col: null },
                    { label: 'Ausreißer', col: 'outlierPct' },
                    { label: 'Trend', col: 'trend' },
                    { label: 'Kommentare', col: 'comments' },
                    { label: 'Preis', col: 'price' },
                    { label: 'Deckungsbeitrag', col: 'db' },
                  ] as { label: string; col: keyof Dish | null }[]).map(({ label, col }) => (
                    <th key={label} className="text-left px-4 py-2.5">
                      <button onClick={() => col && toggleSort(col)} disabled={!col}
                        className={`flex items-center gap-1 text-xs font-normal ${col ? 'text-slate-500 hover:text-slate-800 transition-colors' : 'text-slate-400 cursor-default'}`}>
                        {label}
                        {col && <ArrowUpDown size={11} className="opacity-40" />}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((dish) => (
                  <React.Fragment key={dish.name}>
                    <tr
                      onClick={() => setExpandedRow(expandedRow === dish.name ? null : dish.name)}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-700">{dish.name}</span>
                          {!dish.minReached && <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Wenig Daten</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{dish.sales}</td>
                      <td className="px-4 py-3">
                        {dish.minReached ? <StarRow value={dish.avg} /> : (
                          <div className="space-y-1">
                            <p className="text-xs text-slate-400">Noch {30 - dish.sales}</p>
                            <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-slate-300 rounded-full" style={{ width: `${(dish.sales / 30) * 100}%` }} />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">{dish.minReached ? <Sparkline spread={dish.spread} /> : <span className="text-xs text-slate-300">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${dish.outlierPct > 50 ? 'text-red-500' : dish.outlierPct > 30 ? 'text-amber-600' : 'text-slate-600'}`}>
                          {dish.minReached ? `${dish.outlierPct} %` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3"><TrendIcon t={dish.trend} /></td>
                      <td className="px-4 py-3 text-sm text-slate-600">{dish.comments}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{dish.price.toFixed(2)} €</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {dbEditing === dish.name ? (
                          <input
                            autoFocus
                            type="number"
                            value={dbValues[dish.name]}
                            onChange={(e) => setDbValues(p => ({ ...p, [dish.name]: +e.target.value }))}
                            onBlur={() => setDbEditing(null)}
                            className="w-16 text-sm border-b border-slate-400 outline-none bg-transparent text-slate-700"
                          />
                        ) : (
                          <button onClick={() => setDbEditing(dish.name)}
                            className="text-sm text-slate-600 hover:text-slate-900 hover:underline underline-offset-2 transition-colors">
                            {dbValues[dish.name].toFixed(2)} €
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedRow === dish.name && (
                      <tr>
                        <td colSpan={9} className="bg-slate-50 px-6 py-4">
                          <button onClick={() => setDetailDish(dish)}
                            className="text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors">
                            Vollständige Detailansicht öffnen →
                          </button>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ── Detail Slide-over ── */}
      {detailDish && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDetailDish(null)} />
          <div className="relative bg-white w-full max-w-2xl h-full overflow-y-auto shadow-xl flex flex-col">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between z-10">
              <div>
                <p className="text-base text-slate-800">{detailDish.name}</p>
                <div className="flex items-center gap-3 mt-1">
                  <StarRow value={detailDish.avg} />
                  <span className="text-xs text-slate-400">{detailDish.sales} Bewertungen · {detailDish.price.toFixed(2)} €</span>
                </div>
              </div>
              <button onClick={() => setDetailDish(null)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
                <X size={18} strokeWidth={1.5} className="text-slate-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-8">
              {/* Distribution */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Verteilung</p>
                <div className="space-y-2">
                  {[5,4,3,2,1].map((star, i) => {
                    const v = detailDish.spread[star-1];
                    const total = detailDish.spread.reduce((a,b)=>a+b,0);
                    const pct = total ? Math.round((v/total)*100) : 0;
                    return (
                      <div key={star} className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 w-4 text-right">{star}★</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 w-10 text-right">{v} ({pct} %)</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-400 uppercase tracking-widest">Bewertungsverlauf</p>
                  <button className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors border border-slate-200 rounded-md px-2 py-1">
                    <Plus size={11} /> Ereignis eintragen
                  </button>
                </div>
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={DETAIL_HISTORY} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 0" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[1,5]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={24} />
                      <Line type="monotone" dataKey="avg" stroke="#64748b" strokeWidth={2} dot={{ r: 3, fill: '#64748b' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Heatmap */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Nach Tageszeit</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-slate-400 font-normal text-left pb-2 w-8"></th>
                        {['Mittag','Nachmittag','Abend'].map(t => (
                          <th key={t} className="text-slate-400 font-normal pb-2 text-center">{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(HEATMAP).map(([day, slots]) => (
                        <tr key={day}>
                          <td className="text-slate-400 pr-3 py-1">{day}</td>
                          {['Mittag','Nachmittag','Abend'].map(t => {
                            const v = slots[t];
                            return (
                              <td key={t} className="py-1 px-1">
                                <div className="rounded h-8 flex items-center justify-center" style={{ background: heatColor(v) }}>
                                  <span className={`${v !== null ? 'text-slate-700' : 'text-slate-300'}`}>
                                    {v !== null ? v.toFixed(1) : '—'}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-slate-400 mt-1.5">Hell = gut bewertet · Amber = schlechte Bewertungen</p>
                </div>
              </div>

              {/* Comment clusters */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Gästefeedback</p>
                <div className="space-y-2">
                  {CLUSTERS.map((c) => (
                    <div key={c.theme} className="border border-slate-200 rounded-lg overflow-hidden">
                      <button onClick={() => setExpandedCluster(expandedCluster === c.theme ? null : c.theme)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2">
                          <TrendIcon t={c.trend as 1|0|-1} />
                          <span className="text-sm text-slate-700">{c.theme}</span>
                          <span className="text-xs text-slate-400">{c.count} Nennungen</span>
                        </div>
                        {expandedCluster === c.theme ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      </button>
                      {expandedCluster === c.theme && (
                        <div className="border-t border-slate-100 px-4 py-3 bg-white space-y-2">
                          {c.quotes.map((q, i) => (
                            <div key={i} className="flex justify-between gap-2">
                              <p className="text-sm text-slate-500 italic">„{q.text}"</p>
                              <span className="text-xs text-slate-400 flex-shrink-0">{q.date}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── Export Dialog ── */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowExport(false)} />
          <div className="relative bg-white rounded-lg border border-slate-200 w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-base text-slate-800">Export</p>
              <button onClick={() => setShowExport(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <X size={16} strokeWidth={1.5} className="text-slate-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-2">Format</p>
                <div className="grid grid-cols-2 gap-2">
                  {['CSV Rohdaten','CSV Aggregat','XLSX','PDF-Bericht'].map(f => (
                    <button key={f} className="px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:border-slate-400 transition-colors text-left">{f}</button>
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-0.5" />
                <div>
                  <p className="text-sm text-slate-700">Freitextkommentare einschließen</p>
                  <p className="text-xs text-slate-400 mt-0.5">Kommentare können personenbezogene Angaben enthalten.</p>
                </div>
              </label>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-700 mb-1">Automatischer Monatsbericht</p>
                <p className="text-xs text-slate-500 mb-3">Jeden Monatsersten automatisch per E-Mail — wichtiger als der manuelle Export.</p>
                <input placeholder="E-Mail-Adresse eintragen" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400 transition-colors" />
              </div>
              <button className="w-full py-2.5 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-900 transition-colors">
                Exportieren
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
