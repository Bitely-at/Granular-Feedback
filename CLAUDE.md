# Bitely — Arbeitskontext

> Neu auf diesem Rechner? `WEITERMACHEN.md` zuerst lesen: was nicht im
> Repository liegt (`server/.env`), wo das Projekt steht und was ansteht.

Item-basiertes Feedback für Restaurants. Gäste scannen einen QR-Code am Tisch,
bewerten die Gerichte ihrer Bestellung einzeln und erhalten dafür Punkte.

## Aufbau

```
src/app/App.tsx      Gesamte Oberfläche in einer Datei (~3600 Zeilen):
                     GuestApp, WaiterApp, AdminApp, Routing
src/app/store.tsx    Zustand + API-Aufrufe (React Context, kein Redux)
server/src/index.ts  Express-API, alle Routen
server/src/db.ts     Mongo-Verbindung, Indizes, Migrationen
server/src/ai.ts     Wochenrückblick und Bon-Scan (Claude), je mit Notausgang
server/src/reviewText.ts  Rezensionstext für den Gast, mit Vorlage als Notausgang
server/src/seed.ts   Demo-Daten
scripts/             Verifikationsskripte
```

**Mandantenfähig:** Jede Organisation hat eine eigene Datenbank
(`bitely_org_<slug>`); die Registry liegt in `bitely_platform.organizations`.
Alle Routen laufen unter `/api/:orgSlug/*`, aufgelöst von `resolveOrg`.

**Ein Zustandsobjekt, eingegrenzt auf eine Filiale:** Fast jede schreibende
Route antwortet mit `getFullState(db, branchId)`. Die Oberfläche ersetzt ihren
Zustand damit vollständig und rät nie lokal. Die Reichweite bestimmt `scopeOf(req)`
— Filiale aus dem Pfad, sonst die Bindung des Kontos, `null` = ganze Kette (nur
Ketten-Admin). Wer eine neue Route baut, hält sich daran.

## Befehle

```bash
npm run dev              # Frontend, Port 5173
npm run server:dev       # Backend, Port 4000
npm run server:seed      # Demo-Daten anlegen
npm run check-db --prefix server   # Verbindung prüfen, Klartext-Diagnose
npm run verify:tables    # 17 Ablauf-Tests gegen laufenden Server
npm run verify:admin     # 30 Tests für Menü-, Gutschein- und Filialverwaltung
npm run verify:redemptions   # Tests für die Gutschein-Einlösung: entwerten,
                             # Ausgabe eintragen, Nebenläufigkeit
npm run verify:guests    # 39 Tests für die Gastkonten
npm run build            # Produktionsbuild
```

Typecheck Server: `cd server && npx tsc --noEmit`. Das Root-Projekt hat kein
eigenes TypeScript — für Frontend-Typechecks den Compiler aus `server/` nehmen:

```bash
./server/node_modules/.bin/tsc --noEmit --jsx react-jsx --esModuleInterop \
  --skipLibCheck --moduleResolution bundler --module esnext --target es2020 \
  --strict src/app/store.tsx src/app/App.tsx
```

Die eine Meldung zu `import.meta.env` ist erwartbar (Vite-Typen fehlen dieser
Ad-hoc-Konfiguration), alles andere ist echt. `npm run build` (Vite/esbuild)
prüft **keine** Typen, nur Syntax — ein fehlender React-Import fällt dort nicht auf.

## Tisch-Lebenszyklus

Das Herzstück. **Zwei** Zustände, und `orderId` trägt die Identität der
laufenden Bestellung:

```
frei ──(Kellner bucht)──> offen
  ^                         |
  └──(Gast bewertet ODER Kellner gibt frei ODER zwei Stunden vergehen)──┘
```

- `offen` heißt: es liegt eine Bestellung an, deren Bewertung noch aussteht.
  `frei` heißt: nichts offen. Mehr braucht der Personalbildschirm nicht.
- Ein dritter Zustand `abgeschlossen` ("bewertet und abgeräumt") ist entfallen:
  er beschrieb einen Tisch ohne Positionen — also dasselbe wie `frei` —, ließ
  aber frisch bewertete Tische als "fertig" stehen, bis jemand sie ausdrücklich
  schloss. `db.ts` stellt Altbestand um.
