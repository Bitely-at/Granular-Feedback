import { useState, useRef, useEffect } from 'react';
import { StarRating } from './StarRating';
import { TagSelector } from './TagSelector';

interface Dish {
  name: string;
  rating: number;
  tags: string[];
}

interface RatingScreenProps {
  tableNumber: number;
  currentDishIndex: number;
  dishes: Dish[];
  restaurantName: string;
  onRestaurantNameChange: (name: string) => void;
  onRatingChange: (rating: number) => void;
  onTagToggle: (tag: string) => void;
  onNext: () => void;
}

export function RatingScreen({
  tableNumber,
  currentDishIndex,
  dishes,
  restaurantName,
  onRestaurantNameChange,
  onRatingChange,
  onTagToggle,
  onNext,
}: RatingScreenProps) {
  const currentDish = dishes[currentDishIndex];
  const isLastDish = currentDishIndex === dishes.length - 1;
  const progress = ((currentDishIndex + 1) / dishes.length) * 100;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(restaurantName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const commitEdit = () => {
    const trimmed = draft.trim();
    onRestaurantNameChange(trimmed || restaurantName);
    setDraft(trimmed || restaurantName);
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-lg border border-slate-300 overflow-hidden">
        {/* Header */}
        <div className="border-b border-black p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 group">
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') {
                      setDraft(restaurantName);
                      setIsEditing(false);
                    }
                  }}
                  className="text-base text-slate-900 border-b border-slate-400 outline-none bg-transparent w-40"
                />
              ) : (
                <button
                  onClick={() => { setDraft(restaurantName); setIsEditing(true); }}
                  className="text-base text-slate-900 hover:text-slate-600 transition-colors text-left"
                  title="Restaurantname bearbeiten"
                >
                  {restaurantName}
                </button>
              )}
              {!isEditing && (
                <svg
                  onClick={() => { setDraft(restaurantName); setIsEditing(true); }}
                  className="w-3 h-3 text-slate-300 group-hover:text-slate-400 cursor-pointer transition-colors flex-shrink-0"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
                </svg>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 mb-0.5">Tisch {tableNumber}</div>
              <div className="text-xs text-slate-400">
                {currentDishIndex + 1} / {dishes.length}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="bg-slate-100 rounded-full h-1 overflow-hidden">
            <div
              className="bg-gray-800 h-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          <div className="text-center">
            <h2 className="text-2xl text-slate-900 mb-2">
              {currentDish.name}
            </h2>
            <p className="text-sm text-slate-500">Wie hat es dir geschmeckt?</p>
          </div>

          <StarRating
            rating={currentDish.rating}
            onRatingChange={onRatingChange}
          />

          <TagSelector
            rating={currentDish.rating}
            selectedTags={currentDish.tags}
            onTagToggle={onTagToggle}
          />

          <button
            onClick={onNext}
            disabled={currentDish.rating === 0}
            className={`w-full py-3 rounded-md text-sm transition-all ${
              currentDish.rating === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-black text-white hover:bg-neutral-900'
            }`}
          >
            {isLastDish ? 'Absenden & Rabatt sichern' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}
