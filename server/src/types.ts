import type { ObjectId } from 'mongodb';

// platform-DB: Registry aller Organisationen (Mandanten)
export interface Organization {
  _id?: ObjectId;
  slug: string;
  name: string;
  createdAt: number;
}

// Ab hier: Collections innerhalb der DB EINER Organisation

export interface Branch {
  _id?: ObjectId;
  slug: string;
  name: string;
  address: string;
  /**
   * Der Google-Maps-Eintrag DIESER Filiale — der Dank-Bildschirm verlinkt ihn,
   * damit der Gast seine fertig formulierte Rezension gleich dort hinterlassen
   * kann. Pro Filiale, weil jede ihren eigenen Eintrag hat; ohne Wert baut der
   * Server einen Suchlink aus Name und Adresse.
   */
  googleMapsUrl?: string | null;
}

export interface TableItem {
  dishId: string;
  qty: number;
}

export interface TableDoc {
  _id?: ObjectId;
  branchId: string;
  // Feste, für Menschen lesbare Nummer -> wird in der QR-Route verwendet: /:orgSlug/table/:number
  number: number;
  // Zwei Zustände, mehr braucht der Ablauf nicht: 'offen' heißt "es liegt eine
  // Bestellung an, deren Bewertung noch aussteht", 'frei' heißt "nichts offen".
  // Ein eigener Zustand für "bewertet und abgeräumt" sagte dem Personal nichts,
  // was der leere Tisch nicht auch sagt — und ließ frisch bewertete Tische
  // dauerhaft als "fertig" stehen, statt sie wieder freizugeben.
  status: 'frei' | 'offen';
  items: TableItem[];
  openedAt: number | null;
  // Identität der aktuell offenen Bestellung. Wird gesetzt, sobald das erste
  // Gericht auf den Tisch gebucht wird, und auf null zurückgesetzt, sobald die
  // Bestellung bewertet oder der Tisch geschlossen wurde. null = keine offene
  // Bestellung. Trägt den Doppelbewertungs-Schutz (unique index auf reviews).
  orderId?: ObjectId | null;
}

/**
 * Eine gebuchte Bestellung — der Beleg, dass an einem Tisch etwas aufgegeben
 * wurde, unabhängig davon, ob sie je bewertet wird.
 *
 * Der Tisch allein trägt das nicht: er kennt nur die LAUFENDE Bestellung und
 * vergisst sie beim Freigeben. Ohne diese Sammlung ließe sich „wie viele
 * Bestellungen gab es" nicht beantworten — und damit auch nicht, welcher
 * Anteil davon Feedback hinterlässt.
 *
 * Schlüssel ist `orderId`, dieselbe wie auf dem Tisch und in der Bewertung.
 * Bucht die Servicekraft nach, wächst der bestehende Datensatz, statt dass ein
 * zweiter entsteht.
 */
export interface OrderDoc {
  _id?: ObjectId;
  orderId: ObjectId;
  branchId: string;
  tableId: string;
  tableNumber: number;
  createdAt: number;
  // Zum Zeitpunkt der letzten Buchung — nur fürs Reporting, die Wahrheit über
  // die Positionen steht am Tisch bzw. in der Bewertung.
  itemCount: number;
  /** Aus `npm run demo-reviews`. Nur damit `--reset` sie wieder findet. */
  demo?: boolean;
}

export interface DishDoc {
  _id?: ObjectId;
  name: string;
  img: string;
  price: number;
  cat: 'Speisen' | 'Getränke';
  /**
   * Welche Filialen dieses Gericht führen. `null` = alle — so bleiben Karten
   * ohne Abweichung ohne Pflegeaufwand, und eine neue Filiale startet nicht
   * mit leerer Karte.
   *
   * Die Stammdaten (Name, Preis, Foto) gehören der Kette; nur die
   * Verfügbarkeit ist Sache der Filiale.
   */
  branchIds: string[] | null;
  /**
   * Bewertungen getrennt nach Filiale — die Küche der einen sagt nichts über
   * die der anderen. Schlüssel ist die Filial-ID als Zeichenkette.
   *
   * Am Draht bleibt es bei ratingsSum/ratingsCount: der Server rechnet sie
   * passend zur angefragten Filiale aus (oder summiert für den Ketten-Blick
   * des Admins). Die Oberfläche muss davon nichts wissen.
   */
  ratingsByBranch: Record<string, { sum: number; count: number }>;
}

export interface DishRatingInput {
  dishId: string;
  stars: number;
  note?: string;
}