- `orderId` wird gesetzt, sobald das erste Gericht gebucht wird, und auf `null`
  zurückgesetzt, sobald bewertet oder geschlossen wurde. `null` heißt: keine
  offene Bestellung.
- **Bewerten räumt ab**: `items: []`, sonst zeigt der QR-Link dieselbe
  Bestellung erneut.
- **Ein Tisch gehört den Gästen, die gerade daran sitzen.** Der Knopf in der
  Kellner-App heißt deshalb „Neue Gäste" und nicht „schließen" — er beschreibt
  den Moment, in dem jemand ihn drückt. Wird er vergessen, gibt
  `releaseStaleTables` den Tisch nach `TABLE_TTL_MS` (zwei Stunden) von selbst
  frei; wie beim Verfall der Einlösungen ohne Hintergrundjob, wer als Erster
  den Zustand lädt, räumt ab.
- **Das Seed-Skript legt alle Tische leer an.** Erfundene Bestellungen ließen
  beim Vorführen nicht auseinanderhalten, was gerade gebucht wurde und was aus
  dem Seed stammt — und wer den QR-Code eines solchen Tisches scannte, sollte
  Gerichte bewerten, die nie jemand bestellt hat.
- **Doppelbewertungs-Schutz liegt in der Datenbank**, nicht im Handler: ein
  eindeutiger Index auf `reviews.orderId`. Er ist *partiell*
  (`partialFilterExpression: { orderId: { $exists: true } }`), damit Bewertungen
  aus der Zeit vor diesem Feld ihn nicht verletzen.
- Die Bewertung wird **vor** ihren Nebenwirkungen geschrieben (Sterne, Alarme,
  Punkte). Umgekehrt würde eine abgelehnte Doppelabgabe die Statistik
  verfälschen.

## Gastkonten

Der Gast hat ein eigenes Konto (`guests`) — Punkte und eingelöste Gutscheine
hängen daran. Vorher teilten sich **alle** Gäste ein Profil
(`guestProfile._id: 'default'`): jeder sah denselben Punktestand und dieselben
Gutscheine als verbraucht.

- **Bewerten bleibt ohne Konto möglich.** Der QR-Code am Tisch wäre sonst
  wertlos. Ohne Anmeldung gibt es nur keine Punkte: die Antwort auf die
  Bewertung trägt `pointsEarned: 0` **und** `pointsPossible`, damit die
  Oberfläche sagen kann, worum es geht.
- **Einlösen setzt ein Konto voraus** (401). Ohne Konto gäbe es niemanden,
  dem die Punkte abgezogen werden.
- **Die Ansicht bestimmt, welches Token mitgeht** (`audience` am `StoreProvider`):
  Gastansicht = Gastkonto, Kellner/Admin = Mitarbeiterkonto. Der Header trägt nur
  eines. Wer den Admin offen hat und daneben den QR-Code am eigenen Handy öffnet,
  hat BEIDE im Browser — ging dabei das Personal-Token mit, sah der Server kein
  Gastkonto: die Anmeldung wirkte folgenlos und Bewertungen brachten keine Punkte.
- **Punkte lassen sich nachträglich sichern.** Wer ohne Konto bewertet, bekommt in
  der Antwort ein signiertes Ticket (`signPointsTicket`, 30 Minuten). Meldet er
  sich danach an, löst die Oberfläche es über `POST /guest/claim-points` ein. Die
  Bewertungs-ID allein wäre kein Beleg — sie steht für jeden lesbar im
  Gesamtzustand. Einmaligkeit steckt im Update-Filter: nur wer die Bewertung noch
  mit `guestId: null` vorfindet, bekommt die Punkte.
- **Zwei Token-Arten, streng getrennt.** Das Gast-Token trägt `kind: 'guest'`
  und fällt in `verifyToken` durch; das Personal-Token fällt in
  `verifyGuestToken` durch. Ohne diese Trennung wäre ein Gastkonto eine
  Hintertür in die Kellner- und Adminrouten. Es liegt unter
  `bitely.guest.<orgSlug>` im `localStorage`, getrennt vom Personal-Token, und
  hält 90 Tage.
