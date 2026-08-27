import { useEffect, useRef } from 'react';

/**
 * Lädt Googles Anmelde-Skript und rendert dessen Knopf — aber nur, wenn der
 * Server eine Client-ID hinterlegt hat. Ohne sie erscheint der Knopf gar nicht
 * erst, statt beim Antippen mit einem Fehler zu enden.
 *
 * Liegt in einer eigenen Datei, weil ihn zwei Anmeldungen brauchen: die des
 * Gastes (Punkte) und die des Personals (Zugang zu Kellner- und Admin-Bereich).
 * Das Skript lädt trotzdem nur einmal, erkennbar am `data-google-signin`.
 */
export function useGoogleSignIn(
  clientId: string | null,
  onCredential: (credential: string) => void,
  // Überschreibt die Vorgaben von `renderButton` — z. B. `{ type: 'icon' }` für
  // den quadratischen Knopf in der Dienste-Reihe. Ohne das der breite Knopf.
  buttonOptions?: Record<string, unknown>,
) {
  const buttonRef = useRef<HTMLDivElement>(null);
  // In einer Ref, damit ein neu erzeugter Callback nicht das ganze Skript lädt.
  const handler = useRef(onCredential);
  handler.current = onCredential;
  const options = useRef(buttonOptions);
  options.current = buttonOptions;

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;
    let cancelled = false;

    const render = () => {
      const google = (window as unknown as { google?: any }).google;
      if (cancelled || !google?.accounts?.id || !buttonRef.current) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (res: { credential?: string }) => {
          if (res.credential) handler.current(res.credential);
        },
      });
      google.accounts.id.renderButton(buttonRef.current, options.current ?? {
        theme: 'outline', size: 'large', width: 280, text: 'continue_with', locale: 'de',
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-google-signin]');
    if (existing) { existing.addEventListener('load', render); render(); }
    else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleSignin = 'true';
      script.addEventListener('load', render);
      document.head.appendChild(script);
    }
    return () => { cancelled = true; };
  }, [clientId]);

  return buttonRef;
}
