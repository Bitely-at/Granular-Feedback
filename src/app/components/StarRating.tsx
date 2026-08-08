import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  onRatingChange: (rating: number) => void;
}

export function StarRating({ rating, onRatingChange }: StarRatingProps) {
  return (
    <div className="flex items-center justify-center gap-3">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onRatingChange(star)}
          className="transition-all hover:scale-105"
        >
          <Star
            size={40}
            fill={star <= rating ? '#FB923C' : 'none'}
            stroke={star <= rating ? '#FB923C' : '#D1D5DB'}
            strokeWidth={1.5}
            className="transition-colors"
          />
        </button>
      ))}
    </div>
  );
}
