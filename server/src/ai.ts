import Anthropic from '@anthropic-ai/sdk';

// ═══════════════════════════════════════════════════════════
// KI-Bausteine
//
// Zwei Dinge, die ohne Modell nicht gehen: der Wochenrückblick
// auf dem Dashboard und das Erkennen von Gerichten auf einem
// abfotografierten Bon.
//
// Beide haben einen Notausgang. Ohne ANTHROPIC_API_KEY — und
// bei jedem Fehler der Schnittstelle — greift beim Rückblick
// ein aus den Zahlen gerechneter Text; der Bon-Scan meldet
// ehrlich, dass er gerade nicht kann, statt Gerichte zu raten.
// So bleibt eine Vorführung ohne Schlüssel benutzbar.
// ═══════════════════════════════════════════════════════════

let client: Anthropic | null = null;

/**
 * Der Zugang für einen Aufruf. Mit `apiKey` (privater Schlüssel eines Gasts
 * oder Personal-Kontos, siehe secrets.ts) entsteht ein eigener Client dafür —
 * kein Cache über Konten hinweg, sonst könnte der Schlüssel eines Aufrufers
 * versehentlich für einen anderen verwendet werden. Ohne `apiKey` bleibt es
 * beim gemeinsamen, aus der Umgebung gebauten Singleton wie bisher.
 *
 * `null` heißt: weder privater noch gemeinsamer Schlüssel vorhanden,
 * Notausgang nehmen.
 */
