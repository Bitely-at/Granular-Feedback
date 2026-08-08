Du bist Product Designer für ein B2B-SaaS-Produkt in der Gastronomie (Österreich, Markt Graz/Wien).

Produkt: Gäste bewerten nach dem Essen einzelne Gerichte per QR-Code am Tisch. Das Restaurant bekommt dadurch Feedback auf Gerichtsebene statt nur einer Google-Gesamtnote. Gäste erhalten dafür einen kleinen Gutschein.

Sprache der gesamten UI: Deutsch (Du-Form, österreichisches Umfeld, keine Anglizismen wo ein deutsches Wort existiert).

Designsystem — verbindlich, nicht neu erfinden

Es existiert bereits ein Prototyp. Alles Neue muss dazu passen:

Font: Inter. Größen: 12/13/14/16/20/24px. Keine Schriftgewichte über 600.
Hintergrund: 
#f8fafc (slate-50). Karten weiß, rounded-lg, Rahmen border-slate-200/border-slate-300. Keine Schlagschatten außer minimal auf beweglichen Elementen.
Text: 
#1e293b primär, 
#64748b sekundär, 
#94a3b8 tertiär.
Sterne: gefüllt 
#FB923C, leer Kontur 
#D1D5DB.
Bestätigung/Erfolg: Emerald 
#10b981.
Warnung/Handlungsbedarf: Amber 
#f59e0b. Kritisch: Rose 
#f43f5e. Sparsam einsetzen.
Icons: Lucide, strokeWidth 1.5.
Radius: Karten 8px, Pills/Buttons innerhalb von Karten 12px, Slider/Chips voll rund.
Ruhig und sachlich. Keine Verläufe außer als Bildüberlagerung, keine Glasmorphismus-Effekte, keine dekorativen Illustrationen.
Block A — Gast (Mobile, 390×844, einhändig bedienbar)

Bereits gebaut: Bewertungsscreen und Erfolgsscreen. Ergänze:

A1 — Gutschein-Einlösung (wichtigster Screen)

Kernidee: Der Gutschein wird vor dem Personal aktiviert, nicht vorher. Ein Screenshot darf nicht ausreichen.

Drei Zustände auf einem Screen:

Bereit — Gutscheinkarte mit Bild, Titel, Bedingungen, Gültigkeit. Darunter ein Slider „Zum Einlösen wischen". Über dem Slider ein deutlicher Hinweis: „Erst wischen, wenn die Servicekraft zusieht."
Bestätigen — Bottom Sheet nach dem Wischen: „Gutschein jetzt einlösen? Danach ist er verbraucht." Zwei Buttons: Abbrechen / Einlösen.
Aktiv — Vollflächiger emerald Screen. Große laufende Countdown-Zahl von 60 auf 0. Darunter Gutscheinname, Uhrzeit und Datum in Echtzeit, sowie eine kontinuierlich laufende Animation (z. B. pulsierender Ring oder wandernde Lichtkante), die belegt, dass der Bildschirm live ist. Text: „Der Servicekraft zeigen." Nach Ablauf Zustand Verbraucht: grau, Häkchen, „Eingelöst um 19:42".

Baue zusätzlich einen Fehlerzustand: „Dieser Gutschein wurde bereits eingelöst" mit Zeitstempel.

A2 — Gericht nicht gefunden (Fallback)

Wenn der Tisch keine Bestellung hinterlegt hat: „Wir wissen noch nicht, was auf dem Tisch stand." Darunter Suchfeld und Liste der Karte, Mehrfachauswahl, häufig bestellte Gerichte zuerst. Ausgewählte Gerichte als Chips oben. Danach Weiterleitung in den bestehenden Bewertungsflow.

A3 — Bewertungsscreen, Überarbeitung

Vom bestehenden Screen ausgehend, mit drei Änderungen:

Pro Gericht eine unauffällige Option „Hatte ich nicht" — das Gericht wird ausgegraut statt bewertet.
Unter jeder Bewertung von 1–3 Sternen erscheint aufklappend ein optionales Freitextfeld: „Was war nicht gut? (optional)".
Fixer Hinweis über dem Absenden-Button, klein aber sichtbar: „Deinen Gutschein bekommst du unabhängig von deiner Bewertung."
Block B — Restaurant
B1 — Kellner, Mobile (390×844)

