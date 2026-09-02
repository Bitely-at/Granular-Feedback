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
npm run server:seed      # Demo-Daten für 'sakura-sushi' anlegen

# Neue Organisation (Mandant). Ohne --demo nur das Minimum (Registry, eine
# Filiale, Branding, Ketten-Admin); mit --demo dazu Speisekarte, acht Tische,
# Gutscheine und Demo-Konten. Presets: bistro, pizza, sushi, cafe.
npm run new-org --prefix server -- <slug> "<Name>" <admin-email> [passwort]
npm run new-org --prefix server -- <slug> "<Name>" <admin-email> --demo --kind=pizza

npm run check-db --prefix server   # Verbindung prüfen, Klartext-Diagnose
npm run verify:tables    # 17 Ablauf-Tests gegen laufenden Server
npm run verify:admin     # 30 Tests für Menü-, Gutschein- und Filialverwaltung
npm run verify:redemptions   # Tests für die Gutschein-Einlösung: der Wisch
                             # löst sofort ein, Punkte genau einmal, Rückweg zu
npm run verify:guests    # 39 Tests für die Gastkonten
npm run build            # Produktionsbuild

npm run demo-reviews --prefix server -- 10   # 10 Wochen erfundene Bestellungen
                                             # und Bewertungen (Demo, Screenshots)
npm run demo-reviews --prefix server -- --reset   # ... wieder entfernen
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

## Was der Gast beurteilt

**Gerichte einzeln, dazu genau eine Pauschalfrage: den Service.** Ambiente und
Schnelligkeit sind aus dem Fragebogen entfernt — sie standen zwischen dem Gast
und dem Absenden-Knopf, und nach fünf Gerichten noch drei Pauschalurteile zu
verlangen kostete Abbrüche, ohne dass die Küche daraus etwas macht.

- Das Feld am Draht bleibt dreiteilig (`overall.service/ambience/speed`):
  abgegebene Bewertungen tragen die alten Werte weiter, Neues geht mit 0 mit.
  **0 heißt „nicht beurteilt"** — `collectInsights` und `reviewText.ts` lesen es
  so, und der Rezensionstext erwähnt nur, wonach auch gefragt wurde.
- Was gefragt wird, steht in `OVERALL_FIELDS` (`App.tsx`). Wer dort etwas
  hinzufügt oder wegnimmt, muss nichts weiter anfassen: Fortschrittsbalken und
  Absenden-Sperre zählen über diese Liste, **nicht** über die drei Felder von
  `overall`. Über alle drei zu zählen hieße auf eine Antwort zu warten, nach der
  niemand fragt — der Knopf bliebe für immer aus.

## Bestellungen

`orders` hält fest, dass es eine Bestellung gab — unabhängig davon, ob sie je
bewertet wird. Der Tisch trägt das nicht: er kennt nur die LAUFENDE Bestellung
und vergisst sie beim Freigeben.

- Schlüssel ist `orderId`, dieselbe wie am Tisch und in der Bewertung; ein
  eindeutiger Index trägt die Regel. Nachbuchen lässt den Datensatz wachsen,
  statt einen zweiten anzulegen (Upsert in `recordOrder`).
- **Das Protokollieren darf das Buchen nie scheitern lassen.** `recordOrder`
  schluckt seine Fehler: zwei gleichzeitige Buchungen auf denselben Tisch
  versuchen beide den Einschub, eine verliert am Index — das ist kein Fehler,
  sondern genau der Zweck des Index.
- Wozu: erst `reviews` neben `orders` sagt etwas. 40 Bewertungen sind viel bei
  60 Bestellungen und wenig bei 600. Das Dashboard zeigt daraus die Quote.
- Bestellungen aus der Zeit davor haben keinen Eintrag. Die Quote ist deshalb
  auf 100 % gedeckelt — sonst stünden dort in den ersten Wochen Werte darüber.

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
Gastes **löst sofort und endgültig ein**: Punkte abgebucht, Gutschein
verbraucht, `status: 'eingelöst'`. Danach zeigt der Gast nur noch den Bildschirm
mit dem Häkchen — die Servicekraft sieht die Geste, mehr braucht es nicht.

