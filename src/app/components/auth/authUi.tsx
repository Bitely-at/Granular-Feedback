import * as React from 'react';
import { LogIn } from 'lucide-react';
import { BitelyWordmark } from '../BitelyWordmark';

/**
 * Gemeinsame Bausteine der beiden Anmelde-Masken — Personal (`LoginScreen`) und
 * Gast (`GuestAuthSheet` in `App.tsx`). Beide sollen gleich aussehen; damit sie
 * nicht auseinanderlaufen, steht das Aussehen nur hier.
 *
 * Vorlage: „clean minimal sign in" — Icon im abgerundeten Kästchen als Kopf,
 * Karte mit sanftem Verlauf, Eingabefelder mit vorangestelltem Icon,
 * Verlaufs-Knopf als Hauptaktion, gestrichelte Trennlinie vor den Diensten.
 */

/** Die Karte um die Personal-Anmeldung. Der Gast steckt stattdessen im Sheet. */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm bg-gradient-to-b from-sky-50/60 to-white dark:from-gray-800/40 dark:to-gray-900 rounded-3xl shadow-xl shadow-gray-900/5 p-8 flex flex-col items-center gap-5 border border-blue-100 dark:border-gray-800">
      {children}
    </div>
  );
}

/**
 * Kopf jeder Maske: Zeichen, Titel, eine Zeile Erklärung, optional der Markenname.
 *
 * `mark` ist die eine Stelle, an der sich die beiden Masken unterscheiden dürfen.
 * Die Personal-Anmeldung steht ohne die schwarze Kopfleiste da, die sonst den
 * Namen Bitely trug — dort tritt der Schriftzug an die Stelle des Symbols und
 * sagt, wo man gerade ist. Der Gast sieht stattdessen den Namen seines Lokals,
 * für ihn wäre unsere Marke an dieser Stelle nur Beiwerk.
 */
export function AuthHeader({ title, subtitle, brandName, mark = 'icon' }: {
  title: string; subtitle: string; brandName?: string; mark?: 'icon' | 'bitely';
}) {
  return (
    <div className="flex flex-col items-center text-center">
      {mark === 'bitely' ? (
        <BitelyWordmark className="h-9 mb-5" />
      ) : (
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 mb-5 shadow-lg shadow-gray-900/5 border border-gray-100 dark:border-gray-700">
          <LogIn className="w-7 h-7 text-gray-900 dark:text-white" strokeWidth={1.75} />
        </div>
      )}
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm mt-2 leading-relaxed max-w-[300px]">{subtitle}</p>
      {brandName && <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-2">{brandName}</p>}
    </div>
  );
}

/** Eingabefeld mit Icon links — Maße und Fokusring wie in der Vorlage. */
export function AuthInput({ icon: Icon, ...props }: {
  icon: React.ElementType;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
        <Icon className="w-4 h-4" />
      </span>
      <input
        {...props}
        className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-gray-600 transition"
      />
    </div>
  );
}

/** Hauptaktion: dunkler Verlaufs-Knopf auf Hell, heller auf Dunkel. */
export function AuthPrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full bg-gradient-to-b from-gray-700 to-gray-900 dark:from-gray-100 dark:to-white text-white dark:text-gray-900 font-medium py-2.5 rounded-xl shadow hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
    >
      {children}
    </button>
  );
}

const SOCIAL_SQUARE =
  'flex items-center justify-center w-12 h-12 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition shrink-0';

/**
 * Gestrichelte Trennlinie und die Dienste-Knöpfe. Google ist echt (der Knopf
 * kommt von Google Identity Services und wird als `googleSlot` hereingereicht,
 * sofern der Server eine Client-ID hinterlegt hat). Facebook und Apple sind
 * noch nicht angebunden — `googleAuth.ts` kennt nur Google — und stehen bis
 * dahin nur für das Layout.
 */
export function AuthSocialRow({ googleSlot }: { googleSlot?: React.ReactNode }) {
  return (
    <div className="w-full">
      <div className="flex items-center w-full">
        <div className="flex-grow border-t border-dashed border-gray-200 dark:border-gray-700" />
        <span className="mx-3 text-xs text-gray-400">Oder weiter mit</span>
        <div className="flex-grow border-t border-dashed border-gray-200 dark:border-gray-700" />
      </div>
      <div className="flex gap-3 w-full justify-center mt-3">
        {googleSlot ?? (
          <span className={`${SOCIAL_SQUARE} opacity-40`} title="Nicht eingerichtet">
            <GoogleGlyph />
          </span>
        )}
        {/* TODO: Facebook- und Apple-Login nachrüsten (Server-Prüfung wie in googleAuth.ts). */}
        <button type="button" title="Bald verfügbar" className={SOCIAL_SQUARE}>
          <FacebookGlyph />
        </button>
        <button type="button" title="Bald verfügbar" className={SOCIAL_SQUARE}>
          <AppleGlyph />
        </button>
      </div>
    </div>
  );
}

/** „Passwort vergessen?" — noch ohne Funktion (siehe „Bekannte Lücken" in CLAUDE.md). */
export function ForgotPasswordLink() {
  return (
    <button type="button" title="Bald verfügbar"
      className="text-xs text-gray-500 dark:text-gray-400 hover:underline font-medium shrink-0">
      Passwort vergessen?
    </button>
  );
}

// ── Dienst-Glyphen als Inline-SVG (keine externen Bilder: CSP und Offline) ──

export function GoogleGlyph() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export function FacebookGlyph() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
      <path d="M24 12c0-6.63-5.37-12-12-12S0 5.37 0 12c0 5.99 4.39 10.95 10.13 11.85v-8.39H7.08V12h3.05V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.96.93-1.96 1.87V12h3.33l-.53 3.47h-2.8v8.38C19.61 22.95 24 17.99 24 12z" />
    </svg>
  );
}

export function AppleGlyph() {
  return (
    <svg className="w-5 h-5 text-gray-900" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