Muss in unter 10 Sekunden bedienbar sein, im vollen Service, mit einer Hand.

Tischübersicht: Raster aus Tischkacheln. Pro Kachel: Nummer, Anzahl zugewiesener Gerichte, Zeit seit Öffnung. Farbcodierung: grau = leer, weiß = offen, emerald = bewertet, rose = Bewertung unter 3.
Tisch öffnen: Gerichte aus der Karte antippen. Suchfeld oben, darunter „Heute häufig" als Schnellauswahl, dann Kategorien. Ausgewählte Gerichte mit Mengensteppern in einer fixen Leiste am unteren Rand. Ein Button „Tisch speichern".
Alarm-Banner: Erscheint über allem, wenn eine Bewertung unter 3 eingeht, solange der Tisch offen ist. Inhalt: Tischnummer, Gericht, Sterne, Freitext falls vorhanden. Zwei Aktionen: „Erledigt" / „Ansehen". Amber-Hintergrund, nicht rot — es soll aufmerksam machen, nicht alarmieren.
Gutschein prüfen: Eingabefeld für Code plus Kamera-Button. Ergebnis groß und eindeutig: gültig (emerald, Gutscheinname) oder ungültig (rose, Grund).
B2 — Admin-Dashboard, Desktop (1440×900)

Das ist der Screen, der das Produkt verkauft. Hier darf die meiste Sorgfalt hinein.

Kopfzeile: Restaurantname, Zeitraumfilter (7 Tage / 30 Tage / Quartal), Standortauswahl.
Kennzahlenreihe: Bewertungen im Zeitraum, Ø Bewertung mit Veränderung zum Vorzeitraum, Scan-Rate in Prozent der Tische, eingelöste Gutscheine.
Signature-Element — Menü-Matrix: Streudiagramm. X-Achse Verkaufsmenge, Y-Achse Ø Bewertung, Punktgröße Deckungsbeitrag. Vier Quadranten mit Beschriftung in der Ecke, in gedämpftem Grau: „Zugpferde" (viel verkauft, gut bewertet), „Problemfälle" (viel verkauft, schlecht bewertet), „Verkannt" (wenig verkauft, gut bewertet), „Streichkandidaten". Punkte beschriftet, Hover zeigt eine Karte mit Detailwerten. Der Quadrant „Problemfälle" darf farblich hervorstechen — dort liegt das Geld.
Gerichtstabelle: Gericht, Verkäufe, Ø Bewertung als Sterne plus Zahl, Trendpfeil zum Vorzeitraum, Anzahl Kommentare. Sortierbar, Zeile aufklappbar.
Detailansicht Gericht: Liniendiagramm des Bewertungsverlaufs über Wochen, Verteilung 1–5 als horizontale Balken, und darunter thematisch geclusterte Gästekommentare mit Häufigkeit — z. B. „zu kalt serviert · 7 Nennungen" als aufklappbare Gruppe mit den Originalzitaten.
Leerzustand: Wenn zu wenige Daten für ein Gericht vorliegen: „Noch 12 Bewertungen bis zur ersten Auswertung" statt einer irreführenden Zahl. Das ist wichtig — nie eine Aussage auf Basis von drei Bewertungen darstellen.
Verhalten und Qualität
Alles mobil zuerst, Touch-Ziele mindestens 44px.
Sichtbarer Tastaturfokus, prefers-reduced-motion respektieren.
Fehlermeldungen sagen, was passiert ist und was jetzt zu tun ist. Keine Entschuldigungen.
Buttonbeschriftungen sind Verben und bleiben durch den Flow gleich: „Einlösen" führt zu „Eingelöst".
Leere Screens sind eine Aufforderung zum Handeln, keine Stimmung.
Nicht bauen

Login- und Registrierungsflow, Zahlungsabwicklung, Rechnungssplitting, Menü-Editor mit Allergenen und Bildern, Rollen- und Rechteverwaltung, Marketing-Landingpage.