export interface ReviewDoc {
  _id?: ObjectId;
  // Verweist auf TableDoc.orderId. Eindeutiger Index -> pro Bestellung genau
  // eine Bewertung, auch bei zwei gleichzeitigen Anfragen.
  orderId: ObjectId;
  branchId: string;
  tableId: string;
  tableNumber: number;
  dishRatings: DishRatingInput[];
  overall: { service: number; ambience: number; speed: number };
  createdAt: number;
  /**
   * Der fertig formulierte Rezensionstext zu dieser Bewertung, sobald er einmal
   * erzeugt wurde. Zwischengespeichert, weil jede Erzeugung einen Modellaufruf
   * kostet — lädt der Gast den Dank-Bildschirm neu, bekommt er denselben Text
   * statt eines zweiten, leicht anderen.
   */
  reviewText?: string | null;
  /** Aus `npm run demo-reviews`. Nur damit `--reset` sie wieder findet. */
  demo?: boolean;
}

export interface AlertDoc {
  _id?: ObjectId;
  branchId: string;
  tableId: string;
  tableNumber: number;
  dishName: string;
  stars: number;
  note?: string;
  createdAt: number;
  resolved: boolean;
}

export interface VoucherDoc {
  _id?: ObjectId;
  title: string;
  points: number;
  expiry: string;
  img: string;
  // Wo der Gutschein gilt. `null` = in der ganzen Kette — das ist der
  // Normalfall, weil der Gast seine Punkte auch überall sammelt.
  branchIds: string[] | null;
}

export interface UserDoc {
  _id?: ObjectId;
  name: string;
  email: string;
  // null = noch kein Passwort gesetzt (offene Einladung) -> kann sich nicht anmelden.
  passwordHash: string | null;
  // Googles Konto-ID, sobald sich dieses Konto einmal mit Google angemeldet
  // hat. Sie ersetzt kein Passwort: der Zugang hängt weiter am Konto, das ein
  // Admin angelegt hat — Google beweist nur, wer davor sitzt.
  googleSub?: string | null;
  role: 'Admin' | 'Manager' | 'Kellner';
  branchId: string | null; // null = alle Filialen
  status: 'aktiv' | 'eingeladen' | 'inaktiv';
  // Privater Anthropic-Key dieses Kontos, AES-256-GCM-verschlüsselt
  // (server/src/secrets.ts). Treibt Wochenrückblick und Bon-Scan an, wenn
  // gesetzt — sonst greift der gemeinsame ANTHROPIC_API_KEY bzw. der
  // jeweilige Notausgang. Nie im Klartext an den Client (serializeUser gibt
  // nur hasApiKey).
  apiKeyEnc?: string | null;
}

export interface BrandDoc {
  _id?: string; // konstant 'brand'
  name: string;
  accent: string;
  logo: string; // Emoji-Fallback, solange kein Logo-Bild hochgeladen wurde
  logoImage?: string | null; // Data-URI (Base64), überschreibt logo optisch wenn gesetzt
  coverImage?: string | null; // Data-URI (Base64) — Titelbild auf dem Gast-Willkommensbildschirm
  font?: string; // Name aus der kuratierten Schriftart-Liste
  cardStyle?: 'standard' | 'kompakt' | 'editorial';
  // Hell oder Dunkel für die GASTANSICHT — Teil des Markenauftritts, vom
  // Restaurant in den Design-Einstellungen gesetzt. Der Hell/Dunkel-Schalter
  // in den Verwaltungs-Einstellungen betrifft nur die Verwaltung selbst.
  guestTheme?: 'hell' | 'dunkel';
  // Zwei Schriftfarben der Gastansicht, unabhängig voneinander: guestNameColor
  // färbt die Zeile „Filiale · Tisch", guestTextColor Überschrift und Fließtext.
  // Leer/null = die üblichen Grau-/Schwarztöne je Hell/Dunkel. Hex-String.
  guestNameColor?: string | null;
  guestTextColor?: string | null;
}

/**
 * Welche Kacheln des Admin-Dashboards ausgeblendet sind. Liegt in der
 * Datenbank, weil eine Ansicht, die sich beim nächsten Laden selbst
 * zurücksetzt, keine Einstellung ist, sondern ein Ärgernis.
 *
 * Bewusst pro Organisation, nicht pro Konto: das Dashboard eines Restaurants
 * ist eine gemeinsame Ansicht, und ein zweites Konto soll dieselbe vorfinden.
 */
