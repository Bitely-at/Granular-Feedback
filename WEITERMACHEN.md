# Weitermachen auf einem anderen Rechner

Stand: 22. August 2026. Diese Datei ist der Einstieg nach einem Rechnerwechsel —
sie sagt, was NICHT im Repository liegt, wo das Projekt gerade steht und was als
Nächstes ansteht. Die Regeln des Systems stehen in `CLAUDE.md`, der Überblick
für Außenstehende im Handbuch (Links unten).

## 1. Was nicht im Repository liegt

Der Code allein reicht nicht. Diese Dinge musst du mitbringen:

| Was | Woher |
|---|---|
| `server/.env` | Nicht eingecheckt (steht in `.gitignore`). Die Werte stehen im Render-Dashboard unter *Environment*: `MONGODB_URI`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`. Lokal von dort kopieren; `JWT_SECRET` darf lokal auch ein beliebiger langer Zufallswert sein — dann gelten lokal ausgestellte Anmeldungen nur lokal. |
| Passwörter der Konten | Nirgends im Code. Alle Mitarbeiterkonten teilen derzeit dasselbe Passwort. |
| Zugang zu Render, Netlify, MongoDB Atlas, Google Cloud Console | Konten von Alexander. |

```bash
git clone https://github.com/marabu-daaz/Granular-Feedback
cd Granular-Feedback
npm install && npm install --prefix server
cp server/.env.example server/.env      # Werte aus Render eintragen
npm run check-db --prefix server        # prüft die Verbindung im Klartext
npm run server:dev                      # Terminal 1 — API auf 4000
npm run dev                             # Terminal 2 — Oberfläche auf 5173
```

**Achtung:** Lokal und Produktion teilen sich dieselbe Atlas-Datenbank. Was du
lokal anlegst oder löschst, ist sofort online sichtbar.

## 2. Wo das Projekt steht

Fertig und live:

- Gastansicht mit QR-Code je Tisch, Bewertung einzelner Gerichte, Punkte
- Kellner-App: Bestellungen buchen, Tische für neue Gäste freigeben, ausgegebene
  Gutscheine eintragen
- Admin: Menü, Gutscheine, Filialen, Tische/QR, Benutzer, Branding, Dashboard
- Anmeldung für Personal (drei Rollen) und **echte Gastkonten** (E-Mail oder Google)
- Gutschein-Einlösung per Wischgeste: der Wisch entwertet endgültig, die
  Servicekraft trägt danach nur noch die Ausgabe ein
- Vier Prüfsuiten: `verify:tables` (27), `verify:admin` (61), `verify:guests`
  (39) — zuletzt alle grün. `verify:redemptions` ist nach dem Umbau der
  Einlösung neu geschrieben und **noch nicht gegen einen Server gelaufen**.

Zugänge und Rollen: siehe Handbuch. Konten auflisten:
`npm run set-password --prefix server` (ohne Argumente).
Punkte für eine Vorführung: `npm run guest-points --prefix server -- <e-mail> <punkte>`.

## 3. Offene Punkte

In der Reihenfolge, in der sie zuletzt besprochen wurden:

1. ~~**Grundsatzfrage Einlösung**~~ — entschieden am 22.08.2026: Der Wisch
   entwertet sofort und endgültig, die Servicekraft trägt danach nur noch die
   Ausgabe ein. Der Screenshot ist damit uninteressant, weil er dieselben Punkte
   kostet wie der echte Wisch. Die 60-Sekunden-Frist ist ersatzlos entfallen.
2. ~~**Bewertung: Service mit der Gesamtbewertung zusammenlegen**~~ — erledigt:
   Service, Ambiente und Tempo stehen unter den Gerichten auf demselben
   Bildschirm, der zweite Schritt ist entfallen.
3. **Neue Restaurants anlegen** — heute nur über das Seed-Skript. Empfohlener
   erster Schritt: ein Skript `new-org` (Registry-Eintrag, Datenbank mit Indizes,
   erste Filiale, erster Kettenadmin mit Passwort). Self-Service und Bezahlung
   erst, wenn es zahlende Kunden gibt.
4. **Monetarisierung** — Felder `plan`, `status`, `trialEndsAt` in
   `bitely_platform.organizations`, durchgesetzt in `resolveOrg`. Franchise mit
   eigener Buchhaltung = eigene Organisation; Filialen desselben Betreibers =
   Filialen. Preis skaliert am sinnvollsten pro Filiale. Bei Zahlungsverzug nur
   das Schreiben sperren — die QR-Codes hängen gedruckt an den Tischen.
5. Kleinkram: keine Ratenbegrenzung auf den Anmelderouten, CORS offen, kein
   "Passwort vergessen", kein Filialpreis. (Tische geben sich inzwischen nach
   zwei Stunden von selbst frei, siehe `releaseStaleTables`.)

## 4. Betriebsfallen, die schon einmal Zeit gekostet haben

- **`GET /version` sagt, welcher Stand live läuft.** Erst benutzen, dann Fehler
  suchen — das Backend hing einmal drei Commits zurück, während `/health` weiter
  "ok" meldete.
- **Optionale Variablen gehören ins Render-Dashboard, nicht in `render.yaml`.**
  Eine neue Variable mit `sync: false` hält den Blueprint-Abgleich an, bis jemand
  den Wert bestätigt — und solange landet kein Deploy.
- **Render Free schläft nach 15 Minuten**; der erste Aufruf danach dauert 20–30
  Sekunden. Vor einer Vorführung einmal `/health` aufrufen.
- **Netlify braucht `VITE_API_BASE_URL` zur Buildzeit.** Nachträglich gesetzt
  erfordert einen neuen Build. Ob der ausgelieferte Build aktuell ist, verrät ein
  Hash-Vergleich: `VITE_API_BASE_URL=https://bitely-api.onrender.com npm run build`
  und den Dateinamen unter `dist/assets/` mit dem der Live-Seite vergleichen.
- **`npm run build` prüft keine Typen.** Der Befehl für den Frontend-Typecheck
  steht in `CLAUDE.md`.
- **Die verify-Skripte brauchen Zugangsdaten aus der Umgebung**, weil die
  gewachsene Datenbank andere Konto-Adressen hat als das Seed-Skript:
  `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run verify:admin`

## 5. Weiterführend

- `CLAUDE.md` — der Arbeitskontext: jede Regel mit ihrer Begründung. Vor dem
  ersten Umbau lesen.
- Handbuch (deutsch): https://claude.ai/code/artifact/5c03a88e-6539-42a4-8a9e-96622a62eba0
- Handbook (english): https://claude.ai/code/artifact/9e5bb134-061f-4024-9e5c-e02adf106922
- Repository: https://github.com/marabu-daaz/Granular-Feedback
- Live: https://bitelyvienna.netlify.app · API: https://bitely-api.onrender.com/health