```
(Gast wischt) ──> eingelöst
```

- **Kein Bestätigen durch die Servicekraft mehr.** Es gab einmal einen
  Zwischenzustand `entwertet` ("Punkte weg, Ausgabe steht aus"), den das Personal
  in seiner App abhakte — samt Banner in der Kellneransicht und Route
  `POST /redemptions/:id/confirm`. Beides ist entfernt: die Punkte sind ohnehin
  schon weg, der Wisch vor Ort erklärt sich selbst, und ein Extra-Klick für die
  Servicekraft brachte nur Reibung. Der Wisch schreibt jetzt direkt `eingelöst`.
- **Ein Screenshot bringt nichts, weil er dasselbe kostet** wie der echte Wisch.
  Vorher hing der Schutz an einer 60-Sekunden-Frist mit Quittung; die setzte den
  Gast unter Zeitdruck für etwas, das er nicht in der Hand hat.
- **Es gibt keinen Rückweg**: keine Abbruch-Route, keinen Verfall. Er wäre genau
  die Lücke, über die derselbe Gutschein zweimal gälte.
- **Die Regel liegt im Update-Filter**, wie beim Doppelbewertungs-Schutz: beim
  Abbuchen `points >= Preis` **und** `redeemed: { $ne: voucherId }`. Die
  Prüfungen davor sind Diagnose für eine gute Fehlermeldung, kein Schutz — sie
  lagen im Prüflauf messbar zu früh (zwei gleichzeitige Wische buchten doppelt
  ab).
- **Der Code wird nirgends mehr angezeigt.** Nach dem Wisch sieht der Gast ein
  großes Häkchen; eine vierstellige Zahl bewies nichts und war aus einem Meter
  Entfernung nicht zu lesen. Der Code bleibt als Kennung der Einlösung in der
  Datenbank und im Reporting und geht nur an das Personal
  (`serializeRedemption`) — `redemptions` steckt im Zustand, den auch ein Gast
  lädt.
- **Abgelaufene Gutscheine sieht der Gast nicht.** `voucherExpired` (in
  `store.tsx` für die Anzeige, in `index.ts` für die Einlösung) liest `expiry`
  als deutsches oder ISO-Datum und rechnet gegen das ENDE des genannten Tages —
  „gültig bis 31.12." heißt den 31. über. Was sich nicht lesen lässt, gilt als
  unbefristet: ein Gutschein, der wegen eines Tippfehlers im Datum
  stillschweigend verschwindet, wäre schlimmer als einer, der zu lange gilt.
  Die Regel steht doppelt, weil sie zweierlei bedeutet — im Frontend, was der
  Gast SIEHT, auf dem Server, was er einlösen KANN. Nur das zweite ist Schutz.
  Wichtig ist die Anzeige trotzdem: ein abgelaufener Gutschein konnte vorher als
  „nächste Belohnung" die Punktezahl bestimmen, auf die der Fortschrittsbalken
  zuläuft. In der Verwaltung bleiben abgelaufene sichtbar, aber weggeklappt.
- **Der Wisch gilt für JEDEN Gutschein, auch für einen ohne Punktepreis.** Er
  ist nicht nur eine Sperre gegen den unabsichtlichen Daumen, sondern der
  Vorgang, den die Servicekraft am Tisch zu sehen bekommt: ein Knopf, der
  lautlos ein Häkchen setzt, sieht aus wie ein Screenshot — die Geste nicht.
  Wer hier eine Abkürzung einbaut, nimmt dem Ablauf seinen einzigen sichtbaren
  Beweis.
