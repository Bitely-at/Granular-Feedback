import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { Reward } from '../../App';
import { SwipeToRedeem } from '../SwipeToRedeem';

type State = 'ready' | 'confirm' | 'active' | 'used' | 'error';

interface Props {
  reward: Reward;
  onBack: () => void;
}

export function RedemptionScreen({ reward, onBack }: Props) {
  const [state, setState] = useState<State>('ready');
  const [countdown, setCountdown] = useState(60);
  const [redeemTime, setRedeemTime] = useState('');
  const [now, setNow] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (state === 'active') {
      intervalRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(intervalRef.current!);
            const t = new Date();
            setRedeemTime(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
            setState('used');
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [state]);

  const fmt = (d: Date) =>
    `${d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

  // Error state demo
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-lg border border-slate-300 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto">
            <X size={24} strokeWidth={1.5} className="text-rose-500" />
          </div>
          <div>
            <p className="text-base text-slate-800">Dieser Gutschein wurde bereits eingelöst</p>
            <p className="text-sm text-slate-500 mt-1">Eingelöst am 05.08.2026 um 19:42</p>
          </div>
          <button onClick={onBack} className="w-full py-3 rounded-lg text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            Zurück
          </button>
        </div>
      </div>
    );
  }

  // Active / Used — full screen emerald
  if (state === 'active' || state === 'used') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 transition-colors duration-500 ${state === 'used' ? 'bg-slate-100' : 'bg-emerald-500'}`}>
        {state === 'active' && (
          <motion.div
            className="relative flex items-center justify-center mb-8"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            {/* Pulsing rings */}
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border-2 border-white/40"
                style={{ width: 120 + i * 48, height: 120 + i * 48 }}
                animate={{ scale: [1, 1.06, 1], opacity: [0.5, 0.15, 0.5] }}
                transition={{ duration: 2, delay: i * 0.4, repeat: Infinity }}
              />
            ))}
            <div className="w-32 h-32 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-5xl text-white font-semibold tabular-nums">{countdown}</span>
            </div>
          </motion.div>
        )}

        {state === 'used' && (
          <motion.div
            className="w-20 h-20 rounded-full bg-slate-300 flex items-center justify-center mb-8"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <Check size={36} strokeWidth={2} className="text-white" />
          </motion.div>
        )}

        <div className="text-center space-y-2">
          {state === 'active' ? (
            <>
              <p className="text-white/80 text-sm">Der Servicekraft zeigen</p>
              <p className="text-white text-lg">{reward.title}</p>
              <p className="text-white/70 text-sm mt-4 tabular-nums">{fmt(now)}</p>
            </>
          ) : (
            <>
              <p className="text-slate-500 text-sm">Eingelöst</p>
              <p className="text-slate-700 text-lg">{reward.title}</p>
              <p className="text-slate-400 text-sm mt-2">Eingelöst um {redeemTime}</p>
            </>
          )}
        </div>

        {state === 'used' && (
          <button onClick={onBack} className="mt-10 px-6 py-2.5 rounded-full text-sm bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">
            Fertig
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4">
          <ArrowLeft size={16} strokeWidth={1.5} /> Zurück
        </button>

        <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
          {/* Image */}
          <div className="relative h-40 overflow-hidden">
            <img src={reward.image} alt={reward.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute bottom-3 left-3">
              <span className="text-xs text-white/80 bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
                Gültig bis {reward.validUntil}
              </span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">{reward.subtitle}</p>
              <h2 className="text-base text-slate-800">{reward.title}</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">{reward.description}</p>
              <p className="text-xs text-slate-400 mt-2">{reward.conditions}</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
              <p className="text-xs text-amber-700 text-center">Erst wischen, wenn die Servicekraft zusieht.</p>
            </div>

            <SwipeToRedeem redeemed={false} onRedeem={() => setState('confirm')} />

            {/* Demo error trigger */}
            <button onClick={() => setState('error')} className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors py-1">
              Fehlerzustand anzeigen →
            </button>
          </div>
        </div>
      </div>

      {/* Confirm bottom sheet */}
      <AnimatePresence>
        {state === 'confirm' && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setState('ready')}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl p-6 space-y-4"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            >
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto" />
              <div className="text-center space-y-1 pt-1">
                <p className="text-base text-slate-800">Gutschein jetzt einlösen?</p>
                <p className="text-sm text-slate-500">Danach ist er verbraucht und kann nicht mehr verwendet werden.</p>
              </div>
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => { setState('active'); setCountdown(60); }}
                  className="w-full py-3 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  Einlösen
                </button>
                <button
                  onClick={() => setState('ready')}
                  className="w-full py-3 rounded-lg text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
