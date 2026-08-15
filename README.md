# Bitely

Item-basiertes Feedback für Restaurants. Gäste scannen einen QR-Code am Tisch
und bewerten die Gerichte ihrer Bestellung **einzeln** — nicht das Lokal als
Ganzes. Dafür sammeln sie Punkte und Gutscheine. Das Restaurant sieht dadurch
pro Gericht, was funktioniert und was nicht.

## Drei Ansichten

| Ansicht | Route | Wofür |
|---|---|---|
| **Gast** | `/:orgSlug/table/:number` | Ziel des QR-Codes: Gerichte bewerten, Gesamteindruck, Punkte |
| **Kellner** | `/:orgSlug/staff` | Bestellungen auf Tische buchen, Tische schließen, Alarme bei schlechten Bewertungen |
| **Admin** | `/:orgSlug/admin` | Auswertungen, Bewertungen mit Freitexten, Benutzer, QR-Codes, CSV-Export |

## Lokal starten

Voraussetzungen: Node 20+, eine MongoDB (Atlas genügt in der Gratis-Stufe).

```bash
npm install
npm install --prefix server

cp server/.env.example server/.env     # MONGODB_URI eintragen
npm run check-db --prefix server       # Verbindung prüfen
npm run server:seed                    # Demo-Daten anlegen

npm run server:dev                     # Terminal 1 — API auf Port 4000
npm run dev                            # Terminal 2 — Oberfläche auf Port 5173
```

Danach im Browser: `http://localhost:5173/sakura-sushi/table/4`

Der Vite-Dev-Server leitet `/api` automatisch an Port 4000 weiter; lokal wird
`VITE_API_BASE_URL` nicht gebraucht.

## Aufbau

```
src/app/App.tsx      Oberfläche (Gast, Kellner, Admin, Routing)
src/app/store.tsx    Zustand und API-Aufrufe
server/src/index.ts  Express-API
server/src/db.ts     Mongo-Verbindung, Indizes, Migrationen
server/src/seed.ts   Demo-Daten
scripts/             Verifikationsskripte
```

React + Vite + TypeScript im Frontend, Express + MongoDB im Backend.

**Mandantenfähig:** Jede Organisation bekommt eine eigene Datenbank
(`bitely_org_<slug>`), die Registry liegt in `bitely_platform.organizations`.
Alle API-Routen laufen unter `/api/:orgSlug/*`.

## Nützliche Befehle

```bash
npm run check-db --prefix server   # Verbindung prüfen, Fehler im Klartext
npm run verify:tables              # 17 Tests für den Tisch-Lebenszyklus
npm run build                      # Produktionsbuild
```

`npm run verify:tables` braucht einen laufenden Server und schreibt in dessen
Datenbank: Es legt einen eigenen Tisch an und löscht ihn wieder, erhöht dabei
aber die Sternezähler der Testgerichte. Für echte Datenbestände vorher
`ORG_SLUG` auf eine Wegwerf-Organisation setzen.

## Deployment

| Teil | Dienst | Nötige Variable |
|---|---|---|
| Frontend | Netlify | `VITE_API_BASE_URL` = URL des Backends |
| Backend | Render (`render.yaml`) | `MONGODB_URI` |

Beide hängen am selben Repository und bauen bei einem Push unabhängig
voneinander. `VITE_API_BASE_URL` wird **zur Buildzeit** ins Bundle geschrieben —
wird sie nachträglich geändert, ist ein neuer Build nötig, ein Neustart genügt
nicht.

## Fehlersuche

**`GET /health`** am Backend beantwortet die meisten Fragen im Klartext: ob die
Datenbank steht, als welcher Benutzer verbunden wird (Passwort maskiert), welche
Organisationen existieren und was zu tun ist.

| Symptom | Ursache |
|---|---|
| `bad auth : authentication failed` | Benutzer oder Passwort in `MONGODB_URI` falsch. In Atlas unter **Database Access** prüfen — die Konto-E-Mail ist kein Datenbank-Benutzer. Sonderzeichen im Passwort URL-kodieren. |
| `querySrv ECONNREFUSED` | Das lokale Netz lässt keine SRV-Abfragen zu. Statt `mongodb+srv://` die Shard-Hosts direkt angeben. |
| `404 Organisation … nicht gefunden` | Datenbank erreichbar, aber leer — `npm run server:seed` ausführen. |
| Oberfläche zeigt „Verbindung zum Server fehlgeschlagen" | Backend nicht erreichbar, oder `VITE_API_BASE_URL` fehlte beim Build. |
| Erster Aufruf dauert 20–30 Sekunden | Render Free schläft nach 15 Minuten Ruhe ein. |

## Stand

Prototyp. Es gibt **keine Authentifizierung** — wer den Organisations-Slug kennt,
erreicht `/admin` und `/staff`. Der Slug steht in jedem QR-Code. Vor dem Einsatz
mit echten Kundendaten ist das zu schließen; weitere bekannte Lücken stehen in
`CLAUDE.md`.
