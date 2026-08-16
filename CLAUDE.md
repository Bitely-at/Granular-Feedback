# Bitely — Arbeitskontext

Item-basiertes Feedback für Restaurants. Gäste scannen einen QR-Code am Tisch,
bewerten die Gerichte ihrer Bestellung einzeln und erhalten dafür Punkte.

## Aufbau

```
src/app/App.tsx      Gesamte Oberfläche in einer Datei (~2200 Zeilen):
                     GuestApp, WaiterApp, AdminApp, Routing
src/app/store.tsx    Zustand + API-Aufrufe (React Context, kein Redux)
server/src/index.ts  Express-API, alle Routen
server/src/db.ts     Mongo-Verbindung, Indizes, Migrationen
server/src/seed.ts   Demo-Daten
scripts/             Verifikationsskripte
```

**Mandantenfähig:** Jede Organisation hat eine eigene Datenbank
(`bitely_org_<slug>`); die Registry liegt in `bitely_platform.organizations`.
Alle Routen laufen unter `/api/:orgSlug/*`, aufgelöst von `resolveOrg`.

**Ein Zustandsobjekt:** Fast jede schreibende Route antwortet mit
`getFullState(db)` — dem kompletten Zustand der Organisation. Die Oberfläche
ersetzt ihren Zustand damit vollständig und rät nie lokal. Wer eine neue Route
baut, hält sich daran.

## Befehle

```bash
npm run dev              # Frontend, Port 5173
npm run server:dev       # Backend, Port 4000
npm run server:seed      # Demo-Daten anlegen
npm run check-db --prefix server   # Verbindung prüfen, Klartext-Diagnose
npm run verify:tables    # 17 Ablauf-Tests gegen laufenden Server
npm run verify:admin     # 30 Tests für Menü-, Gutschein- und Filialverwaltung
npm run build            # Produktionsbuild
```

Typecheck Server: `cd server && npx tsc --noEmit`. Das Root-Projekt hat kein
eigenes TypeScript — für Frontend-Typechecks den Compiler aus `server/` nehmen.
`npm run build` (Vite/esbuild) prüft **keine** Typen, nur Syntax.

## Tisch-Lebenszyklus

Das Herzstück. Drei Zustände, und `orderId` trägt die Identität der laufenden
Bestellung:

```
frei ──(Kellner bucht)──> offen ──(Gast bewertet)──> abgeschlossen
  ^                         |                              |
  └────(Kellner schließt)───┴──────────────────────────────┘
```

- `orderId` wird gesetzt, sobald das erste Gericht gebucht wird, und auf `null`
  zurückgesetzt, sobald bewertet oder geschlossen wurde. `null` heißt: keine
  offene Bestellung.
- **Bewerten räumt ab**: `items: []`, sonst zeigt der QR-Link dieselbe
  Bestellung erneut.
- **Doppelbewertungs-Schutz liegt in der Datenbank**, nicht im Handler: ein
  eindeutiger Index auf `reviews.orderId`. Er ist *partiell*
  (`partialFilterExpression: { orderId: { $exists: true } }`), damit Bewertungen
  aus der Zeit vor diesem Feld ihn nicht verletzen.
- Die Bewertung wird **vor** ihren Nebenwirkungen geschrieben (Sterne, Alarme,
  Punkte). Umgekehrt würde eine abgelehnte Doppelabgabe die Statistik
  verfälschen.

## Filialen und Tischnummern

**Eine Tischnummer ist nur innerhalb ihrer Filiale eindeutig.** Tisch 5 in
Filiale A und Tisch 5 in Filiale B sind verschiedene Tische mit verschiedenen
QR-Codes. Jede Filiale zählt ab 1.

- Getragen von einem eindeutigen Index `{ branchId, number }` (`db.ts`) — wie
  beim Doppelbewertungs-Schutz liegt die Regel in der Datenbank, nicht im
  Handler.
- **Eine Nummer allein adressiert nichts.** Jede Route, die einen Tisch per
  Nummer anspricht, liegt unter `/branches/:branchSlug/tables/:number` und
  läuft durch `withBranch`. Wer eine neue baut, hält sich daran; `findTableInBranch`
  statt `findOne({ number })`.
- `withBranch` setzt zugleich die Filialbindung der Servicekraft durch: ein
  Konto mit `branchId` kommt über eine fremde URL nicht in eine andere Filiale.
- QR-Route: `/<org>/<filiale>/table/<nummer>`. Die alte filiallose Form ist
  abgeschaltet und zeigt eine eigene Meldung — **kein Redirect**, weil ohne
  Filiale nicht entscheidbar ist, welcher Tisch 5 gemeint ist.
- Die Migration in `renumberTablesPerBranch` nummeriert Altbestand pro Filiale
  auf 1…n. Sie läuft in **zwei** Durchgängen über negative Zwischennummern:
  direkt zugewiesen (Tisch 7 → 5, während 5 noch belegt ist) würde sie
  unterwegs am eindeutigen Index scheitern.

Woher die Filiale kommt: Gast aus der URL, Servicekraft aus dem Konto
(`branchId`), Admin/Manager ohne feste Filiale aus dem Umschalter oben.

## Fallstricke

**Express 4 fängt keine abgelehnten Promises.** Die Verb-Methoden des Routers
sind in `index.ts` einmal zentral gepatcht, damit jede Route Fehler an `next()`
weitergibt. Ohne das bleibt eine Anfrage bei einem DB-Fehler ohne Antwort
hängen. Neue Routen brauchen kein eigenes `try/catch`.

