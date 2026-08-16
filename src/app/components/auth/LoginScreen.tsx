import { useState, type FormEvent } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useStore } from '../../store';

/**
 * Anmeldung für Mitarbeiter (Admin, Manager, Servicekraft). Steht vor
 * /staff und /admin. Das Verstecken der Oberfläche ist dabei nur die halbe
 * Miete — die Rechte werden serverseitig erzwungen (requireAuth in index.ts).
 */
export function LoginScreen({ title, hint }: { title: string; hint: string }) {
  const { login, brand } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-40px)] flex items-center justify-center p-4 bg-[#F7F8FA] dark:bg-[#0D1117]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex items-center justify-center mb-3">
            <Lock size={20} strokeWidth={1.5} className="text-gray-500 dark:text-gray-400" />
          </div>
          <p className="text-[17px] font-semibold text-gray-900 dark:text-white">{title}</p>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">{hint}</p>
          {brand && <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-2">{brand.name}</p>}
        </div>

        <form onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
          <label className="block">
            <span className="text-[12px] text-gray-500 dark:text-gray-400">E-Mail</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              autoComplete="username" required autoFocus
              className="mt-1 w-full px-3 py-2.5 rounded-xl text-[14px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-none focus:border-gray-400 dark:focus:border-gray-500" />
          </label>

          <label className="block">
            <span className="text-[12px] text-gray-500 dark:text-gray-400">Passwort</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="current-password" required
              className="mt-1 w-full px-3 py-2.5 rounded-xl text-[14px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-none focus:border-gray-400 dark:focus:border-gray-500" />
          </label>

          {error && (
            <p className="text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-xl font-medium text-white text-[15px] transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--ba, #16A34A)' }}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? 'Wird angemeldet…' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  );
}