- **Zwei Wege hinein:** E-Mail mit Passwort und Google. Zusammengeführt wird
  über die E-Mail — wer erst ein Passwort hatte und später Google nimmt, behält
  sein Konto samt Punkten.
- **Google prüft der Server** (`googleAuth.ts`): Signatur gegen Googles
  öffentliche Schlüssel, Aussteller, Empfänger (`aud` muss die eigene
  Client-ID sein) und Ablauf. Ohne diese Prüfungen wäre "melde mich als
  beliebige E-Mail an" ein einzelner HTTP-Aufruf. Der Grund einer Ablehnung
  steht im Log, nicht in der Antwort.
- **Die Client-ID kommt aus `GET /guest/auth-options`**, nicht aus dem
  Frontend-Build: als `VITE_`-Variable müsste Netlify für jede Änderung neu
  bauen. Ist `GOOGLE_CLIENT_ID` nicht gesetzt, erscheint der Google-Knopf gar
  nicht erst.
- `DELETE /guest/me` löscht das eigene Konto; abgegebene Bewertungen bleiben,
  sie hängen am Tisch und sind für das Restaurant die eigentliche Substanz.
  Der Weg dorthin ist der Bildschirm **„Dein Konto"**, erreichbar über die
  Gutscheinseite: Punkte, eingelöste Gutscheine, Abmelden, Löschen. Ohne ihn
  gab es die Route zwar, aber keine Tür.

## Gutschein-Einlösung

Ein zweiter Lebenszyklus, mit eigener Sammlung `redemptions`. Der Wisch des
Gastes **entwertet sofort und endgültig**: Punkte abgebucht, Gutschein
verbraucht. Danach zeigt er den vierstelligen Code der Servicekraft, die die
Ausgabe in IHRER App einträgt — der Code muss nur den Abgleich mit bloßem Auge
überstehen.

```
(Gast wischt) ──> entwertet ──(Servicekraft trägt die Ausgabe ein)──> eingelöst
```

- **Ein Screenshot bringt nichts, weil er dasselbe kostet** wie der echte Wisch,
  nicht weil er beim Personal keinen Eintrag erzeugt. Vorher hing der Schutz an
  einer 60-Sekunden-Frist mit Quittung; die setzte den Gast unter Zeitdruck für
  etwas, das er nicht in der Hand hat — ob gerade jemand am Tisch vorbeikommt.
- **Es gibt keinen Rückweg**: keine Abbruch-Route, keinen Verfall. Er wäre genau
  die Lücke, über die derselbe Gutschein zweimal gälte.
- **Die Regeln liegen im Update-Filter**, wie beim Doppelbewertungs-Schutz. Beim
  Abbuchen `points >= Preis` **und** `redeemed: { $ne: voucherId }`; beim
  Eintragen `status: { $in: ['entwertet', 'offen'] }`. Die Prüfungen davor sind
  Diagnose für eine gute Fehlermeldung, kein Schutz — sie lagen im Prüflauf
  messbar zu früh (zwei gleichzeitige Wische buchten doppelt ab).
- **Den Code bekommt nur, wer ihn braucht** (`serializeRedemption`): das Personal
  zum Abgleich, und der Gast für seine EIGENEN Entwertungen. So darf er den
  Bildschirm schließen, ohne die Zahl zu verlieren, die er vorzeigen muss — und
  ein Fremder liest nicht mit, was am Nebentisch auf dem Handy steht.
- **Altbestand**: `offen`, `verfallen` und `abgebrochen` stammen aus der Zeit der
  Frist und entstehen nicht mehr neu. `expireStaleRedemptions` räumt sie
  weiterhin beim Laden des Zustands ab — kein Hintergrundjob, wer als Erster
  hinsieht, räumt auf.
- Eingelöst wird in einer Filiale: die Route liegt unter `/branches/:branchSlug/`,
  und ein Gutschein mit `branchIds` gilt nur dort.

## Gestaltung der Gastansicht

