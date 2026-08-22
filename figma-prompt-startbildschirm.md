# Figma-Prompt — Gast-Startbildschirm nach dem QR-Scan

Was das ist: der Bildschirm, den ein Gast sieht, sobald er den QR-Code am Tisch
scannt. Erster Eindruck der ganzen App, deshalb soll er besser aussehen als der
heutige (Logo, Name, zwei Sätze, drei Knöpfe untereinander auf Weiß).

Gedacht für Figma Make / Figma AI. Ein Block, zum Kopieren.

---

Entwirf einen mobilen Startbildschirm (390 × 844, iPhone-Rahmen) für eine
Gäste-Web-App eines Restaurants. Der Gast hat gerade den QR-Code an seinem Tisch
gescannt und landet hier. Deutschsprachige Oberfläche, kein Login-Zwang, die
ganze Sitzung dauert unter einer Minute.

**Ton und Wirkung:** warm und gastfreundlich, nicht nach Software aussehend.
Wie die Speisekarte eines guten Lokals, nicht wie ein Umfrageformular. Ruhig,
großzügig, hohe Kontraste, viel Luft. Keine Verspieltheit, keine Illustrationen,
keine Maskottchen.

**Aufbau von oben nach unten:**

1. **Titelbild** — ein Foto des Lokals oder eines Gerichts, oben etwa 38 % der
   Höhe, randlos bis an die Kanten, mit weichem Verlauf nach unten ins
   Hintergrundweiß. Das Bild kommt aus den Einstellungen des Betriebs und kann
   fehlen: entwirf zusätzlich eine Variante ohne Foto, bei der stattdessen eine
   ruhige Fläche in der Markenfarbe steht.
2. **Logo** — rundes oder abgerundetes Quadrat, 64 px, mittig, überlappt die
   Unterkante des Titelbilds. Fallback ist ein Emoji (🍽️) statt eines Bildes.
3. **Name des Lokals** — 26–28 px, fett, mittig.
4. **Filiale · Tisch 12** — 14 px, gedeckt grau, direkt darunter. Bewusst klein:
   der Gast prüft damit nur kurz gegen, ob er den richtigen Code erwischt hat.
5. **Ein Satz Einleitung** — max. 280 px breit, mittig, ruhige Zeilenhöhe:
   „In unter 30 Sekunden erledigt — teile dein Feedback und sichere dir
   Treuepunkte."
6. **Aktionen, unten fixiert**, volle Breite minus 24 px Rand:
   - Hauptknopf: **„Feedback geben"**, 52 px hoch, Radius 14, gefüllt in der
     Markenfarbe, weiße Schrift.
   - Darunter als Textknopf: **„Deine Punkte und Gutscheine · 240 Pkt."**
   - Darunter, kleiner und grauer: **„Anmelden, um Punkte zu sichern"**.

**Zustände, die mit entworfen werden sollen (eigene Artboards):**

- **Ohne offene Bestellung:** der Hauptknopf entfällt, der Einleitungstext
  lautet stattdessen „Für diesen Tisch liegt gerade keine offene Bestellung vor.
  Sobald dein Service-Team Gerichte einträgt, kannst du sie hier einzeln
  bewerten." Der Bildschirm darf trotzdem keine Sackgasse sein — die
  Gutschein-Knöpfe bleiben.
- **Angemeldet vs. nicht angemeldet:** ohne Konto steht dort „Gutscheine
  ansehen" und darunter der Anmelde-Hinweis; mit Konto steht der Punktestand im
  Knopf und der Anmelde-Hinweis entfällt.
- **Dunkelmodus** derselben Ansicht.

**Gestaltungsregeln:**

- Eine einzige Akzentfarbe, als Variable/Token angelegt (Standard #16A34A, wird
  pro Betrieb überschrieben). Alles andere ist Weiß, Grau und Schwarz. Kein
  zweiter bunter Ton.
- Hintergrund hell #FFFFFF, Flächen dahinter #F7F8FA; dunkel #0D1117 / #161B22.
- Schrift Inter (alternativ Poppins oder DM Sans). Größen 12 / 14 / 16 / 26.
- Radien 14–20, Schatten höchstens ganz weich; keine Rahmen um alles.
- Der Inhalt muss auf ein 812-px-Gerät ohne Scrollen passen. Wird er höher, sind
  Titelbild und Text die Zone, die scrollt — die Knöpfe bleiben unten sichtbar.
- Keine Attrappen: keine untere Tab-Leiste, keine Suchzeile, keine Icons ohne
  Funktion, keine erfundene Statuszeile mit Sternebewertungen.
- Keine Erwähnung der Plattform selbst. Der Gast sieht die Marke des Lokals,
  sonst nichts.

**Liefere:** ein Artboard je Zustand (mit Foto, ohne Foto, ohne Bestellung,
angemeldet, dunkel), dazu die verwendeten Farb- und Textstile als Variablen.
