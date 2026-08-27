import { useState, type FormEvent } from 'react';
import { Loader2, Lock, Mail } from 'lucide-react';
import { useStore } from '../../store';
import { useGoogleSignIn } from './googleSignIn';
import {
  AuthCard, AuthHeader, AuthInput, AuthPrimaryButton, AuthSocialRow, ForgotPasswordLink,
} from './authUi';

/**
 * Anmeldung für Mitarbeiter (Admin, Manager, Servicekraft). Steht vor
 * /staff und /admin. Das Verstecken der Oberfläche ist dabei nur die halbe
 * Miete — die Rechte werden serverseitig erzwungen (requireAuth in index.ts).
 *
 * Aussehen: die gemeinsamen Bausteine aus `authUi.tsx`, damit die Maske mit der
 * Gast-Anmeldung (`GuestAuthSheet`) übereinstimmt.
 */
export function LoginScreen({ title, hint }: { title: string; hint: string }) {
  const { login, googleLogin, authOptions, brand } = useStore();
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

  // Google meldet nur an, wer schon ein Konto hat — angelegt wird hier keines.
  // Für das Personal ist das der schnelle Weg: keine Adresse tippen, kein
  // Passwort suchen, das ohnehin alle Konten teilen. `type: 'icon'` rendert den
  // quadratischen Knopf für die Dienste-Reihe.
  const googleRef = useGoogleSignIn(
    authOptions.google ? authOptions.googleClientId : null,
    async credential => {
      setError(null);
      setBusy(true);
      try {
        await googleLogin(credential);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Anmeldung mit Google fehlgeschlagen.');
      } finally {
        setBusy(false);
      }
    },
    { type: 'icon', shape: 'square', theme: 'outline', size: 'large' },
  );

  return (
    <div className="min-h-[calc(100dvh-40px)] flex items-center justify-center p-4 bg-[#F7F8FA] dark:bg-[#0D1117]">
      <AuthCard>
        <AuthHeader title={title} subtitle={hint} brandName={brand?.name} />

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <AuthInput icon={Mail} type="email" placeholder="E-Mail" value={email}
            autoComplete="username" required autoFocus
            onChange={e => setEmail(e.target.value)} />
          <AuthInput icon={Lock} type="password" placeholder="Passwort" value={password}
            autoComplete="current-password" required
            onChange={e => setPassword(e.target.value)} />

          <div className="w-full flex justify-end">
            <ForgotPasswordLink />
          </div>

          {error && <p className="w-full text-xs text-red-500">{error}</p>}

          <AuthPrimaryButton type="submit" disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? 'Wird angemeldet…' : 'Anmelden'}
          </AuthPrimaryButton>
        </form>

        <AuthSocialRow
          googleSlot={authOptions.google
            ? <div ref={googleRef} className="w-12 h-12 flex items-center justify-center overflow-hidden shrink-0" />
            : undefined}
        />

        {authOptions.google && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center leading-relaxed -mt-1">
            Google meldet nur an, wen die Verwaltung schon eingeladen hat.
          </p>
        )}
      </AuthCard>
    </div>
  );
}
