import { useState } from 'react';
import { Search, X, ChevronLeft } from 'lucide-react';
import { DISH_IMAGES } from '../../App';

const MENU = [
  { category: 'Nigiri', items: ['Lachs Nigiri', 'Thunfisch Nigiri', 'Garnelen Nigiri', 'Makrele Nigiri'] },
  { category: 'Maki & Rolls', items: ['Spicy Tuna Roll', 'California Roll', 'Dragon Roll', 'Veggie Roll', 'Rainbow Roll'] },
  { category: 'Suppen & Beilagen', items: ['Miso Suppe', 'Edamame', 'Gyoza (6 Stück)', 'Wakame Salat'] },
  { category: 'Sashimi', items: ['Lachs Sashimi', 'Thunfisch Sashimi', 'Hamachi Sashimi'] },
];

const FREQUENT = ['Lachs Nigiri', 'California Roll', 'Miso Suppe', 'Spicy Tuna Roll'];

interface Props {
  onBack: () => void;
  onConfirm: (dishes: string[]) => void;
}

function DishImage({ name }: { name: string }) {
  const src = DISH_IMAGES[name] ?? DISH_IMAGES['_fallback'];
  return <img src={src} alt={name} className="w-8 h-8 rounded-md object-cover flex-shrink-0" />;
}

export function DishSelector({ onBack, onConfirm }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (item: string) =>
    setSelected((p) => (p.includes(item) ? p.filter((x) => x !== item) : [...p, item]));

  const filtered = query.trim()
    ? [...new Set(MENU.flatMap((c) => c.items).filter((i) => i.toLowerCase().includes(query.toLowerCase())))]
    : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors -ml-2" aria-label="Zurück">
          <ChevronLeft size={20} strokeWidth={1.5} className="text-slate-600" />
        </button>
        <div>
          <p className="text-base text-slate-800">Was hast du bestellt?</p>
          <p className="text-xs text-slate-500">Tisch 4 · mehrere Gerichte möglich</p>
        </div>
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="bg-white border-b border-slate-100 px-4 py-3 flex flex-wrap gap-2">
          {selected.map((item) => (
            <button key={item} onClick={() => toggle(item)}
              className="flex items-center gap-1.5 pl-2 pr-3 py-1.5 bg-slate-800 text-white text-xs rounded-full min-h-[36px]">
              <DishImage name={item} />
              <span>{item}</span>
              <X size={12} className="ml-0.5 opacity-70" />
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 h-11">
          <Search size={16} strokeWidth={1.5} className="text-slate-400 flex-shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Gericht suchen…"
            className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 h-full" />
          {query && (
            <button onClick={() => setQuery('')} className="p-1"><X size={14} className="text-slate-400" /></button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5 pb-28">
        {filtered ? (
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Suchergebnis</p>
            <div className="space-y-1">
              {filtered.map((item) => <DishRow key={item} item={item} selected={selected.includes(item)} onToggle={() => toggle(item)} />)}
            </div>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Heute häufig bestellt</p>
              <div className="space-y-1">
                {FREQUENT.map((item) => <DishRow key={item} item={item} selected={selected.includes(item)} onToggle={() => toggle(item)} />)}
              </div>
            </div>
            {MENU.map((cat) => (
              <div key={cat.category}>
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">{cat.category}</p>
                <div className="space-y-1">
                  {cat.items.map((item) => <DishRow key={item} item={item} selected={selected.includes(item)} onToggle={() => toggle(item)} />)}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4">
        <button disabled={selected.length === 0} onClick={() => onConfirm(selected)}
          className={`w-full py-3 rounded-lg text-sm transition-colors min-h-[48px] ${selected.length > 0 ? 'bg-slate-800 text-white hover:bg-slate-900 active:scale-[0.98]' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
          {selected.length > 0 ? `${selected.length} Gericht${selected.length > 1 ? 'e' : ''} bewerten` : 'Gerichte auswählen'}
        </button>
      </div>
    </div>
  );
}

function DishRow({ item, selected, onToggle }: { item: string; selected: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors min-h-[52px] ${selected ? 'bg-slate-800' : 'bg-white border border-slate-200 hover:border-slate-300'}`}>
      <DishImage name={item} />
      <span className={`text-sm flex-1 ${selected ? 'text-white' : 'text-slate-700'}`}>{item}</span>
      {selected && <X size={16} className="text-white/70 flex-shrink-0" />}
    </button>
  );
}