Der Maßstab ist die gedruckte Speisekarte, nicht die Umfrage: eine einzige
Akzentfarbe, sonst Weiß, Grau und Schwarz; durchgehende Blöcke von Rand zu Rand
statt schwebender Karten; keine Tab-Leiste, keine Attrappen. Der
Startbildschirm trägt ein vollflächiges Titelbild (`coverImage` aus den
Marken-Einstellungen), das nach unten in den Hintergrund ausläuft, darüber eine
44-Pixel-Schlagzeile mit dem Namen des Lokals. Fehlt das Bild, bleibt eine
Fläche in der Akzentfarbe stehen.

Die Fußzeile „POWERED BY bitely" steht auf dem ersten und dem letzten
Bildschirm. Sie ist der Grund, warum oben keine Bitely-Leiste mehr hängt: den
Bildschirm besitzt das Restaurant, wir stehen im Fuß.

Die ausführliche Fassung mit allen Maßen steht in `design-gastansicht.md` —
vor Änderungen an der Gastansicht dort nachsehen.

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
- `resolveTableNumberConflicts` fasst **bestehende Nummern nicht an** — auch
  Lücken (1–13, 16–25) bleiben. Vorher waren die Nummern organisationsweit
  eindeutig, also je Filiale erst recht; für den Index ist nichts zu tun. Aus
  Tisch 25 kommentarlos Tisch 23 zu machen, würde nur App und beschriftete
  Tische auseinanderlaufen lassen. Angefasst wird ausschließlich dieselbe
  Nummer zweimal in derselben Filiale.

Woher die Filiale kommt: Gast aus der URL, Servicekraft und Filialleitung aus
dem Konto (`branchId`), Ketten-Admin aus dem Umschalter oben.

## Was der Zustand zeigt

`GET /state` liefert **nur die angefragte Filiale** — die Oberfläche filtert
nicht, sie bekommt Fremdes gar nicht erst:

```
/state?branch=<slug>   diese Filiale
/state?branch=all      alle (nur Konten OHNE feste Filiale)
/state                 der Server entscheidet anhand des Kontos
```

- **Anonym ohne `?branch` gibt 400.** Ein stiller Rückfall auf „alles" würde die
  Filialtrennung mit einem weggelassenen Parameter aushebeln.
- Im Frontend heißt „der Server soll entscheiden" `scope: 'self'` (siehe
  `BranchScope` in `store.tsx`). Das löst das Henne-Ei-Problem beim Seitenaufruf:
  ob jemand an eine Filiale gebunden ist, weiß nur der Server.
- **Filialgetrennt:** Tische, Bewertungen, Alarme, Gerichtsschnitte, welche
  Gerichte geführt und welche Gutscheine eingelöst werden können.
  **Kettenweit:** Branding, Stammdaten der Gerichte, Punkte des Gasts,
  Filialliste.
- **`branchIds: null` heißt „überall"** — bewusst nicht dasselbe wie eine Liste
  mit allen Filialen: nur so gilt eine später angelegte Filiale automatisch mit.
  Der Verfügbarkeits-Schalter löst die Kurzform beim Abwählen in eine
  ausdrückliche Liste auf und faltet sie beim Wiedereinschalten zurück.
- Wer die Verfügbarkeit verwaltet (Admin/Manager), bekommt über `fullMenu` in
  `getFullState` **alle** Gerichte — auch die abgeschalteten. Sonst könnte er
  sie nie wieder einschalten. Gast und Kellner sehen nur die geführten.
- **Gerichtsbewertungen liegen in `ratingsByBranch`**, weil sich die Qualität je
  Filiale unterscheidet. Am Draht heißt es weiterhin `ratingsSum`/`ratingsCount`
  — `serializeDish` rechnet sie auf die angefragte Filiale herunter oder
  summiert für den Ketten-Blick. Die Oberfläche merkt davon nichts.

## KI-Funktionen

Drei Stellen fragen ein Modell (`claude-opus-5`, SDK `@anthropic-ai/sdk`):
der **Rezensionstext** auf dem Dank-Bildschirm (`reviewText.ts`), der
**Wochenrückblick** im Dashboard und der **Bon-Scan** der Servicekraft
(beide `ai.ts`).

