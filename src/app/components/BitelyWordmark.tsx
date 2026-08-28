/**
 * Das Bitely-Logo als Bild — Keks-mit-Stern-Symbol und Schriftzug zusammen,
 * überall dort, wo vorher schlicht das Wort „bitely" als Text stand
 * (Gast-Fußzeile, Kopf der Personal-Anmeldung, die schwarze Kellner-Leiste,
 * die Admin-Seitenleiste).
 *
 * Zwei Dateien statt einer eingefärbten: das Blau verschwindet auf dunklem
 * Grund, deshalb eine weiße Fassung, bei der der Stern den Untergrund
 * durchscheinen lässt. Die jeweils verborgene ist für Vorleseprogramme
 * unsichtbar, sonst stünde „Bitely" doppelt.
 *
 * `className` setzt die Höhe (z. B. `h-4`); die Breite ergibt sich. Auf fest
 * dunklem Grund (schwarze Leiste) stattdessen direkt die helle Datei mit
 * `tone="light"` — dort hilft kein `dark:`-Umschalten.
 */
export function BitelyWordmark({ className = 'h-4', tone = 'auto' }: {
  className?: string;
  tone?: 'auto' | 'light';
}) {
  if (tone === 'light') {
    return <img src="/logo-bitely-wordmark-light.png" alt="Bitely" className={`w-auto ${className}`} />;
  }
  return (
    <>
      <img src="/logo-bitely-wordmark.png" alt="Bitely"
        className={`w-auto dark:hidden ${className}`} />
      <img src="/logo-bitely-wordmark-light.png" alt="" aria-hidden="true"
        className={`w-auto hidden dark:block ${className}`} />
    </>
  );
}
