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
  status: 'frei' | 'offen' | 'abgeschlossen';
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
  ratingsSum: number;
  ratingsCount: number;
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
}

export interface UserDoc {
  _id?: ObjectId;
  name: string;
  email: string;
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

export interface GuestProfileDoc {
  _id?: string; // konstant 'default' (kein echter Login vorgesehen)
  points: number;
  redeemed: string[];
  loggedIn?: boolean;
}
