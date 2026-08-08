import { useState, useRef, useEffect } from 'react';
import { Star, Minus, ChevronLeft } from 'lucide-react';
import { RatingRow, DISH_IMAGES } from '../App';

interface Props {
  tableNumber: number;
  restaurantName: string;
  onRestaurantNameChange: (name: string) => void;
  rows: RatingRow[];
  onRate: (id: string, rating: number) => void;
  onSkip: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  allDone: boolean;
}

function InlineStars({ rating, onChange }: { rating: number; onChange: (r: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hovered || rating);
        return (
          <button key={star} onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)} onMouseLeave={() => setHovered(0)}
            className="w-11 h-11 flex items-center justify-center transition-transform active:scale-90"
            aria-label={`${star} Stern${star > 1 ? 'e' : ''}`}>
            <Star size={26} fill={filled ? '#FB923C' : 'none'} stroke={filled ? '#FB923C' : '#D1D5DB'} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

function RowItem({ row, onRate, onSkip, onComment }: {
  row: RatingRow; onRate: (r: number) => void; onSkip: () => void; onComment: (c: string) => void;
}) {
  const showComment = !row.skipped && row.rating > 0 && row.rating <= 3;
  const isService = row.id === 'service';
  const img = isService ? null : (DISH_IMAGES[row.label] ?? DISH_IMAGES['_fallback']);

  return (
    <div className={`transition-opacity duration-200 ${row.skipped ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-2 py-2">
        {img && (
          <img src={img} alt={row.label} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
        )}
        {!img && <div className="w-10 h-10 flex-shrink-0" />}
        <span className={`text-sm flex-1 min-w-0 truncate ${isService ? 'text-slate-500' : 'text-slate-800'}`}>
          {row.label}
        </span>
        {row.skipped ? (
          <span className="text-xs text-slate-400 italic px-2">Hatte ich nicht</span>
        ) : (
          <InlineStars rating={row.rating} onChange={onRate} />
        )}
        <button
          onClick={row.skipped ? () => onRate(0) : onSkip}
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors flex-shrink-0"
          aria-label={row.skipped ? 'Rückgängig' : 'Hatte ich nicht'}>
          <Minus size={15} strokeWidth={1.5} className={row.skipped ? 'text-slate-600' : 'text-slate-300'} />
        </button>
      </div>
      {showComment && (
        <div className="ml-12 pb-2">
          <textarea value={row.comment} onChange={(e) => onComment(e.target.value)}
            placeholder="Was war nicht gut? (optional)" rows={2}
            className="w-full text-sm text-slate-700 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none resize-none focus:border-slate-400 transition-colors" />
        </div>
      )}
    </div>
  );
}

export function TableRatingScreen({ tableNumber, restaurantName, onRestaurantNameChange, rows, onRate, onSkip, onComment, onSubmit, onBack, allDone }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(restaurantName);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isEditing) inputRef.current?.focus(); }, [isEditing]);
  const commit = () => { const v = draft.trim() || restaurantName; onRestaurantNameChange(v); setDraft(v); setIsEditing(false); };

  const rated = rows.filter((r) => !r.skipped && r.rating > 0).length;
  const total = rows.length;
  const progress = (rows.filter((r) => r.skipped || r.rating > 0).length / total) * 100;

  const dishRows = rows.filter((r) => r.id !== 'service');
  const serviceRow = rows.find((r) => r.id === 'service');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors -ml-2" aria-label="Zurück">
            <ChevronLeft size={20} strokeWidth={1.5} className="text-slate-600" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 group">
              {isEditing ? (
                <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(restaurantName); setIsEditing(false); } }}
                  className="text-sm text-slate-800 border-b border-slate-400 outline-none bg-transparent w-36" />
              ) : (
                <button onClick={() => { setDraft(restaurantName); setIsEditing(true); }} className="text-sm text-slate-800 hover:text-slate-600 transition-colors">
                  {restaurantName}
                </button>
              )}
              {!isEditing && (
                <svg onClick={() => { setDraft(restaurantName); setIsEditing(true); }}
                  className="w-3 h-3 text-slate-300 group-hover:text-slate-400 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
                </svg>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Tisch {tableNumber}</p>
          </div>
          <span className="text-xs text-slate-400">{rated}/{total}</span>
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-slate-100">
          <div className="h-full bg-slate-700 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-2">
          <p className="text-sm text-slate-500 mb-3">Wie hat es dir geschmeckt? Mit „–" überspringen.</p>
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100">
            {dishRows.map((row) => (
              <div key={row.id} className="px-4">
                <RowItem row={row} onRate={(r) => onRate(row.id, r)} onSkip={() => onSkip(row.id)} onComment={(c) => onComment(row.id, c)} />
              </div>
            ))}
            {serviceRow && (
              <div className="px-4 border-t border-slate-200">
                <RowItem row={serviceRow} onRate={(r) => onRate(serviceRow.id, r)} onSkip={() => onSkip(serviceRow.id)} onComment={(c) => onComment(serviceRow.id, c)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-slate-200 p-4 space-y-2 max-w-lg mx-auto w-full">
        <p className="text-center text-xs text-slate-400">Deinen Gutschein bekommst du unabhängig von deiner Bewertung.</p>
        <button onClick={onSubmit} disabled={!allDone}
          className={`w-full py-3 rounded-lg text-sm transition-colors min-h-[48px] ${allDone ? 'bg-slate-800 text-white hover:bg-slate-900 active:scale-[0.98]' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
          Absenden & Gutschein sichern
        </button>
        {!allDone && <p className="text-center text-xs text-slate-400">Bitte alle Felder ausfüllen oder mit „–" überspringen.</p>}
      </div>
    </div>
  );
}
