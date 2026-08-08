Figma Make Prompt — Admin-Dashboard, Statistik

Eigenständiger Lauf. Setzt das Designsystem aus dem Haupt-Prompt voraus. Empfehlung: erst Teil 1 laufen lassen, Ergebnis prüfen, dann Teil 2 und 3 nachschieben.

Du bist Product Designer für ein B2B-Analytics-Dashboard in der Gastronomie (Österreich).

Kontext: Gäste bewerten per QR-Code am Tisch einzelne Gerichte von 1 bis 5, optional mit Freitext. Zusätzlich wird der Service bewertet. Das Restaurant sieht hier, welche Gerichte funktionieren, welche Geld kosten und wo die Küche schwankt.

Nutzer: Restaurantinhaber oder Betriebsleiter. Nicht datenaffin, wenig Zeit, schaut auf einem Laptop zwischen zwei Schichten drauf. Er braucht Handlungsanweisungen, keine Kennzahlensammlung.

Sprache: Deutsch, Du-Form, österreichisches Umfeld.

Designsystem — verbindlich
Inter. Größen 12/13/14/16/20/24/32px, Gewichte maximal 600.
Hintergrund 
#f8fafc, Karten weiß, rounded-lg, Rahmen border-slate-200.
Text 
#1e293b / 
#64748b / 
#94a3b8.
Sterne 
#FB923C. Bestätigung 
#10b981. Handlungsbedarf 
#f59e0b. Kritisch 
#f43f5e.
Lucide Icons, strokeWidth 1.5. Keine Verläufe, keine Schlagschatten, keine dekorativen Illustrationen.
Diagramme: Kein Chart-Framework-Look. Dünne Achsen in 
#e2e8f0, keine Gitterlinien außer waagrecht und sehr hell, keine Legenden wo Direktbeschriftung möglich ist, keine Regenbogenpaletten. Eine Datenreihe = eine Farbe. Vergleichswerte grau im Hintergrund.
Grundregel für alle Kennzahlen — durchgängig umsetzen

Jede Zahl braucht eine Mindestfallzahl. Darunter wird keine Zahl angezeigt, sondern der Fortschritt dorthin: „Noch 12 Bewertungen bis zur Auswertung" mit dünnem Fortschrittsbalken. Baue diesen Zustand für jede Kachel, jede Tabellenzeile und jedes Diagramm mit. Das ist kein Randfall, das ist bei einem neuen Kunden die Hälfte des Bildschirms.

Teil 1 — Übersichtsseite (1440×900)
Kopfbereich

Restaurantname, Standortauswahl (Dropdown, bei einem Standort ausgeblendet), Zeitraumfilter als Segmented Control: 7 Tage / 30 Tage / Quartal / Frei. Rechts ein unauffälliger Export-Button.

Handlungsleiste — steht ganz oben, vor allen Zahlen

Maximal drei Karten nebeneinander, jede eine konkrete Beobachtung mit Handlung:

Amber-Rahmen: „Cordon Bleu — 4 Bewertungen unter 3 diese Woche, alle zwischen 19 und 21 Uhr" · Button „Ansehen"
Emerald-Rahmen: „Kürbiscremesuppe wird stark bewertet, aber selten bestellt" · Button „Ansehen"
Slate-Rahmen: „Seit dem Preiswechsel am 12.7. fällt die Bewertung des Rinderfilets" · Button „Ansehen"

Diese Karten sind das Wichtigste auf der Seite. Wenn nichts anliegt: eine einzelne ruhige Karte „Diese Woche gibt es nichts, worum du dich kümmern müsstest."

Kennzahlenreihe

Sechs schmale Kacheln, jeweils Zahl groß, Label klein darunter, Veränderung zum Vorzeitraum als kleiner Pfeil mit Prozentwert:

Bewertungen · Ø Bewertung · Ausreißerquote (Anteil ≤ 2 Sterne) · Scan-Rate (Anteil erfasster Tische) · Ausgegebene Gutscheine · Einlösequote

Die Ausreißerquote ist die wichtigste — leicht hervorheben, ohne sie zu einer Warnung zu machen.

Signature-Element: Menü-Matrix

Streudiagramm, mittig, dominant. X-Achse Verkaufsmenge, Y-Achse Ø Bewertung, Punktgröße Deckungsbeitrag. Vier Quadranten, Beschriftung klein in der Ecke, 
#94a3b8: „Zugpferde" oben rechts, „Problemfälle" unten rechts, „Verkannt" oben links, „Streichkandidaten" unten links. Der Quadrant unten rechts hat eine sehr dezente Amber-Tönung als Hintergrund — dort liegt das Geld. Punkte direkt beschriftet, bei Überlappung nur die auffälligsten. Hover zeigt eine kompakte Karte: Gericht, Verkäufe, Ø, Ausreißerquote, Deckungsbeitrag, Trend. Gerichte unterhalb der Mindestfallzahl erscheinen als hohle graue Punkte am Rand mit Sammelhinweis „7 Gerichte noch ohne Auswertung".

