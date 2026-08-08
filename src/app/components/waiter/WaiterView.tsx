import { useState } from 'react';
import { Search, Plus, Minus, Check, X, Camera, AlertTriangle, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type TableStatus = 'empty' | 'open' | 'rated' | 'alert';

interface Table {
  id: number;
  status: TableStatus;
  dishes: number;
  minutes: number;
  alertDish?: string;
  alertStars?: number;
}

const MENU_ITEMS = [
  { cat: 'Häufig heute', items: ['Lachs Nigiri', 'California Roll', 'Miso Suppe', 'Spicy Tuna Roll'] },
  { cat: 'Nigiri', items: ['Lachs Nigiri', 'Thunfisch Nigiri', 'Garnelen Nigiri', 'Makrele Nigiri'] },
  { cat: 'Maki & Rolls', items: ['Spicy Tuna Roll', 'California Roll', 'Dragon Roll', 'Veggie Roll'] },
  { cat: 'Suppen', items: ['Miso Suppe', 'Edamame', 'Gyoza (6 Stück)'] },
];

const INITIAL_TABLES: Table[] = [
  { id: 1, status: 'empty', dishes: 0, minutes: 0 },
  { id: 2, status: 'open', dishes: 3, minutes: 12 },
  { id: 3, status: 'rated', dishes: 4, minutes: 45 },
  { id: 4, status: 'alert', dishes: 3, minutes: 28, alertDish: 'Dragon Roll', alertStars: 2 },
  { id: 5, status: 'open', dishes: 2, minutes: 7 },
  { id: 6, status: 'empty', dishes: 0, minutes: 0 },
  { id: 7, status: 'open', dishes: 5, minutes: 33 },
  { id: 8, status: 'rated', dishes: 2, minutes: 60 },
  { id: 9, status: 'empty', dishes: 0, minutes: 0 },
];

// WCAG AA: all foreground/background pairs verified ≥ 4.5:1
const statusColor: Record<TableStatus, string> = {
  empty:  'bg-slate-50  text-slate-500  border-slate-200',
  open:   'bg-blue-50   text-blue-700   border-blue-200',
  rated:  'bg-green-50  text-green-700  border-green-200',
  alert:  'bg-amber-50  text-amber-800  border-amber-300',
};

const statusLabel: Record<TableStatus, string> = {
  empty:  '',
  open:   'Offen',
  rated:  'Bewertet',
  alert:  'Prüfen',
};

interface Props { onBack: () => void; }

export function WaiterView({ onBack }: Props) {
  const [tables, setTables] = useState<Table[]>(INITIAL_TABLES);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherResult, setVoucherResult] = useState<'valid' | 'invalid' | null>(null);
  const [tab, setTab] = useState<'tables' | 'voucher'>('tables');
  const [alertDismissed, setAlertDismissed] = useState(false);

  const alertTable = tables.find((t) => t.status === 'alert');

  const adjust = (item: string, delta: number) =>
    setCart((p) => { const n = (p[item] ?? 0) + delta; return n <= 0 ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== item)) : { ...p, [item]: n }; });

  const saveTable = () => {
    if (selected === null) return;
    setTables((p) => p.map((t) => t.id === selected ? { ...t, status: 'open', dishes: Object.values(cart).reduce((a, b) => a + b, 0), minutes: 0 } : t));
    setSelected(null); setCart({});
  };

  const checkVoucher = () => setVoucherResult(voucherCode.toUpperCase() === 'SUSHI10' ? 'valid' : 'invalid');

  const allItems = MENU_ITEMS.flatMap((c) => c.items);
  const filtered = query.trim() ? [...new Set(allItems.filter((i) => i.toLowerCase().includes(query.toLowerCase())))] : null;
  const cartTotal = Object.values(cart).reduce((a, b) => a + b, 0);

  if (selected !== null) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="bg-white border-b border-slate-200 p-4 flex items-center gap-3">
          <button onClick={() => { setSelected(null); setCart({}); }} className="p-2 rounded-full hover:bg-slate-100"><ChevronLeft size={20} strokeWidth={1.5} /></button>
          <span className="text-base text-slate-800">Tisch {selected}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
          <div className="relative">
            <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Gericht suchen…"
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none" />
          </div>

          {(filtered ? [{ cat: 'Suchergebnis', items: filtered }] : MENU_ITEMS).map((cat) => (
            <div key={cat.cat}>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">{cat.cat}</p>
              <div className="space-y-1">
                {[...new Set(cat.items)].map((item) => (
                  <div key={item} className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-4 py-3">
                    <span className="text-sm text-slate-700">{item}</span>
                    <div className="flex items-center gap-3">
                      {cart[item] ? (
                        <>
                          <button onClick={() => adjust(item, -1)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"><Minus size={14} /></button>
                          <span className="text-sm text-slate-800 w-4 text-center">{cart[item]}</span>
                          <button onClick={() => adjust(item, 1)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-white hover:bg-slate-900"><Plus size={14} /></button>
                        </>
                      ) : (
                        <button onClick={() => adjust(item, 1)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"><Plus size={14} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4">
          <button onClick={saveTable} disabled={cartTotal === 0}
            className={`w-full py-3 rounded-lg text-sm transition-colors ${cartTotal > 0 ? 'bg-slate-800 text-white hover:bg-slate-900' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
            {cartTotal > 0 ? `Tisch speichern · ${cartTotal} Gericht${cartTotal > 1 ? 'e' : ''}` : 'Gerichte auswählen'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Alert Banner */}
      <AnimatePresence>
        {alertTable && !alertDismissed && (
          <motion.div initial={{ y: -60 }} animate={{ y: 0 }} exit={{ y: -60 }}
            className="bg-amber-400 px-4 py-3 flex items-center gap-3 z-50">
            <AlertTriangle size={18} strokeWidth={1.5} className="text-amber-900 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-900">
                <strong>Tisch {alertTable.id}</strong> · {alertTable.alertDish} · {'★'.repeat(alertTable.alertStars ?? 0)}
              </p>
            </div>
            <button onClick={() => setAlertDismissed(true)} className="text-amber-900 hover:text-amber-700 p-1"><X size={16} /></button>
            <button className="text-xs text-amber-900 underline shrink-0">Ansehen</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1">
          <ChevronLeft size={16} strokeWidth={1.5} /> Zurück
        </button>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {(['tables', 'voucher'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs transition-colors ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
              {t === 'tables' ? 'Tische' : 'Gutschein'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'tables' && (
        <div className="p-4">
          <div className="grid grid-cols-3 gap-3">
            {tables.map((table) => (
              <button key={table.id} onClick={() => { setSelected(table.id); setCart({}); }}
                className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center p-2 transition-all active:scale-95 ${statusColor[table.status]}`}>
                <span className="text-lg font-medium">{table.id}</span>
                {table.status !== 'empty' ? (
                  <>
                    <span className="text-[10px] font-medium mt-0.5 uppercase tracking-wide opacity-70">{statusLabel[table.status]}</span>
                    <span className="text-xs">{table.dishes} Ger.</span>
                    <span className="text-xs opacity-60">{table.minutes} Min</span>
                  </>
                ) : (
                  <span className="text-[10px] text-slate-400 mt-0.5">—</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-4 mt-4 flex-wrap">
            {([
              ['empty',  'Leer',      'bg-slate-50  border-slate-200'],
              ['open',   'Offen',     'bg-blue-50   border-blue-200'],
              ['rated',  'Bewertet',  'bg-green-50  border-green-200'],
              ['alert',  'Alarm',     'bg-amber-50  border-amber-300'],
            ] as const).map(([, l, cls]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm border ${cls}`} />
                <span className="text-xs text-slate-500">{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'voucher' && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <p className="text-sm text-slate-600">Gutschein-Code prüfen</p>
            <div className="flex gap-2">
              <input value={voucherCode} onChange={(e) => { setVoucherCode(e.target.value); setVoucherResult(null); }}
                placeholder="Code eingeben…" className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
              <button className="w-11 h-11 flex items-center justify-center border border-slate-200 rounded-lg hover:bg-slate-50">
                <Camera size={18} strokeWidth={1.5} className="text-slate-600" />
              </button>
              <button onClick={checkVoucher} className="px-4 py-2.5 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-900">Prüfen</button>
            </div>

            {voucherResult && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg p-4 flex items-center gap-3 ${voucherResult === 'valid' ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
                {voucherResult === 'valid'
                  ? <Check size={20} strokeWidth={1.5} className="text-emerald-600 shrink-0" />
                  : <X size={20} strokeWidth={1.5} className="text-rose-500 shrink-0" />}
                <div>
                  <p className={`text-sm ${voucherResult === 'valid' ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {voucherResult === 'valid' ? 'Gültig — 10 % Rabatt' : 'Ungültig — Gutschein nicht gefunden'}
                  </p>
                  {voucherResult === 'invalid' && <p className="text-xs text-rose-400 mt-0.5">Code prüfen oder Gast ansprechen.</p>}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