- **Jede hat einen Notausgang.** Ohne `ANTHROPIC_API_KEY` — und bei jedem
  Fehler der Schnittstelle — greift beim Rezensionstext und beim Rückblick eine
  aus den Zahlen gerechnete Vorlage; der Bon-Scan antwortet mit 503 und sagt,
  dass er nicht eingerichtet ist. Eine Vorführung ohne Schlüssel bleibt damit
  vollständig benutzbar, und kein Ausfall der Schnittstelle kann eine Bewertung
  verhindern.
- **Was das Modell liefert, ist Vorschlag, nicht Wahrheit.** Der Bon-Scan
  akzeptiert nur Gericht-IDs aus der übergebenen Karte und begrenzt die Menge —
  dieselbe Regel wie bei jeder anderen Eingabe von außen. Gebucht wird nichts
  automatisch: die erkannten Gerichte landen im Warenkorb der Servicekraft.
- **Der Rezensionstext hängt an einem signierten Ticket** (`signReviewTicket`,
  30 Minuten), nicht an der Bewertungs-ID. Die steht für jeden lesbar im
  Gesamtzustand — ohne Ticket könnte jeder für jede fremde Bewertung
  Modellaufrufe auslösen. Erzeugt wird er **nach** dem Absenden, nicht darin:
  sonst wartet der Gast Sekunden vor einem hängenden „Wird gesendet…".
  Der fertige Text wird an der Bewertung abgelegt — Neuladen gibt denselben.
- **Der Wochenrückblick liegt in `settings._id: 'insights'`**, je Reichweite
  (Filial-ID oder `'all'`) einmal, und wird erneuert, wenn er älter als einen
  Tag ist. Ein Rückblick, der sich bei jedem Neuladen ändert, liest sich wie
  ein Zufallstext — und kostet jedes Mal. Erzeugt wird er in einer eigenen
  Route (`POST /insights/highlight`), damit das Dashboard sofort steht.

## Dashboard-Auswertung

`GET /insights?from=&to=` (branchAdmin) rechnet in einem Durchgang über die
Bewertungen: Summen, Wochenkübel, Gerichtsschnitte, Sammelurteile.

- **Warum nicht aus dem Gesamtzustand:** der trägt nur die letzten 100
  Bewertungen (`REVIEW_PAGE_SIZE`). Für einen Wochenverlauf und einen
  Zeitraumfilter reicht das nicht — und umgekehrt gehört diese Rechnerei nicht
  in jeden Seitenaufruf des Gastes.
- Begrenzt auf 5000 Bewertungen je Lauf (`INSIGHT_REVIEW_CAP`); die Antwort
  sagt mit `totals.capped`, wenn die Grenze griff.
- Die Trennlinien der Gerichts-Matrix sind der **Median**, keine festen Werte.
  Vorher standen dort 3,7 Sterne und 55 Rezensionen — bei einem Lokal mit 40
  Bewertungen lag damit ausnahmslos alles im selben Feld.

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
- Backend: Render (`bitely-api`), braucht `MONGODB_URI` und `JWT_SECRET`.
- **KI-Funktionen** brauchen `ANTHROPIC_API_KEY` auf dem Server. Ohne den
  laufen Rezensionstext und Wochenrückblick auf gerechneten Vorlagen und der
  Bon-Scan meldet, dass er nicht eingerichtet ist — alles andere unverändert.
  Kein neuer Frontend-Build nötig.
- **Google-Anmeldung für Gäste** braucht `GOOGLE_CLIENT_ID` auf dem Server —
  eine OAuth-Client-ID vom Typ *Web* aus der Google Cloud Console, mit der
  Frontend-Adresse unter "Authorized JavaScript origins" (Netlify-Domain und
  `http://localhost:5173`). Ist sie nicht gesetzt, bleibt der Google-Knopf aus
  und E-Mail mit Passwort funktioniert weiterhin. Kein neuer Frontend-Build
  nötig: die ID kommt über `GET /guest/auth-options`.
- `GET /health` sagt im Klartext, ob die Datenbank steht, als welcher Benutzer
  verbunden wird (Passwort maskiert) und was zu tun ist.
- **`GET /version` sagt, welcher Stand läuft** (Commit, Branch, Startzeit).
  Ohne das ist "ist der Deploy durch?" Rätselraten über 404er.