export function claudeClient(apiKey?: string | null): Anthropic | null {
  if (apiKey) return new Anthropic({ apiKey });
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

export function hasClaude(apiKey?: string | null): boolean {
  return Boolean(apiKey || process.env.ANTHROPIC_API_KEY);
}

/**
 * Der Verbrauch eines Modellaufrufs ins Log. Kein Kostenzähler, nur die
 * Grundlage dafür: Es gibt noch keinen echten Verkehr, also lässt sich der
 * Preis nicht schätzen — nach ein paar Wochen Pilotbetrieb rechnet man ihn
 * aus diesen Zeilen in den Render-Logs. Die harte Obergrenze ist das
 * Ausgabenlimit auf dem Anthropic-Workspace, nicht dieser Aufruf.
 */
export function logUsage(
  tag: string,
  response: { model?: string; usage?: { input_tokens?: number; output_tokens?: number } | null },
): void {
  const u = response.usage;
  if (!u) return;
  console.log(`[ki-usage] ${tag} model=${response.model ?? '?'} in=${u.input_tokens ?? 0} out=${u.output_tokens ?? 0}`);
}

// ── Wochenrückblick ──────────────────────────────────────

export interface HighlightInput {
  restaurantName: string;
  scopeName: string; // Filiale oder "alle Filialen"
  /** Die letzten sieben Tage. */
  current: { reviews: number; avg: number };
  /** Die sieben Tage davor — nur so wird aus einer Zahl eine Entwicklung. */
  previous: { reviews: number; avg: number };
  best: { name: string; avg: number; count: number }[];
  worst: { name: string; avg: number; count: number }[];
  /** Wörtliche Anmerkungen der Woche, gekürzt — daraus entsteht der eigentliche Wert. */
  notes: { dish: string; stars: number; note: string }[];
}

export interface HighlightResult {
  text: string;
  source: 'llm' | 'fallback';
}

const HIGHLIGHT_SYSTEM = `Du schreibst den Wochenrückblick im Dashboard eines Restaurants. Leser ist die Inhaberin oder der Betreiber. Sie will wissen, was diese Woche zählt und was sie daraus machen kann.

Aufbau, zwei Absätze:
- Erster Absatz: was sich verändert hat. Schnitt und Zahl der Bewertungen gegen die Vorwoche, die auffälligsten Gerichte beim Namen mit ihrer Sternzahl und der Zahl der Bewertungen dahinter. Wenn Gäste dasselbe mehrfach anmerken, steht das hier.
- Zweiter Absatz, eingeleitet mit dem Satz "Woran ich arbeiten würde:": zwei bis vier konkrete Empfehlungen. Jede an einer Zahl oder einer Anmerkung aus den Daten festgemacht, zum Beispiel ein Gericht mit niedrigem Schnitt und wiederkehrender Kritik, eine Zutat oder Zubereitung, die mehrfach genannt wird, oder ein starkes Gericht, das mehr Aufmerksamkeit verdient.

Regeln:
- Deutscher Fließtext, ganze Sätze, keine Stichpunkte.
- Etwa 120 bis 200 Wörter.
- Jede Empfehlung muss aus den Daten folgen. Keine allgemeinen Ratschläge, die für jedes Restaurant gelten würden.
- Erfinde nichts. Nur was in den Daten steht. Sind es zu wenige Bewertungen für eine Aussage, sag das und gib entsprechend weniger Empfehlungen.
- Kein Marketing-Ton, keine Floskeln, keine Emojis.
- Keine Gedankenstriche. Wo einer stehen würde, nimm Komma oder Punkt.

Gib ausschließlich den Rückblick aus.`;

/** Aus den Zahlen gerechnet — Notausgang ohne Schlüssel oder bei Fehlern. */
export function fallbackHighlight(input: HighlightInput): string {
  const { current, previous, best, worst } = input;
  if (current.reviews === 0) {
    return 'In den letzten sieben Tagen ist keine Bewertung eingegangen. Sobald Gäste wieder bewerten, steht hier der Rückblick.';
  }
  const parts: string[] = [];
  const diff = current.avg - previous.avg;
  const trend = previous.reviews === 0 ? 'ohne Vorwoche zum Vergleich'
    : Math.abs(diff) < 0.1 ? 'genauso viel wie in der Vorwoche'
    : diff > 0 ? `${diff.toFixed(1)} Sterne mehr als in der Vorwoche`
    : `${Math.abs(diff).toFixed(1)} Sterne weniger als in der Vorwoche`;
  parts.push(`${current.reviews} ${current.reviews === 1 ? 'Bewertung' : 'Bewertungen'} in den letzten sieben Tagen, im Schnitt ${current.avg.toFixed(1)} Sterne, ${trend}.`);
  if (best[0]) parts.push(`Am besten kam ${best[0].name} an (${best[0].avg.toFixed(1)} Sterne aus ${best[0].count} Bewertungen).`);
  if (worst[0] && worst[0].avg < 3.5) parts.push(`Schwächster Posten ist ${worst[0].name} mit ${worst[0].avg.toFixed(1)} Sternen.`);
  return parts.join(' ');
}

export async function generateHighlight(input: HighlightInput, apiKey?: string | null): Promise<HighlightResult> {
  const anthropic = claudeClient(apiKey);
  if (!anthropic || input.current.reviews === 0) {
    return { text: fallbackHighlight(input), source: 'fallback' };
  }

  const list = (rows: { name: string; avg: number; count: number }[]) =>
    rows.length === 0 ? '  (keine)' : rows.map(r => `  - ${r.name}: ${r.avg.toFixed(1)} Sterne aus ${r.count} Bewertungen`).join('\n');

  const brief = [
    `Restaurant: ${input.restaurantName} — ${input.scopeName}`,
    '',
    'Letzte sieben Tage:',
    `  ${input.current.reviews} Bewertungen, Schnitt ${input.current.avg.toFixed(2)}`,
    'Die sieben Tage davor:',
    `  ${input.previous.reviews} Bewertungen, Schnitt ${input.previous.avg.toFixed(2)}`,
    '',
    'Beste Gerichte:', list(input.best),
    'Schwächste Gerichte:', list(input.worst),
    '',
    'Anmerkungen der Gäste:',
    input.notes.length === 0 ? '  (keine)' : input.notes.map(n => `  - ${n.dish} (${n.stars}/5): ${n.note}`).join('\n'),
    '',
    'Schreibe daraus den Wochenrückblick.',
  ].join('\n');

  try {
    const response = await anthropic.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 3072, // 120 bis 200 Wörter Text plus Denktokens
      // 'medium' statt 'low': aus den Zahlen echte Empfehlungen abzuleiten ist
      // mehr als eine Zusammenfassung. Läuft nur einmal am Tag je Filiale.
      output_config: { effort: 'medium' },
      system: HIGHLIGHT_SYSTEM,
      messages: [{ role: 'user', content: brief }],
      // Lehnt das Modell aus Policy-Gründen ab, beantwortet Anthropic die
      // Anfrage automatisch mit einem Ersatzmodell. Nur hier: der Rückblick
      // bleibt auf Opus (einmal am Tag je Filiale, der Kostenpunkt ist klein),
      // die beiden häufigen Aufrufe laufen auf Sonnet ohne diesen Zusatz.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    if (response.stop_reason === 'refusal') {
      return { text: fallbackHighlight(input), source: 'fallback' };
    }
    logUsage('wochenrückblick', response);
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map(b => b.text).join('\n').trim();
    if (!text) return { text: fallbackHighlight(input), source: 'fallback' };
    return { text, source: 'llm' };
  } catch (err) {
    console.error('Wochenrückblick konnte nicht erzeugt werden:', err);
    return { text: fallbackHighlight(input), source: 'fallback' };
  }
}

