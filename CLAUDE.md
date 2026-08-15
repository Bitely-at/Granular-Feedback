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

## Bekannte Lücken

Keine Authentifizierung (`/admin` und `/staff` sind öffentlich), ein geteiltes
Gastprofil für alle Gäste (`guestProfile._id: 'default'`), keine Menü-,
Gutschein- oder Filialverwaltung, kein Auto-Close nach 30 Minuten, CORS offen,
keine Ratenbegrenzung.