- **Ein Gast bekommt nur SEINE Einlösungen** (`redemptionScope` in
  `getFullState`); das Personal bekommt alle der Filiale, weil sie ihr
  Arbeitsvorrat sind. Das ist kein Feinschliff: die Gastansicht liest aus den
  Einlösungen, ob für einen Gutschein schon eine Einlösung vorliegt, und
  überspringt dann den Wisch, um dem Gast den vorzuzeigenden Bildschirm
  zurückzugeben. Sah sie fremde Einlösungen, traf das auf einen fremden
  Datensatz zu — der Wisch entfiel, es wurden keine Punkte abgebucht, und ein
  Gutschein, den irgendein Gast gerade eingelöst hatte, war für alle anderen in
  der Filiale gratis. Die Oberfläche prüft zusätzlich auf `guest.loggedIn`, weil
  es einen Weg gibt, auf dem sie NICHT als Gast gilt: wer die Verwaltung im
  selben Browser offen hat und daneben den QR-Code aufruft, schickt nur ein
  Personal-Token mit — und genau so testet man diese App.
- **Altbestand**: `entwertet`, `offen`, `verfallen` und `abgebrochen` entstehen
  nicht mehr neu — `entwertet` war der frühere Zwischenschritt, die drei anderen
  stammen aus der Zeit der Frist. Die Gast- und Verwaltungsansicht behandeln
  `entwertet` wie `eingelöst`; `expireStaleRedemptions` räumt die
  Fristen-Datensätze weiterhin beim Laden des Zustands ab — kein Hintergrundjob,
  wer als Erster hinsieht, räumt auf.
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

**Zwei Schriftfarben sind frei wählbar** (Admin → Design), unabhängig
voneinander: `guestNameColor` für die Zeile „Filiale · Tisch",
`guestTextColor` für Schlagzeile und Fließtext. Leer/`null` = die üblichen
Grau-/Schwarztöne je Hell/Dunkel; die Akzentfarbe bleibt davon unberührt. Die
Marke selbst wird weiterhin über `readableAccent` auf einen lesbaren Kontrast
gebracht, bevor sie als `--ba` in die Gastansicht geht.

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

Drei Stellen fragen ein Modell (SDK `@anthropic-ai/sdk`): der
**Rezensionstext** auf dem Dank-Bildschirm (`reviewText.ts`), der
**Wochenrückblick** im Dashboard und der **Bon-Scan** der Servicekraft
(beide `ai.ts`).

- **Modellwahl nach Kosten.** Rezensionstext und Bon-Scan laufen auf
  `claude-sonnet-5` — beide skalieren mit der Nutzung (Zahl der Bewertungen
  bzw. der Scans), und weder ein kurzer Rezensionstext noch der Abgleich eines
  Bons gegen eine Karte braucht das Spitzenmodell. Der **Wochenrückblick**
  bleibt auf `claude-opus-5`: er läuft höchstens einmal am Tag je Filiale
  (gespeichert in `settings`), der Kostenpunkt ist klein, und er ist das
  Stück, das der Betreiber liest. Nur der Rückblick trägt darum noch den
  serverseitigen `fallbacks`-Zusatz (Opus-5-Feature); die Sonnet-Aufrufe
  fangen eine Ablehnung über `stop_reason === 'refusal'` und den `try/catch`
  ab, wie bisher.
- **`logUsage` (`ai.ts`) schreibt den Tokenverbrauch je Aufruf ins Log**
  (`[ki-usage] …`). Kein Kostenzähler — es gibt noch keinen echten Verkehr,
  also lässt sich der Preis nicht schätzen. Nach ein paar Wochen Pilotbetrieb
  rechnet man ihn aus diesen Zeilen. Die harte Obergrenze ist das
  Ausgabenlimit auf dem Anthropic-Workspace, nicht der Code.

- **Jede hat einen Notausgang.** Ohne `ANTHROPIC_API_KEY` — und bei jedem
  Fehler der Schnittstelle — greift beim Rezensionstext und beim Rückblick eine
  aus den Zahlen gerechnete Vorlage; der Bon-Scan antwortet mit 503 und sagt,
  dass er nicht eingerichtet ist. Eine Vorführung ohne Schlüssel bleibt damit
  vollständig benutzbar, und kein Ausfall der Schnittstelle kann eine Bewertung
  verhindern.