// ── Bon-Scan ─────────────────────────────────────────────

export interface ScanMenuItem { id: string; name: string; price: number }
export interface ScanHit { dishId: string; qty: number }

const SCAN_SYSTEM = `Du liest Restaurant-Bons und ordnest die Positionen einer vorgegebenen Speisekarte zu.

Regeln:
- Gib NUR Gerichte zurück, die in der übergebenen Karte stehen, und nur mit deren exakter ID.
- Die Schreibweise auf dem Bon weicht oft ab (Abkürzungen, Kassenkürzel, Tippfehler). Ordne sinngemäß zu.
- Steht eine Position nicht in der Karte, lass sie weg. Rate nicht.
- Übernimm die Menge vom Bon. Ohne erkennbare Menge: 1.
- Kommt dieselbe Position mehrfach vor, fasse sie zu einer Zeile mit summierter Menge zusammen.
- Ist das Bild unlesbar oder kein Bon, gib eine leere Liste zurück.`;

/**
 * Erkennt Gerichte auf dem Foto eines Bons.
 *
 * `null` heißt „konnte nicht" (kein Schlüssel, Fehler) — davon unterschieden ist
 * die leere Liste, die heißt „gelesen, aber nichts Passendes gefunden". Die
 * Oberfläche muss beides auseinanderhalten, sonst steht die Servicekraft vor
 * einem leeren Ergebnis und weiß nicht, ob sie neu fotografieren soll.
 */
export async function scanReceipt(
  imageDataUri: string, menu: ScanMenuItem[], apiKey?: string | null,
): Promise<ScanHit[] | null> {
  const anthropic = claudeClient(apiKey);
  if (!anthropic || menu.length === 0) return null;

  const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/.exec(imageDataUri);
  if (!match) return null;
  const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  const base64 = match[2];

  const card = menu.map(d => `${d.id} | ${d.name} | ${d.price.toFixed(2)} EUR`).join('\n');

  try {
    const response = await anthropic.beta.messages.create({
      // Sonnet statt Opus: einen Bon gegen eine kurze Karte abzugleichen
      // braucht kein Spitzenmodell, und der Scan skaliert mit der Nutzung
      // durch das Personal. Ein Drittel des Preises bei gleicher Trefferquote.
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    dishId: { type: 'string', description: 'ID aus der übergebenen Karte' },
                    qty: { type: 'integer', description: 'Anzahl laut Bon' },
                  },
                  required: ['dishId', 'qty'],
                  additionalProperties: false,
                },
              },
            },
            required: ['items'],
            additionalProperties: false,
          },
        },
      },
      system: SCAN_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: `Speisekarte (ID | Name | Preis):\n${card}\n\nWelche dieser Gerichte stehen auf dem Bon?` },
        ],
      }],
    });

    if (response.stop_reason === 'refusal') return null;
    logUsage('bon-scan', response);

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map(b => b.text).join('').trim();
    if (!text) return null;

    const parsed = JSON.parse(text) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return null;

    // Was das Modell liefert, ist Vorschlag, nicht Wahrheit: nur IDs aus der
    // übergebenen Karte zählen, und die Menge wird begrenzt — dieselbe Regel
    // wie bei jeder anderen Eingabe von außen (siehe requireQty in index.ts).
    const known = new Set(menu.map(d => d.id));
    const hits: ScanHit[] = [];
    for (const raw of parsed.items) {
      const row = raw as { dishId?: unknown; qty?: unknown };
      if (typeof row.dishId !== 'string' || !known.has(row.dishId)) continue;
      const qty = Math.min(20, Math.max(1, Math.round(Number(row.qty) || 1)));
      const existing = hits.find(h => h.dishId === row.dishId);
      if (existing) existing.qty = Math.min(20, existing.qty + qty);
      else hits.push({ dishId: row.dishId, qty });
    }
    return hits;
  } catch (err) {
    console.error('Bon konnte nicht gelesen werden:', err);
    return null;
  }
}
