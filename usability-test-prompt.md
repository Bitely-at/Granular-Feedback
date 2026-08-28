# Prompt für Claude: Usability-Test-Unterlagen für Bitely erstellen

Kopiere den folgenden Block in eine Claude-Session (z. B. hier im Projektordner,
damit Claude die App-Details aus `CLAUDE.md` kennt):

---

Erstelle eine Datei `usability-test.md` im Projektordner mit den Unterlagen für
eine Usability-Studie zu Bitely (Item-basiertes Feedback für Restaurants —
Gäste scannen einen QR-Code am Tisch, bewerten Gerichte einzeln, sammeln
Punkte, lösen Gutscheine ein).

Die Datei soll enthalten:

## 1. Vier Usability-Test-Aufgaben (typische Nutzerszenarien)

Aus Gast-Sicht (die primäre Zielgruppe des Feedback-Flows), realistisch
formuliert als Szenario, nicht als Klick-Anleitung — die Testperson soll den
Weg selbst finden. Jede Aufgabe mit: Szenario-Text, Startpunkt (z. B. "du
öffnest den Link, den du gerade gescannt hast"), Erfolgskriterium (was zählt
als abgeschlossen).

Aufgabe 1: Gerichte einer Bestellung einzeln bewerten (ohne Konto).
Aufgabe 2: Sich während/nach der Bewertung ein Gastkonto anlegen (E-Mail oder
Google) und dabei die eben verdienten Punkte sichern.
Aufgabe 3: Mit vorhandenen Punkten einen Gutschein einlösen (den Wisch-Ablauf
verstehen, inkl. dass er endgültig ist) und der Servicekraft den Code zeigen.
Aufgabe 4: Das eigene Konto verwalten — Punktestand und eingelöste Gutscheine
einsehen, danach das Konto löschen.

(Falls sinnvoll: eine der vier Aufgaben stattdessen aus Kellner- oder
Admin-Sicht, z. B. "eine neue Bestellung für einen Tisch buchen" oder
"ein Gericht in der Verfügbarkeit ausschalten" — nur wenn auch Personal als
Testpersonen infrage kommt.)

## 2. Fragen nach jeder Aufgabe

Kurzer, konsistenter Block, den man nach jeder der vier Aufgaben stellt:
- Single Ease Question (SEQ): "Wie einfach oder schwierig war diese Aufgabe?"
  (7-stufige Skala, 1 = sehr schwierig, 7 = sehr einfach)
- 1-2 offene Fragen: Was war unklar? Was hat gefehlt oder überrascht?
- Ob die Testperson zwischendurch geraten/gezögert hat, und an welcher Stelle.

## 3. Abschlussinterview / Fragebogen

- System Usability Scale (SUS), die 10 Standard-Items, deutsch übersetzt,
  5-stufige Zustimmungsskala.
- Ergänzende offene Fragen: Gesamteindruck, Vertrauen in den Punkte-/
  Gutschein-Mechanismus, ob die Gast-Ansicht wie eine Speisekarte oder wie
  eine Umfrage wirkte (das ist das gestalterische Ziel der App), ob sie das im
  echten Restaurant nutzen würden, offene Verbesserungsvorschläge.
- Kurzer demografischer Teil: Alter, wie oft isst die Person auswärts, Erfahrung
  mit ähnlichen Apps (Bonus-/Punktesysteme).

## 4. Rahmen für die Durchführung

Kurzer Hinweis-Absatz: mindestens 8 Testpersonen (2×n bei n=4), keine aus dem
eigenen Team, nach Möglichkeit aus der Zielgruppe (Restaurantgäste bzw.
Personal, je nach Aufgabe), Think-Aloud-Methode, Moderationsleitfaden knapp
halten (Begrüßung, Hinweis dass die App getestet wird nicht die Person,
Einverständnis zur Aufzeichnung falls zutreffend).

Format: Markdown mit klarer Überschriftenstruktur, damit es sich leicht in ein
Uni-Template kopieren lässt. Sprache: Deutsch (Gastansicht der App ist auch
Deutsch).

---