**Eingaben prüfen.** `/api` ist öffentlich erreichbar. Was per `$inc` in die
Datenbank wandert, muss begrenzt sein — `requireStars`, `requireQty`,
`requireObjectId` in `index.ts`. Ein `stars: 1000` verschiebt sonst den
Durchschnitt eines Gerichts dauerhaft.

**Kein `flex-1` + `justify-center` in einem `overflow-y-auto`-Container.**
Sobald der Inhalt höher wird als der Container, zentriert der Browser über beide
Ränder hinaus: man scrollt durch Leerraum und kommt an den Anfang nicht mehr
heran. Stattdessen: außen scrollen, innen `min-h-full` zentrieren.

**Löschen räumt mit auf.** Ein gelöschtes Gericht wird auch aus den laufenden
Bestellungen gezogen (sonst hinge es unbewertbar auf dem Tisch); ein Tisch, der
dadurch leer wird, geht zurück auf `frei`. Eine Filiale mit Tischen lässt sich
nicht löschen — die QR-Codes hängen daran und sind womöglich schon gedruckt.
Die letzte Filiale bleibt immer stehen, weil neue Tische sonst nirgends mehr
angelegt werden könnten.

**Zustand nie lokal kopieren.** `activeTable` im Kellner war eine Kopie und
zeigte nach dem Speichern veraltete Daten. Immer aus `store.tables` ableiten.

**SRV-Auflösung schlägt auf diesem Rechner fehl** (`querySrv ECONNREFUSED`) —
Node fragt Nameserver direkt, die verweigern. Deshalb steht in der lokalen
`server/.env` die SRV-freie Form mit den drei Shard-Hosts. In Render funktioniert
der normale `mongodb+srv`-String.

## Betrieb

- Frontend: Netlify (`bitelyvienna`), braucht `VITE_API_BASE_URL` **zur
  Buildzeit** — nachträglich gesetzt erfordert einen neuen Build.
- Backend: Render (`bitely-api`), braucht `MONGODB_URI`.
- `GET /health` sagt im Klartext, ob die Datenbank steht, als welcher Benutzer
  verbunden wird (Passwort maskiert) und was zu tun ist.
- Render Free schläft nach 15 Minuten; erster Aufruf danach 20–30 Sekunden.

## Sprache

Code-Kommentare, Oberfläche und Fehlermeldungen auf Deutsch. Commit-Nachrichten
auf Englisch.

## Anmeldung und Rollen

`/admin` und `/staff` verlangen ein Mitarbeiterkonto. Die Gastansicht bleibt
offen — der Gast hat bewusst kein Konto, sonst funktioniert der QR-Code am
Tisch nicht.

- **Token**: signiert in `auth.ts` (HMAC-SHA256, 12 Stunden gültig), liegt im
  `localStorage` unter `bitely.token.<orgSlug>` und geht als
  `Authorization: Bearer` mit. Pro Mandant getrennt, und das Token trägt den
  `orgSlug` — eines aus Organisation A greift in B nicht.
- **Passwörter**: `crypto.scrypt` mit Salt pro Passwort, keine externe
  Abhängigkeit. `passwordHash: null` heißt *eingeladen, kann sich nicht
  anmelden*.
- **Rechte liegen auf dem Server**, nicht in der Oberfläche: `requireAuth(...)`
  in `index.ts` umschließt jeden geschützten Handler. `adminOnly` = Admin +
  Manager, `staffOrAdmin` = zusätzlich Kellner. Die Prüfung in `OrgChrome`
  versteckt nur, sie schützt nicht.
- `requireAuth` umschließt den Handler, statt eigene Middleware zu sein — der
  zentrale Promise-Patch unten in `index.ts` gilt nur für **einen** Handler
  pro Route, ein zweites Argument fiele weg.
- `passwordHash` darf nie in eine Antwort geraten: dafür `serializeUser()`
  statt `serialize()`. `users` steckt im Gesamtzustand, den auch der Gast lädt.

`JWT_SECRET` muss in `server/.env` stehen (und in Render), sonst startet der
Server nicht. Test-Zugänge legt `npm run server:seed` an und gibt sie aus.

## Bekannte Lücken

Ein geteiltes Gastprofil für alle Gäste (`guestProfile._id: 'default'`), kein
Auto-Close nach 30 Minuten, CORS offen, keine Ratenbegrenzung (auch nicht auf
`/auth/login`). Passwort-Vergabe für eingeladene Benutzer fehlt noch — bis dahin
vergibt nur das Seed-Skript Passwörter.

**Filial-Scoping ist nur bei den Tischen fertig.** Tischliste, Zähler, Anlage,
QR-Codes und die Kellneransicht hängen an der Filiale. Dashboard, Bewertungen
und Menü sind weiterhin organisationsweit — deshalb steht auf dem Dashboard
bewusst „alle Filialen" statt eines Filialnamens, der eine Filterung behaupten
würde, die es nicht gibt.

`getFullState` liefert weiterhin **alle** Tische aller Filialen; gefiltert wird
in der Oberfläche. Für die Mandantentrennung ist das ohne Belang (jede
Organisation hat ihre eigene Datenbank), innerhalb einer Organisation sieht eine
Servicekraft aber die Tischdaten fremder Filialen, wenn sie die Antwort direkt
ausliest. Schreiben kann sie dort nichts — das verhindert `withBranch`.