- **Ein eigener Schlüssel pro Konto.** Angemeldete Gäste und Personal können in
  ihrem Konto einen privaten Anthropic-Key hinterlegen — der Gast treibt damit
  seinen Rezensionstext an, das Personal Wochenrückblick und Bon-Scan (jede
  Rolle, ein Kellner braucht ihn für Letzteres). Reihenfolge überall gleich:
  **eigener Schlüssel → gemeinsamer `ANTHROPIC_API_KEY` → Vorlage bzw. 503**,
  umgesetzt allein in `claudeClient`/`hasClaude` (`ai.ts`) und dem Helfer
  `callerApiKey` in `index.ts`. Gespeichert verschlüsselt in `apiKeyEnc`
  (`secrets.ts`, AES-256-GCM), nie im Klartext an den Client —
  `serializeUser`/`serializeGuest` geben nur `hasApiKey`, genau wie bei
  `hasPassword`/`hasGoogle`. Die Verschlüsselung hängt an `API_KEY_ENC_SECRET`;
  fehlt es, antworten die beiden Speicher-Routen (`PUT /account/api-key`,
  `PUT /guest/me/api-key`) mit 503, alles andere läuft unverändert. Ein
  späterer Wechsel des Secrets macht bestehende `apiKeyEnc` unlesbar — das ist
  kein Fehler, `decryptApiKey` gibt dann `null` und der Aufruf fällt auf den
  gemeinsamen Schlüssel bzw. die Vorlage zurück.
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
- **Der Rückblick gibt Empfehlungen, der Rezensionstext bleibt nüchtern.**
  `HIGHLIGHT_SYSTEM` verlangt zwei Absätze — was sich verändert hat, dann
  „Woran ich arbeiten würde:" mit zwei bis vier Empfehlungen, jede an einer
  Zahl oder Anmerkung aus den Daten festgemacht (keine allgemeinen Ratschläge).
  Läuft auf `effort: 'medium'`, weil das mehr ist als eine Zusammenfassung.
  `SYSTEM_PROMPT` in `reviewText.ts` zieht in die andere Richtung: 25 bis 50
  Wörter, kein Schwärmen auch bei fünf Sternen, klingt wie ein beiläufiger
  Google-Maps-Eintrag. Beide ohne Gedankenstriche.

## Dashboard-Auswertung

`GET /insights?from=&to=&branches=` (branchAdmin) rechnet in einem Durchgang
über die Bewertungen: Summen, Wochenkübel, Gerichtsschnitte, Sammelurteile —
dazu die Zahl der gebuchten Bestellungen im selben Zeitraum.

- **Warum nicht aus dem Gesamtzustand:** der trägt nur die letzten 100
  Bewertungen (`REVIEW_PAGE_SIZE`). Für einen Wochenverlauf und einen
  Zeitraumfilter reicht das nicht — und umgekehrt gehört diese Rechnerei nicht
  in jeden Seitenaufruf des Gastes.
- Begrenzt auf 5000 Bewertungen je Lauf (`INSIGHT_REVIEW_CAP`); die Antwort
  sagt mit `totals.capped`, wenn die Grenze griff.
- **`?branches=a,b` fasst mehrere Filialen zusammen — aber `scopeOf` schlägt
  ihn.** Ein Konto mit Filialbindung sieht seine Filiale, egal was in der
  Anfrage steht. Der Parameter ist also nur für den Ketten-Admin von Belang,
  der Standorte nebeneinander betrachten will; jede ID wird geprüft, statt als
  Zeichenkette in den Filter zu wandern.
- **Der Zeitraum kennt einen eigenen Modus** (`RangeKey: 'custom'`). Das
  Bis-Datum zählt ganz mit: wer den 31. wählt, meint den 31. über.
- **Der Verlauf kommt in der Einheit, die zum Zeitraum passt** (`trendUnit`):
  bis 35 Tage je Tag, bis rund 13 Monate je Woche, darüber je Monat. Feste
  Wochen ergaben bei „letzte 7 Tage" einen einzigen Balken. Und er ist
  **lückenlos**: ein Kübel ohne Bewertungen steht als 0 im Bild, statt zu
  fehlen — sonst rückten zwei weit auseinanderliegende Balken nebeneinander
  und behaupteten eine Nachbarschaft, die es nicht gab.

