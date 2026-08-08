import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check } from 'lucide-react';

interface SwipeToRedeemProps {
  onRedeem: () => void;
  redeemed: boolean;
}

export function SwipeToRedeem({ onRedeem, redeemed }: SwipeToRedeemProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const startXRef = useRef(0);
  const THUMB = 44;

  const getMax = () => (trackRef.current?.clientWidth ?? 280) - THUMB - 8;

  const handleStart = (clientX: number) => {
    if (redeemed) return;
    setDragging(true);
    startXRef.current = clientX - offset;
  };

  const handleMove = (clientX: number) => {
    if (!dragging) return;
    const next = Math.max(0, Math.min(clientX - startXRef.current, getMax()));
    setOffset(next);
  };

  const handleEnd = () => {
    if (!dragging) return;
    setDragging(false);
    if (offset >= getMax() * 0.82) {
      setOffset(getMax());
      setTimeout(onRedeem, 150);
    } else {
      setOffset(0);
    }
  };

  const progress = offset / (getMax() || 1);

  if (redeemed) {
    return (
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="h-12 rounded-full bg-emerald-600 flex items-center justify-center gap-2"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <Check size={18} className="text-white" strokeWidth={2.5} />
        </motion.div>
        <span className="text-white text-sm">Eingelöst</span>
      </motion.div>
    );
  }

  return (
    <div
      ref={trackRef}
      className="relative h-12 rounded-full bg-slate-100 overflow-hidden select-none"
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => { e.preventDefault(); handleStart(e.touches[0].clientX); }}
      onTouchMove={(e) => { e.preventDefault(); handleMove(e.touches[0].clientX); }}
      onTouchEnd={handleEnd}
      style={{ touchAction: 'none' }}
    >
      {/* Fill */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `linear-gradient(to right, #059669 ${progress * 100}%, transparent ${progress * 100}%)`,
        }}
      />

      {/* Label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none pl-12">
        <span className="text-sm" style={{ color: progress > 0.45 ? '#fff' : '#64748b' }}>
          Zum Einlösen wischen
        </span>
      </div>

      {/* Thumb */}
      <div
        className="absolute top-1 bottom-1 aspect-square rounded-full bg-white shadow-sm flex items-center justify-center"
        style={{ left: `calc(${offset}px + 4px)`, transition: dragging ? 'none' : 'left 0.2s ease' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={progress > 0.82 ? '#059669' : '#64748b'} strokeWidth="2.5">
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
