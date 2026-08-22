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
  // Bewusst groß: gewischt wird am Tisch, oft einhändig, mit dem Daumen und
  // während jemand zusieht. Ein 48-Pixel-Balken traf man daneben.
  const THUMB = 56;

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
        className="h-16 rounded-full flex items-center justify-center gap-2"
        style={{ backgroundColor: 'var(--ba, #16A34A)' }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <Check size={26} className="text-white" strokeWidth={2.5} />
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div
      ref={trackRef}
      className="relative h-16 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden select-none"
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
          background: `linear-gradient(to right, var(--ba, #16A34A) ${progress * 100}%, transparent ${progress * 100}%)`,
        }}
      />

      {/* Richtungspfeile statt Beschriftung: die Geste wird vor der Servicekraft
          ausgeführt, nicht gelesen. Sie verblassen, während gewischt wird. */}
      <div className="absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none pl-14"
        style={{ opacity: 1 - progress * 1.4 }}>
        {[0, 1, 2].map(i => (
          <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#94a3b8" strokeWidth="2.5" style={{ opacity: 0.35 + i * 0.25 }}>
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ))}
      </div>

      {/* Thumb */}
      <div
        className="absolute top-1 bottom-1 aspect-square rounded-full bg-white shadow-md flex items-center justify-center"
        style={{ left: `calc(${offset}px + 4px)`, transition: dragging ? 'none' : 'left 0.2s ease' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={progress > 0.82 ? 'var(--ba, #16A34A)' : '#64748b'} strokeWidth="2.5">
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