Was das Dashboard daraus macht:

- **Eine Karte für Ø Bewertung, Bewertungen und Bestellungen**, nicht drei. Die
  drei gehören zusammen: eine Note ohne die Zahl dahinter sagt nichts. Am Fuß
  steht ihr Verhältnis — welcher Anteil der Bestellungen Feedback hinterlässt.
- **Die alten Kacheln „Punkte ausgegeben" und „Eingelöste Gutscheine" sind
  weg.** Sie rechneten aus `store.guest` — dem GASTPROFIL des angemeldeten
  Verwalters, also praktisch immer null.
- **Kein Bearbeiten-Modus mehr.** Ausblendbare Kacheln versteckten Zahlen hinter
  einem Schalter, den niemand wiederfand. Was der Server dazu speichert
  (`settings/dashboard.hiddenWidgets`), bleibt unberührt liegen.
- **Die Menü-Matrix ist ein Streudiagramm mit einer Legende darunter.**
  Zwischenzeitlich war das Diagramm entfernt und durch vier Felder mit den
  Gerichtsnamen ersetzt, mit dem Argument, unbeschriftete Punkte sagten
  nichts. Das Diagramm ist zurück: es zeigt die Verteilung, die keine Liste
  zeigt. Welches Gericht wo liegt, sagt der Tooltip am Punkt — und darunter
  steht ohnehin die Tabelle „Alle Gerichte". Die Namen gehören **nicht** in
  die Legende: vier Kästchen, die zusammen die halbe Karte auflisten, stehen
  dann direkt über der Tabelle, die genau dafür da ist.
- **Die Schwellen sind fest und stehen als Text dabei** — **hoch = 4,0 ★ und
  mehr** (kein zweiter Median: eine mitwandernde Schwelle ließe jede Karte
  gleich gut aussehen), **viele = mehr als der Median** aller Gerichte des
  Zeitraums. Dieselben zwei Werte liegen als gestrichelte `ReferenceLine` im
  Bild, sonst hätten die Felder unten keine Entsprechung darin. Die Einteilung
  steht **einmal** in `quadrantOf()` — Punktfarbe und Feld dürfen nie
  auseinanderlaufen.
- **Die Bewertungsachse zeigt ein Fenster, nicht die volle Skala** (`avgDomain`).
  Fest 0 bis 5 klang richtig — eine mitwandernde Achse ließe jede Karte gleich
  gut aussehen —, war aber unbrauchbar: Gerichte liegen zwischen 3 und 5, die
  linke Hälfte blieb leer, und alle Punkte klebten ununterscheidbar am rechten
  Rand. Drei Sperren gegen Schönfärberei: die Schwelle 4,0 liegt immer im Bild,
  das Fenster ist nie enger als 1,5 Sterne, und die Achse ist beschriftet — man
  sieht, dass sie nicht bei null anfängt.
- **Die Legende ist ein farbiger Punkt und eine Erklärung**, mehr nicht: kein
  Kasten, keine Tönung, keine Namensliste. Die Schrift bleibt schwarz und
  grau. Vorher trug jedes Feld seine eigene Tönung, Schrift inklusive — heller
  Grund, dunklere Schrift derselben Farbe: ein Kästchen aus Rot, Hellrot und
  Dunkelrot, das sich schlechter las als eines aus einem. Die Farbe des
  Punktes kommt aus derselben Quelle wie die Punkte im Bild (`QUADRANTS.hex`),
  sonst laufen Legende und Diagramm irgendwann auseinander. Die zwei Begriffe
  darüber („Hoch", „Viele") stehen in der Akzentfarbe, der Rest ist
  gewöhnlicher Text.

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

