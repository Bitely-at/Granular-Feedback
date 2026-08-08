import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle, Lock, ChevronLeft } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Reward } from '../../App';

interface Props {
  totalPoints: number;
  rewards: Reward[];
  onRedeem: (reward: Reward) => void;
  onBack: () => void;
}

const MAX_POINTS = 70;

export function GuestSuccessScreen({ totalPoints, rewards, onRedeem, onBack }: Props) {
  const [animatedPoints, setAnimatedPoints] = useState(0);
  const progress = Math.min((totalPoints / MAX_POINTS) * 100, 100);

  useEffect(() => {
    if (totalPoints >= 40) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    const iv = setInterval(() => {
      setAnimatedPoints((p) => {
        if (p < totalPoints) return Math.min(p + 1, totalPoints);
        clearInterval(iv);
        return p;
      });
    }, 30);
    return () => clearInterval(iv);
  }, [totalPoints]);

  const unlocked = rewards.filter((r) => totalPoints >= r.pointsRequired);
  const locked = rewards.filter((r) => totalPoints < r.pointsRequired);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors -ml-2" aria-label="Zurück zur Bewertung">
          <ChevronLeft size={20} strokeWidth={1.5} className="text-slate-600" />
        </button>
        <p className="text-sm text-slate-800">Deine Gutscheine</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="max-w-lg mx-auto p-4 space-y-5">

          {/* Thank-you + points */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 text-center space-y-4">
            <CheckCircle size={36} className="mx-auto text-emerald-700" strokeWidth={1.5} />
            <div>
              <p className="text-base text-slate-800">Vielen Dank!</p>
              <p className="text-sm text-slate-500 mt-1">Dein Feedback hilft uns, noch besser zu werden.</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-slate-500">Gesammelte Punkte</span>
                <span className="text-2xl text-emerald-700">+{animatedPoints}</span>
              </div>
              <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ delay: 0.5, duration: 1 }}
                  className="bg-emerald-600 h-full rounded-full" />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>0</span><span>{MAX_POINTS} Punkte</span>
              </div>
            </div>
          </div>

          {/* Unlocked */}
          {unlocked.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 uppercase tracking-widest">Freigeschaltete Belohnungen</p>
              {unlocked.map((reward, i) => (
                <motion.div key={reward.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="relative h-36 overflow-hidden">
                    <img src={reward.image} alt={reward.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                      <span className="text-xs text-white/80 bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
                        Gültig bis {reward.validUntil}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">{reward.subtitle}</p>
                      <p className="text-sm text-slate-800">{reward.title}</p>
                      <p className="text-xs text-slate-500 mt-1">{reward.description}</p>
                      <p className="text-xs text-slate-400 mt-1">{reward.conditions}</p>
                    </div>
                    <button onClick={() => onRedeem(reward)}
                      className="w-full py-3 rounded-full text-sm bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] transition-all min-h-[48px]">
                      Einlösen
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Locked */}
          {locked.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 uppercase tracking-widest">Noch nicht freigeschaltet</p>
              {locked.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 min-h-[56px]">
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 opacity-40">
                    <img src={r.image} alt={r.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-600 truncate">{r.title}</p>
                    <p className="text-xs text-slate-400">{r.pointsRequired} Punkte benötigt</p>
                  </div>
                  <Lock size={13} strokeWidth={1.5} className="text-slate-300 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}

          {unlocked.length === 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
              <p className="text-sm text-slate-600">Noch keine Belohnung freigeschaltet.</p>
              <p className="text-xs text-slate-400 mt-1">Ab {rewards[0]?.pointsRequired} Punkten gibt es deinen ersten Gutschein.</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
