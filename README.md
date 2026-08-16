# Bitely

Item-basiertes Feedback für Restaurants. Gäste scannen einen QR-Code am Tisch
und bewerten die Gerichte ihrer Bestellung **einzeln** — nicht das Lokal als
Ganzes. Dafür sammeln sie Punkte und Gutscheine. Das Restaurant sieht dadurch
pro Gericht, was funktioniert und was nicht.

## Drei Ansichten

| Ansicht | Route | Wofür |
|---|---|---|
| **Gast** | `/:orgSlug/:branchSlug/table/:number` | Ziel des QR-Codes: Gerichte bewerten, Gesamteindruck, Punkte |
| **Kellner** | `/:orgSlug/staff` | Bestellungen auf Tische buchen, Tische schließen, Alarme bei schlechten Bewertungen |
| **Admin** | `/:orgSlug/admin` | Auswertungen, Bewertungen mit Freitexten, Benutzer, QR-Codes, CSV-Export |

Die Filiale steht im QR-Link, weil Tischnummern nur **pro Filiale** eindeutig
sind: Tisch 5 in der einen ist ein anderer Tisch als Tisch 5 in der anderen.

## Anmeldung

`/staff` und `/admin` verlangen ein Mitarbeiterkonto; die Gastansicht bleibt
offen (am Tisch gibt es kein Konto). Drei Rollen:

| Rolle | Reichweite |
|---|---|
| **Admin** | die ganze Kette — Filialen, Branding, Stammkarte, Gutscheine |
| **Manager** | Filialleitung: nur die eigene Filiale, kein Kettenweites |
| **Kellner** | Tischarbeit in der eigenen Filiale |

`npm run server:seed` legt je einen Test-Zugang an und gibt sie am Ende aus
(Passwort `bitely123`, über `SEED_PASSWORD` änderbar).

## Lokal starten

Voraussetzungen: Node 20+, eine MongoDB (Atlas genügt in der Gratis-Stufe).

```bash
npm install
npm install --prefix server

cp server/.env.example server/.env     # MONGODB_URI und JWT_SECRET eintragen
npm run check-db --prefix server       # Verbindung prüfen
npm run server:seed                    # Demo-Daten und Test-Zugänge anlegen

npm run server:dev                     # Terminal 1 — API auf Port 4000
npm run dev                            # Terminal 2 — Oberfläche auf Port 5173
```

`JWT_SECRET` ist Pflicht — ohne ihn startet der Server nicht. Zufälligen Wert
erzeugen mit:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Danach im Browser: `http://localhost:5173/sakura-sushi/herrengasse/table/4`

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
npm run verify:tables              # Tisch-Lebenszyklus, Rechte, Filialtrennung
npm run verify:admin               # Menü, Gutscheine, Filialen, Rollen
npm run build                      # Produktionsbuild
```

Beide Skripte brauchen einen laufenden Server und melden sich als Admin an
(`ADMIN_EMAIL`/`ADMIN_PASSWORD`, Vorgabe aus dem Seed). Sie **schreiben in die
Datenbank, auf die der Server zeigt**: eigene Testdatensätze werden angelegt und
wieder entfernt, die Bewertungstests erhöhen aber die Sternezähler der
Testgerichte. Für echte Datenbestände vorher auf eine Wegwerf-Organisation
zeigen:

```bash
ORG_SLUG=wegwerf npm run verify:tables
```

## Deployment

| Teil | Dienst | Nötige Variable |
|---|---|---|
| Frontend | Netlify | `VITE_API_BASE_URL` = URL des Backends |
| Backend | Render (`render.yaml`) | `MONGODB_URI`, `JWT_SECRET` |

`JWT_SECRET` erzeugt Render beim ersten Deploy selbst (`generateValue: true`).
Fehlt er, **startet der Dienst nicht** — das ist Absicht, ein geratenes Geheimnis
wäre schlimmer als ein Startfehler.

Nach einem Deploy laufen beim ersten Aufruf automatisch die Migrationen
(`ensureOrgSchema` in `db.ts`): Index für Tischnummern je Filiale,
Gerichtsbewertungen nach Filialen aufgeteilt, `branchIds` nachgetragen.
**Tischnummern bleiben unverändert.**

**Bereits gedruckte QR-Codes aus der Zeit ohne Filiale im Pfad funktionieren
nicht mehr** — die Nummer allein ist nicht mehr eindeutig. Neue erzeugen unter
Admin → Einstellungen → QR-Codes.

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

MVP. Anmeldung, Rollen und Filialtrennung stehen; die Rechte werden
serverseitig erzwungen, nicht nur in der Oberfläche versteckt.

Offen vor dem Einsatz mit echten Kundendaten: eingeladene Benutzer können sich
noch kein Passwort setzen (nur das Seed-Skript vergibt eines), ein geteiltes
Gastprofil für alle Gäste, CORS offen, keine Ratenbegrenzung auf `/auth/login`.
Vollständige Liste in `CLAUDE.md`.