Küche gegen Service

Schmales Diagramm, zwei Linien über die Zeit: Ø Speisen, Ø Service. Direktbeschriftung am Linienende statt Legende. Zweck: zeigt auf einen Blick, ob ein schwacher Zeitraum an der Küche oder am Personal lag.

Teil 2 — Gerichtsliste und Detailansicht
Gerichtstabelle

Spalten: Gericht · Verkäufe · Ø Bewertung (Sterne plus Zahl) · Streuung · Ausreißerquote · Trend · Kommentare · Preis · Deckungsbeitrag (bearbeitbares Feld).

Die Streuung als kleines horizontales Balken-Sparkline direkt in der Zelle: die Verteilung 1–5 als fünf schmale Balken. Das ist der Kern der Tabelle — ein Gericht mit Ø 4,0 und breiter Streuung sieht sofort anders aus als eines mit Ø 4,0 und enger Streuung.

Sortierbar nach jeder Spalte. Filter: nur Gerichte mit Handlungsbedarf, nur neue Gerichte, nach Kategorie. Deckungsbeitrag ist direkt in der Zelle editierbar (Inline-Eingabe, Speichern bei Blur) — der Wirt trägt ihn manuell ein, solange keine Kassenanbindung besteht.

Detailansicht Gericht (Slide-over von rechts, 640px breit)
Kopf: Gerichtsname, Preis, Kategorie, Ø groß mit Sternen.
Verteilung 1–5 als horizontale Balken mit absoluten Zahlen.
Zeitverlauf als Linie über Wochen, mit Ereignis-Markern: senkrechte gestrichelte Linien mit Label, die der Wirt selbst setzen kann („neuer Koch", „Rezept geändert", „Lieferant gewechselt", „Preis erhöht"). Ein „+ Ereignis eintragen"-Button direkt am Diagramm. Nach dem Marker wird der Mittelwert vor und nach dem Ereignis als zwei waagrechte graue Linien eingeblendet.
Nach Tageszeit und Wochentag: Heatmap, Wochentage als Zeilen, Zeitblöcke (Mittag / Nachmittag / Abend) als Spalten, Zellenfärbung nach Ø. Nur ein Farbverlauf von hell nach amber, keine Rot-Grün-Skala.
Kommentar-Cluster: thematisch gruppiert mit Häufigkeit, aufklappbar zu den Originalzitaten mit Datum. Pro Cluster ein kleiner Trendpfeil, ob das Thema zu- oder abnimmt. Beispielcluster: „zu kalt serviert · 7", „Portion zu klein · 4", „zu salzig · 3".
Wird oft zusammen bestellt mit: drei Gerichte als Liste, jeweils mit Ø, um zu sehen, ob eine schwache Beilage den Hauptgang runterzieht.
Teil 3 — Nebenansichten
Gäste und Gutscheine
Anteil Erstbesucher gegen Wiederkehrende, und deren Ø Bewertung im Vergleich.
Ausgegebene gegen eingelöste Gutscheine über die Zeit, als gestapelte schmale Balken.
Zeitspanne bis zur Einlösung als Verteilung — das ist faktisch das Wiederbesuchsintervall.
Eine große Aussagekachel: „47 messbare Wiederbesuche im letzten Monat". Diese eine Zahl darf groß und selbstbewusst stehen.
Export

Kein eigener Bildschirm, ein Dialog vom Export-Button:

Auswahl Format: CSV Rohdaten · CSV Aggregat · XLSX · PDF-Bericht
Zeitraum, Standorte, Kategorien als Auswahl
Schalter „Freitextkommentare einschließen" mit Hinweiszeile darunter: „Kommentare können personenbezogene Angaben enthalten."
Unterer Bereich: automatischer Monatsbericht, Mailadressen eintragbar, Schalter aktiv/inaktiv, Vorschau-Link. Dieser Teil ist wichtiger als der manuelle Export — gib ihm sichtbar Platz, nicht die Fußzeile.
Zustände, die mitgebaut werden müssen
Neuer Kunde, keine Daten: Kein leeres Raster. Stattdessen eine Karte mit drei Schritten (Sticker anbringen · erste Tische erfassen · erste Auswertung ab 30 Bewertungen) und einem ehrlichen Hinweis, wie lange das dauert.
Zu wenige Daten für eine einzelne Kachel: Fortschritt statt Zahl.
Ladezustand: Skelettflächen in 
#f1f5f9, keine Spinner.
Fehler: was passiert ist und was jetzt zu tun ist, in der Stimme der Oberfläche, ohne Entschuldigung.
Nicht bauen

Auswertungen pro Mitarbeiter oder pro Kellner (arbeitsrechtlich heikel, bewusst ausgelassen). KI-Chat-Assistent. Benchmarking gegen andere Restaurants. Zahlungs- oder Bestelldaten. Rollenverwaltung.