- **Optionale Umgebungsvariablen gehören ins Render-Dashboard, nicht in
  `render.yaml`.** Eine neu hinzugefügte Variable mit `sync: false` hält den
  Blueprint-Abgleich an, bis jemand den Wert von Hand bestätigt — und solange
  geht **kein** Deploy mehr durch, während `/health` weiter fröhlich "ok"
  meldet. Genau so lief das Backend einmal drei Commits hinterher.
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
  in `index.ts` umschließt jeden geschützten Handler. Die Prüfung in `OrgChrome`
  versteckt nur, sie schützt nicht.

Drei Rollen, und der Manager ist **Filialleitung**, nicht kleiner Admin:

| | `chainAdmin` | `branchAdmin` | `staffOrAdmin` |
|---|---|---|---|
| | Admin | Admin, Manager | + Kellner |
| Filialen, Branding, Stammkarte, Gutscheine | ✅ | ❌ | ❌ |
| Tische/QR + Verfügbarkeit der eigenen Filiale, Benutzer | ✅ | ✅ | ❌ |
| Bestellung buchen, Tisch freigeben, Alarm | ✅ | ✅ | ✅ |

Die Filialleitung sieht das Menü, ändert dort aber nur den
Verfügbarkeits-Schalter — Name, Preis und Foto gehören der Kette.

Der Manager darf nur **Kellner** und nur in der **eigenen** Filiale anlegen —
sonst wäre die Rollentrennung mit einer Einladung ausgehebelt (`POST /users`).
- `requireAuth` umschließt den Handler, statt eigene Middleware zu sein — der
  zentrale Promise-Patch unten in `index.ts` gilt nur für **einen** Handler
  pro Route, ein zweites Argument fiele weg.
- `passwordHash` darf nie in eine Antwort geraten: dafür `serializeUser()`
  statt `serialize()`. `users` steckt im Gesamtzustand, den auch der Gast lädt.

`JWT_SECRET` muss in `server/.env` stehen (und in Render), sonst startet der
Server nicht. Test-Zugänge legt `npm run server:seed` an und gibt sie aus.

Punkte eines Gastkontos setzt `npm run guest-points --prefix server -- <e-mail>
<punkte>` (ohne Argumente: alle Gastkonten). Bewusst ein Werkzeug auf der
Kommandozeile und **keine** Route — ein Endpunkt, der Punkte vergibt, wäre
genau die Hintertür, gegen die der Einlöse-Ablauf abgesichert ist.

Passwörter vergibt sonst nur `npm run set-password --prefix server -- <e-mail>
<passwort>` — für eingeladene Konten und für vergessene. Ohne Argumente listet
es die Konten der Organisation samt Anmeldefähigkeit auf. Eine gewachsene
Datenbank kennt womöglich andere E-Mails als das Seed-Skript; die
Prüfskripte nehmen dafür `ADMIN_EMAIL`/`ADMIN_PASSWORD` aus der Umgebung.

## Bekannte Lücken

CORS offen, keine Ratenbegrenzung — weder auf `/auth/login` noch auf
`/guest/login` und `/guest/register`. Gastkonten haben
kein "Passwort vergessen" (dafür bräuchte es Mailversand) und kein Bestätigen
der E-Mail; wer über Google kommt, hat beides von dort.

Die alte Sammlung `guestProfile` (das von allen Gästen geteilte Profil) bleibt
als Bestandsdaten liegen — sie wird nirgends mehr gelesen. Einlösungen aus
dieser Zeit tragen `guestId: 'default'`; für die gibt es nichts zurückzubuchen
(siehe `refundGuest`). Zurückgebucht wird ohnehin nur noch Altbestand — der
Wisch von heute ist endgültig.

**Kein Filialpreis.** Eine Filiale kann ein Gericht führen oder nicht, aber
nicht zu einem anderen Preis anbieten. Nachrüstbar, indem `branchIds` von einer
Liste auf eine Zuordnung Filiale → Preis umgebaut wird.

**Passwort-Vergabe nur auf der Kommandozeile.** In der Oberfläche gibt es
keinen Weg, einem eingeladenen Konto sein erstes Passwort zu geben — dafür
`set-password` (siehe oben).
