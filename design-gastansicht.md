# Gestaltung der Gastansicht — „Editorial"

Der Maßstab ist nicht die Umfrage, sondern die gedruckte Speisekarte: großzügig,
sehr ruhig, riesige Typografie, ein Titelbild, das weich ausläuft. Was hier steht,
ist umgesetzt (Stand 22. August 2026) — die Datei ist die Begründung dazu und die
Vorlage für alles, was noch dazukommt.

## Regeln, die überall gelten

- **Eine einzige Akzentfarbe** (`var(--ba)`, Vorgabe `#16A34A`, pro Betrieb
  gesetzt). Alles andere ist Weiß, Grau und Schwarz; dunkel `#0D1117`.
- **Keine schwebenden Karten.** Blöcke laufen von Rand zu Rand und sind nur durch
  eine Haarlinie getrennt. Rahmen, Schatten und Zwischenräume gleichzeitig lassen
  eine Liste wie ein Formular wirken.
- **Keine Tab-Leiste, keine sichtbaren Eingaberahmen, keine Attrappen.**
- Mobil zuerst: entworfen für 390 px Breite. Am Desktop steht dieselbe Ansicht
  als zentrierte Karte.

## 1. Startbildschirm (nach dem QR-Scan)

Vollflächiges Titelbild, das oben am Rand beginnt und nach unten im Hintergrund
verschwindet (hell: volle Deckkraft, Farbe des Originals; dunkel: 70 %,
entsättigt, Verlauf nach `#0D1117`). Der Schleier sitzt tief: die obere Hälfte
des Bildes bleibt in voller Farbe, erst ab etwa der Mitte blendet er nach Weiß
(bzw. `#0D1117`), damit die Schlagzeile darunter trägt. Darüber, linksbündig und
unten sitzend:

| Element | Wie |
|---|---|
| Filiale · Tisch | 10 px, Versalien, weit gesperrt, grau — die Gegenprobe beim falschen QR-Code |
| Schlagzeile | „Wie war dein Besuch bei *Name*?" — 44 px, fett, `max-w-[280px]` |
| Einleitung | Ein Satz, 16 px, `max-w-[260px]` |
| Hauptknopf | 54 px hoch, Radius 16, Schatten, Text links, Pfeil rechts |
| Textknopf | „Punkte & Gutscheine ansehen" (angemeldet: mit Punktestand) |
| Fußzeile | POWERED BY **bitely** |

Das **Titelbild** kommt aus den Marken-Einstellungen (`coverImage`, Admin →
Design → Titelbild). Fehlt es, bleibt eine ruhige Fläche in der Akzentfarbe
stehen — der Bildschirm funktioniert dann, er lebt nur weniger.

Das **Logo** steht oben links auf dem Bild, wie der Kopf einer Karte — 44 px,
ohne Namen daneben, der steht drei Zeilen tiefer in voller Größe. Der Gast kennt
das Zeichen von der Tür; ein Name in einer Schlagzeile ersetzt es nicht. Auf dem
Dank-Bildschirm kommt es klein wieder, zusammen mit dem Namen, wie ein
Briefkopf: der Weg beginnt und endet beim Lokal.

Keine Kontext-Leiste über dem Bild — sie würde genau die Wirkung zerstören, für
die das Bild bis an den Rand läuft.

## 2. Bewerten

Der Bildwechsel ist Absicht: das Titelbild gehört zum Empfang, hier wird
gearbeitet. Ruhiger Grund (`gray-50` / `#0D1117`), weiße Blöcke.

- **Kopf**, klebend: Zurück-Pfeil, „Deine Gerichte", rechts der Zähler; darunter
  ein 2 px schmaler Fortschrittsbalken in der Akzentfarbe.
- **Gerichte** als durchgehende Blöcke: Bild 64 px (Radius 14), Name 17 px,
  Preis 15 px grau, Sterne 28 px. Die Anmerkung klappt darunter auf.
- **Gesamteindruck** auf demselben Bildschirm, nur abgesetzt: flache Blöcke,
  Emoji und Wort in 22 px, Sterne 34 px. Zwei Schritte waren einer zu viel — wer
  nach den Gerichten „Weiter" drückte, rechnete mit dem Absenden.
- Unten fest der Absende-Knopf in derselben Form wie „Feedback starten".

Die drei Kartenlayouts aus dem Design-Studio (`standard`, `kompakt`,
`editorial`) bleiben — sie sind jetzt drei Varianten desselben durchgehenden
Blocks, nicht drei Kartenformen.

## 3. Danke

- **Empfang**: weißer Block, Haken im Kreis (64 px, Akzentfarbe), „Vielen Dank!"
  in 22 px fett.
- **Punkte**: eigener Block, die Zahl in 44 px fett in der Akzentfarbe, darunter
  der Fortschritt zur nächsten Belohnung.
- Dann Rezensionstext für Google, Gutscheine oder Anmeldung, ein Ausgang zurück
  zum Start — und ganz unten wieder POWERED BY **bitely**, das den Weg schließt.

## Einlösen

Der Wischbalken ist 64 Pixel hoch und trägt die Akzentfarbe: gewischt wird
einhändig, am Tisch, während jemand zusieht. Danach **keine Zahl**, sondern ein
großes Häkchen mit zwei langsam auslaufenden Ringen, dem Namen des Gutscheins
und der Tischnummer — die Servicekraft soll aus einem Meter Entfernung sehen,
dass es geklappt hat. Der Code, den es früher zum Abgleich gab, bewies ohnehin
nichts: entwertet ist entwertet.

## Was bewusst offen ist

Gutschein- und Kontobildschirm tragen noch das alte Kartenlayout. Sie liegen
hinter dem Startbildschirm und sind kein Teil des ersten Eindrucks; sie
nachzuziehen ist der nächste Schritt, wenn das hier steht.
