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
  role: 'Admin' | 'Manager' | 'Kellner';
  branchId: string | null; // null = alle Filialen
  status: 'aktiv' | 'eingeladen' | 'inaktiv';
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
 * Der Gast eröffnet sie, die Servicekraft quittiert sie in IHRER App — nicht
 * auf dem Display des Gastes. Genau das macht einen Screenshot wertlos: er
 * erzeugt keinen Eintrag beim Personal. Der `code` dient nur dem Abgleich mit
 * bloßem Auge, er ist kein Nachweis.
 *
 * Die Punkte sind ab dem Eröffnen abgebucht (reserviert) und werden bei
 * `verfallen`/`abgebrochen` zurückgeschrieben — sonst könnten zwei Tische
 * denselben Punktestand gleichzeitig ausgeben, weil sich alle Gäste (noch)
 * ein Profil teilen.
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
  status: 'offen' | 'eingelöst' | 'verfallen' | 'abgebrochen';
  createdAt: number;
  expiresAt: number;
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
}

/** Das alte, von ALLEN Gästen geteilte Profil. Bleibt für Bestandsdaten stehen. */
export interface GuestProfileDoc {
  _id?: string; // konstant 'default' (kein echter Login vorgesehen)
  points: number;
  redeemed: string[];
  loggedIn?: boolean;
}