export interface DashboardDoc {
  _id?: string; // konstant 'dashboard'
  hiddenWidgets: string[];
}

/**
 * Der KI-Wochenrückblick des Dashboards, je Reichweite einmal abgelegt
 * (Filial-ID als Schlüssel, `'all'` für den Ketten-Blick).
 *
 * Warum überhaupt gespeichert: der Text kostet einen Modellaufruf. Bei jedem
 * Seitenaufruf neu erzeugt wäre er teuer und außerdem jedes Mal etwas anders —
 * ein Rückblick, der sich beim Neuladen ändert, liest sich wie ein Zufallstext.
 * Erneuert wird er, wenn er älter als einen Tag ist (`HIGHLIGHT_TTL_MS`).
 */
export interface InsightsDoc {
  _id?: string; // konstant 'insights'
  highlights: Record<string, {
    text: string;
    generatedAt: number;
    source: 'llm' | 'fallback';
    /** Anzahl Bewertungen, aus denen der Text entstanden ist — für „Stand vom …". */
    reviewCount: number;
  }>;
}

/**
 * Eine Gutschein-Einlösung am Tisch.
 *
 * Der Wisch löst sofort und endgültig ein (`status: 'eingelöst'`): die Punkte
 * sind weg, der Gutschein gilt als verbraucht. Danach zeigt der Gast der
 * Servicekraft nur noch den Bildschirm mit dem Häkchen — ein gesonderter
 * Schritt, die Ausgabe zu bestätigen, entfällt.
 *
 * Frühere Zwischenzustände: `entwertet` ("Punkte weg, Ausgabe steht aus", von
 * der Servicekraft zu bestätigen) sowie `offen`/`verfallen`/`abgebrochen` aus
 * der Zeit der 60-Sekunden-Frist. Neue Einlösungen tragen keinen davon mehr,
 * die alten Datensätze bleiben lesbar. `confirmedBy`/`confirmedByName` bleiben
 * für diesen Altbestand im Schema.
 */
export interface RedemptionDoc {
  _id?: ObjectId;
  voucherId: string;
  voucherTitle: string; // Kopie: der Gutschein kann später umbenannt/gelöscht werden
  branchId: string;
  tableId: string | null;
  tableNumber: number | null;
  guestId: string; // vorerst konstant 'default', bis es echte Gastkonten gibt
  code: string; // serverseitig erzeugt, niemals vom Client
  points: number; // Preis zum Zeitpunkt der Einlösung
  // 'entwertet' = gewischt, Punkte weg, Ausgabe steht noch aus.
  // 'eingelöst'  = die Servicekraft hat die Ausgabe eingetragen.
  status: 'entwertet' | 'eingelöst' | 'offen' | 'verfallen' | 'abgebrochen';
  createdAt: number;
  // Nur noch für Altbestand gefüllt. Eine Entwertung verfällt nicht mehr.
  expiresAt: number | null;
  redeemedAt: number | null;
  confirmedBy: string | null; // Benutzer-ID der Servicekraft
  confirmedByName: string | null;
}

/**
 * Ein echtes Gastkonto. Punkte und eingelöste Gutscheine hängen daran, nicht
 * mehr an einem geteilten Profil — vorher sah jeder Gast denselben Punktestand.
 *
 * Zwei Wege hinein, beide optional: E-Mail mit Passwort (`passwordHash`) und
 * Google (`googleSub`, die unveränderliche Konto-ID von Google). Wer sich mit
 * Google anmeldet und dieselbe E-Mail hat, landet im selben Konto.
 */
export interface GuestDoc {
  _id?: ObjectId;
  email: string; // eindeutig je Organisation, immer kleingeschrieben
  name: string;
  passwordHash: string | null;
  googleSub: string | null;
  points: number;
  redeemed: string[];
  createdAt: number;
  // Privater Anthropic-Key dieses Kontos, AES-256-GCM-verschlüsselt
  // (server/src/secrets.ts). Treibt den automatischen Rezensionstext an, wenn
  // gesetzt — sonst greift der gemeinsame ANTHROPIC_API_KEY bzw. die Vorlage.
  // Nie im Klartext an den Client (serializeGuest gibt nur hasApiKey).
  apiKeyEnc?: string | null;
}

/** Das alte, von ALLEN Gästen geteilte Profil. Bleibt für Bestandsdaten stehen. */
export interface GuestProfileDoc {
  _id?: string; // konstant 'default' (kein echter Login vorgesehen)
  points: number;
  redeemed: string[];
  loggedIn?: boolean;
}
