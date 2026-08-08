import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, Lock } from 'lucide-react';
import confetti from 'canvas-confetti';
import { SwipeToRedeem } from './SwipeToRedeem';

interface Reward {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  validUntil: string;
  conditions: string;
  pointsRequired: number;
  image: string;
}

const REWARDS: Reward[] = [
  {
    id: 'miso',
    title: 'Gratis Miso Suppe',
    subtitle: 'Sakura Sushi · Alle Standorte',
    description: 'Eine Miso Suppe nach Wahl inklusive Tofu und Wakame — beim nächsten Besuch einlösbar.',
    validUntil: '30.06.2026',
    conditions: 'Nur vor Ort, nicht kombinierbar',
    pointsRequired: 10,
    image: 'https://images.unsplash.com/photo-1763470260582-894ae15f43bb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80',
  },
  {
    id: 'discount10',
    title: '10 % Rabatt',
    subtitle: 'Sakura Sushi · Alle Standorte',
    description: 'Gültig auf die gesamte Bestellung bei deinem nächsten Restaurantbesuch.',
    validUntil: '31.07.2026',
    conditions: 'Einmalig einlösbar, Mindestwert 15 €',
    pointsRequired: 25,
    image: 'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80',
  },
  {
    id: 'edamame',
    title: 'Gratis Edamame',
    subtitle: 'Sakura Sushi · Alle Standorte',
    description: 'Frisch gedämpfte Edamame, gesalzen und direkt serviert — ideal als Vorspeise.',
    validUntil: '30.06.2026',
    conditions: 'Nur vor Ort, nicht kombinierbar',
    pointsRequired: 35,
    image: 'https://images.unsplash.com/photo-1611810174991-5cdd99a2c6b2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80',
  },
  {
    id: 'roll',
    title: 'Gratis Inside-Out Roll (8 Stück)',
    subtitle: 'Sakura Sushi · Alle Standorte',
    description: 'Acht Stück deiner Wahl aus unserer Inside-Out Karte — Chefempfehlung inklusive.',
    validUntil: '31.08.2026',
    conditions: 'Einmalig einlösbar, nur vor Ort',
    pointsRequired: 55,
    image: 'https://images.unsplash.com/photo-1611143669185-af224c5e3252?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80',
  },
  {
    id: 'discount20',
    title: '20 % auf den ganzen Besuch',
    subtitle: 'Sakura Sushi · Alle Standorte',
    description: 'Unser bestes Angebot: 20 % auf alles — Getränke, Speisen und Desserts.',
    validUntil: '31.08.2026',
    conditions: 'Einmalig einlösbar, Mindestwert 25 €',
    pointsRequired: 70,
    image: 'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80',
  },
];

interface SuccessScreenProps {
  totalPoints: number;
  discountCode: string;
}

export function SuccessScreen({ totalPoints }: SuccessScreenProps) {
  const [animatedPoints, setAnimatedPoints] = useState(0);
  const [redeemed, setRedeemed] = useState<Record<string, boolean>>({});

  const maxPoints = REWARDS[REWARDS.length - 1].pointsRequired;
  const progress = Math.min((totalPoints / maxPoints) * 100, 100);

  useEffect(() => {
    if (totalPoints >= 40) {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }
    const interval = setInterval(() => {
      setAnimatedPoints((prev) => {
        if (prev < totalPoints) return Math.min(prev + 1, totalPoints);
        clearInterval(interval);
        return prev;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [totalPoints]);

  const handleRedeem = (id: string) => {
    setRedeemed((prev) => ({ ...prev, [id]: true }));
    confetti({
      particleCount: 60,
      spread: 50,
      origin: { y: 0.7 },
      colors: ['#10b981', '#34d399', '#6ee7b7'],
    });
  };

  const unlockedRewards = REWARDS.filter((r) => totalPoints >= r.pointsRequired);
  const lockedRewards = REWARDS.filter((r) => totalPoints < r.pointsRequired);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg w-full bg-white rounded-lg border border-slate-300 overflow-hidden"
      >
        {/* Header */}
        <div className="border-b border-slate-200 p-6 text-center">
          <CheckCircle size={40} className="mx-auto mb-3 text-emerald-500" strokeWidth={1.5} />
          <h1 className="text-xl text-slate-900 mb-1">Vielen Dank!</h1>
          <p className="text-sm text-slate-500">Dein Feedback hilft uns, noch besser zu werden</p>
        </div>

        <div className="p-5 space-y-5">
          {/* Points + Progress */}
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-slate-500">Gesammelte Punkte</span>
              <motion.span
                className="text-2xl text-emerald-600"
                key={animatedPoints}
              >
                +{animatedPoints}
              </motion.span>
            </div>
            <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ delay: 0.5, duration: 1 }}
                className="bg-emerald-500 h-full rounded-full"
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>0 Punkte</span>
              <span>{maxPoints} Punkte</span>
            </div>
          </div>

          {/* Unlocked Rewards */}
          {unlockedRewards.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400 uppercase tracking-widest">Deine Belohnungen</p>
              {unlockedRewards.map((reward, i) => (
                <motion.div
                  key={reward.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="rounded-xl border border-slate-200 overflow-hidden"
                >
                  {/* Image */}
                  <div className="relative h-36 overflow-hidden">
                    <img
                      src={reward.image}
                      alt={reward.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute bottom-3 left-3">
                      <span className="text-xs text-white/80 bg-black/30 px-2 py-0.5 rounded-full backdrop-blur-sm">
                        Gültig bis {reward.validUntil}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">{reward.subtitle}</p>
                      <h3 className="text-base text-slate-900">{reward.title}</h3>
                      <p className="text-sm text-slate-500 mt-1 leading-relaxed">{reward.description}</p>
                    </div>
                    <p className="text-xs text-slate-400">{reward.conditions}</p>
                    <SwipeToRedeem
                      redeemed={!!redeemed[reward.id]}
                      onRedeem={() => handleRedeem(reward.id)}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Locked Rewards */}
          {lockedRewards.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 uppercase tracking-widest">Noch nicht freigeschaltet</p>
              {lockedRewards.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 opacity-40">
                    <img src={reward.image} alt={reward.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-600">{reward.title}</div>
                    <div className="text-xs text-slate-400">{reward.pointsRequired} Punkte benötigt</div>
                  </div>
                  <Lock size={13} className="text-slate-300 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
