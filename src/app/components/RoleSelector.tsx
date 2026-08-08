import { UtensilsCrossed, LayoutDashboard, User } from 'lucide-react';

const HERO = 'https://images.unsplash.com/photo-1504416285472-eccf03dd31eb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80';

interface Props {
  onSelect: (role: 'guest' | 'waiter' | 'admin') => void;
}

export function RoleSelector({ onSelect }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        {/* Hero */}
        <div className="relative h-44 rounded-lg overflow-hidden mb-6">
          <img src={HERO} alt="Sakura Sushi Restaurant" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10" />
          <div className="absolute bottom-4 left-4">
            <p className="text-white text-xl">Sakura Sushi</p>
            <p className="text-white/70 text-sm mt-0.5">Graz · Herrengasse 12</p>
          </div>
        </div>

        <p className="text-sm text-slate-500 mb-4">Prototyp — Ansicht wählen</p>

        <div className="space-y-3">
          {([
            { role: 'guest' as const, label: 'Gast', sub: 'Gerichte bewerten & Gutschein sichern', Icon: User },
            { role: 'waiter' as const, label: 'Servicekraft', sub: 'Tischverwaltung & Gutschein prüfen', Icon: UtensilsCrossed },
            { role: 'admin' as const, label: 'Admin', sub: 'Auswertungen & Menü-Analyse', Icon: LayoutDashboard },
          ]).map(({ role, label, sub, Icon }) => (
            <button
              key={role}
              onClick={() => onSelect(role)}
              className="w-full flex items-center gap-4 p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-400 active:scale-[0.98] transition-all text-left min-h-[60px]"
            >
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Icon size={18} strokeWidth={1.5} className="text-slate-600" />
              </div>
              <div>
                <p className="text-sm text-slate-800">{label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