**Die Verwaltung hat keine obere Leiste mehr.** Filiale, Seiten, Konto und
Neuladen stehen alle in der Seitenleiste links; am Handy ist dieselbe Leiste
eine Schublade hinter dem Menüzeichen. Wer etwas Neues unterbringt, das die
ganze Ansicht betrifft, setzt es dorthin — nicht in einen zweiten waagrechten
Streifen darüber. **Tische und QR-Codes sind eine eigene Seite** (`page:
'tables'`), nicht mehr ein Block unten in den Einstellungen: „wo sind die
Tische der Filiale X" war die häufigste Frage, und die Antwort lautete
„Einstellungen, ganz runterscrollen, und vorher oben die Filiale wechseln".
Die Filiale wählt man jetzt auf der Seite selbst.

**Der CSV-Import liest die Kopfzeile, nicht die Spaltenstellung.** Eine Datei
mit vertauschten Spalten würde sonst kommentarlos Preise als Namen anlegen.
Erkannt werden die Bezeichnungen, die `exportDishesCsv` selbst schreibt, dazu
die englischen — eine exportierte Datei muss sich wieder einlesen lassen.
Semikolon vor Komma, weil das deutsche Excel es schreibt und ein Preis wie
„12,50" das Komma ohnehin unbrauchbar macht. Angelegt wird **nacheinander**:
jede Antwort trägt den vollständigen Zustand, und zwanzig gleichzeitige Aufrufe
würden sich gegenseitig überschreiben.

**Zustand nie lokal kopieren.** `activeTable` im Kellner war eine Kopie und
zeigte nach dem Speichern veraltete Daten. Immer aus `store.tables` ableiten.

**SRV-Auflösung schlägt auf diesem Rechner fehl** (`querySrv ECONNREFUSED`) —
Node fragt Nameserver direkt, die verweigern. Deshalb steht in der lokalen
`server/.env` die SRV-freie Form mit den drei Shard-Hosts. In Render funktioniert
der normale `mongodb+srv`-String.

## Betrieb

- Frontend: Netlify (`bitelyvienna`), braucht `VITE_API_BASE_URL` **zur
  Buildzeit** — nachträglich gesetzt erfordert einen neuen Build.
  Optional `VITE_DEFAULT_ORG_PATH`: wohin „/" führt. Ohne sie bleibt es beim
  bisherigen Ziel (`/sakura-sushi/herrengasse`) — vorher stand der Name genau
  eines Restaurants fest im Router einer Anwendung, die mandantenfähig ist.
- **Der Reitertitel kommt aus den Marken-Einstellungen** (`useDocumentTitle`).
  In `index.html` steht nur ein Platzhalter; wer mehrere Filialen oder Mandanten
  nebeneinander offen hat, unterschied die Reiter vorher an nichts.
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
- **Google für das Personal** (`POST /auth/google`): derselbe Weg wie beim Gast,
  mit einem entscheidenden Unterschied — hier entsteht **nie** ein Konto. Gesucht
  wird über `googleSub` oder die E-Mail; ohne aktives Konto gibt es 403. Sonst
  wäre jede Google-Adresse der Welt ein Zugang zu einer fremden Verwaltung.
  Google beweist nur, wer davor sitzt; Rolle und Filiale kommen weiter aus dem
  Konto. Weder `passwordHash` noch `googleSub` verlassen den Server
  (`serializeUser` gibt `hasPassword`/`hasGoogle`) — `users` steckt im Zustand,
  den auch ein Gast lädt.
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

**Rollen ändern darf nur die Kette** (`PATCH /users/:id`, `chainAdmin`). Dürfte
eine Filialleitung es, könnte sie einen ihrer Kellner zum Admin machen und über
dessen Konto alles tun — die Grenze bei `POST /users` wäre dann eine Umleitung,
kein Zaun. Zwei Sperren stehen zusätzlich im Handler: die **eigene** Rolle lässt
sich nicht ändern (nach dem Speichern gilt das neue Recht sofort, und die Seite,
auf der man steht, gehört einem nicht mehr), und der **letzte Admin** lässt sich
nicht herabstufen. Ein laufendes Token trägt weiter die alte Rolle — sie greift
erst bei der nächsten Anmeldung.
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
