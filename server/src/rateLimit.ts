import type { NextFunction, Request, Response } from 'express';

// ═══════════════════════════════════════════════════════════
// Ratenbegrenzung für die Anmelde-Routen
//
// Bewusst ohne Paket, wie beim Passwort-Hashing: ein fester Zeitkübel je
// Schlüssel im Speicher reicht für einen einzelnen Render-Prozess. Startet der
// Server neu, beginnen die Zähler von vorn — für einen Schutz gegen Durchraten
// ist das in Ordnung, ein Angreifer kann den Neustart nicht auslösen.
//
// Zwei Arten von Schlüsseln:
//   - je Adresse (IP): bremst jemanden, der viele Konten durchprobiert
//   - je Konto (E-Mail): bremst jemanden, der ein Konto von vielen Adressen
//     aus angreift. Gezählt werden dort nur FEHLVERSUCHE; eine gelungene
//     Anmeldung setzt den Zähler zurück.
// ═══════════════════════════════════════════════════════════

interface Bucket {
  count: number;
  resetAt: number;
}

export class Limiter {
  private buckets = new Map<string, Bucket>();

  constructor(private readonly max: number, private readonly windowMs: number) {
    // Abgelaufene Kübel regelmäßig wegräumen, damit die Map nicht wächst.
    // unref(): der Timer allein hält den Prozess nicht am Leben (Skripte, Tests).
    setInterval(() => this.sweep(), Math.min(windowMs, 10 * 60 * 1000)).unref();
  }

  private current(key: string, now: number): Bucket | null {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) return null;
    return bucket;
  }

  /** Sekunden bis zum nächsten Versuch, oder 0, wenn der Schlüssel frei ist. */
  blockedFor(key: string): number {
    const now = Date.now();
    const bucket = this.current(key, now);
    if (!bucket || bucket.count < this.max) return 0;
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }

  /** Einen Versuch zählen. */
  hit(key: string): void {
    const now = Date.now();
    const bucket = this.current(key, now);
    if (bucket) bucket.count += 1;
    else this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/**
 * Die Adresse des Aufrufers.
 *
 * Auf Render steht Cloudflare davor: `req.ip` wäre die Adresse eines
 * Cloudflare-Knotens, und `X-Forwarded-For` lässt sich vom Aufrufer vorne
 * beliebig befüllen. Render setzt `True-Client-IP` selbst — dem wird nur
 * vertraut, wenn der Server wirklich auf Render läuft (`RENDER` setzt Render).
 * Lokal gilt die Adresse der Verbindung.
 */
export function clientIp(req: Request): string {
  if (process.env.RENDER) {
    // CF-Connecting-IP als Rückfall: setzt Cloudflare ebenfalls selbst. Fehlen
    // beide, landen alle Aufrufer auf der Adresse des Proxys — dann bremst die
    // Grenze alle gemeinsam, aber sie lässt niemanden durch.
    for (const name of ['true-client-ip', 'cf-connecting-ip']) {
      const header = req.headers[name];
      if (typeof header === 'string' && header.trim()) return header.trim();
    }
  }
  return req.socket.remoteAddress ?? 'unbekannt';
}

function isLoopback(ip: string): boolean {
  return ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.');
}

export function tooManyRequests(res: Response, retryAfterSec: number): void {
  res.setHeader('Retry-After', String(retryAfterSec));
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  res.status(429).json({
    error: `Zu viele Versuche. Bitte in ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} erneut versuchen.`,
  });
}

type Handler<R extends Request> = (req: R, res: Response, next: NextFunction) => unknown;

/**
 * Umschließt einen Handler mit einer Grenze je Adresse — derselbe Stil wie
 * `requireAuth`: der zentrale Promise-Patch des Routers sieht nur EINEN Handler
 * pro Route, eine zweite Middleware als Argument fiele weg.
 *
 * Jeder Aufruf zählt, auch ein erfolgreicher: auf diesen Routen gibt es keinen
 * Grund, hundertmal in einer Viertelstunde anzukommen.
 */
export function limitByIp<R extends Request>(limiter: Limiter, scope: string, handler: Handler<R>): Handler<R> {
  return (req, res, next) => {
    const ip = clientIp(req);
    // Lokal (nicht auf Render) bleibt der eigene Rechner ungebremst, damit die
    // verify-Skripte beliebig oft gegen `npm run server:dev` laufen können.
    // Auf Render kommt nie eine Loopback-Adresse an (True-Client-IP).
    if (!process.env.RENDER && isLoopback(ip)) return handler(req, res, next);
    const key = `${scope}:${ip}`;
    const wait = limiter.blockedFor(key);
    if (wait > 0) {
      tooManyRequests(res, wait);
      return;
    }
    limiter.hit(key);
    return handler(req, res, next);
  };
}
