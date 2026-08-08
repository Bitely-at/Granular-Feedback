import { motion, AnimatePresence } from 'motion/react';

interface TagSelectorProps {
  rating: number;
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
}

const critiqueTags = [
  'Zu trocken',
  'Kalt',
  'Portion zu klein',
  'Zu teuer',
  'Zu scharf',
  'Geschmacklos'
];

const praiseTags = [
  'Perfekt gewürzt',
  'Top Qualität',
  'Authentisch',
  'Frisch',
  'Kreativ',
  'Schöne Präsentation'
];

export function TagSelector({ rating, selectedTags, onTagToggle }: TagSelectorProps) {
  const tags = rating >= 4 ? praiseTags : critiqueTags;
  const isPositive = rating >= 4;

  return (
    <AnimatePresence mode="wait">
      {rating > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="flex flex-wrap gap-2 justify-center max-w-md mx-auto"
        >
          {tags.map((tag) => {
            const isSelected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => onTagToggle(tag)}
                className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                  isSelected
                    ? 'bg-gray-800 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
