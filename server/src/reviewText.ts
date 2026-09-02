import type Anthropic from '@anthropic-ai/sdk';
import { claudeClient, logUsage } from './ai.js';

// ═══════════════════════════════════════════════════════════
// LLM-Rezensionstext
//
// Aus den Sterne-Bewertungen + Notizen eines Gasts wird ein
// fertiger Rezensionstext erzeugt, den der Gast kopieren und
// auf Google/TripAdvisor posten kann.
//
// Ohne ANTHROPIC_API_KEY (oder wenn die API ausfällt) greift eine
// deterministische Vorlage — der Gast-Flow bleibt dadurch immer
// funktionsfähig, auch in einer Demo ohne Key.
// ═══════════════════════════════════════════════════════════

export interface ReviewTextInput {
  restaurantName: string;
  branchName?: string | null;
  dishes: { name: string; stars: number; note?: string }[];
  overall: { service: number; ambience: number; speed: number };
}

export interface ReviewTextResult {
  text: string;
  source: 'llm' | 'fallback';
  /** Nur gesetzt, wenn auf die Vorlage zurückgefallen wurde — für Admin-Diagnose. */
  fallbackReason?: string;
}

const STAR_WORDS: Record<number, string> = {
  5: 'zufrieden', 4: 'gut', 3: 'geht so', 2: 'eher enttäuscht', 1: 'schlecht',
};

const SYSTEM_PROMPT = `Du schreibst kurze Restaurant-Rezensionen auf Deutsch, so wie ein normaler Gast sie beiläufig auf Google Maps hinterlässt. Nicht wie ein Kritiker, nicht wie Werbung.

Regeln:
- Ich-Form, Alltagssprache, nüchtern. So, wie jemand schnell zwei, drei Sätze hinschreibt.
- Kurz. Meist zwei bis vier Sätze, 25 bis 50 Wörter. Lieber zu knapp als zu lang.
- Nicht übertreiben. Auch bei fünf Sternen kein Schwärmen, keine Häufung von Superlativen, keine Ausrufezeichen. „War gut, komme wieder" reicht völlig.
- Keine Gedankenstriche. Wo einer stehen würde, nimm Komma oder Punkt.
- Nenne die bewerteten Gerichte beim Namen. Die Tonlage passt zu den Sternen: 5 = zufrieden, 4 = gut, 3 = geht so, 2 = eher enttäuscht, 1 = schlecht.
- Greife die Anmerkungen des Gasts sinngemäß auf, kopiere sie nicht wörtlich.
- Erfinde nichts dazu: keine Preise, Namen von Mitarbeitenden, Wartezeiten, Öffnungszeiten oder Anlässe, die nicht in den Daten stehen.
- Bei niedrigen Bewertungen sachlich und fair, nicht beleidigend.
- Keine Emojis, keine Hashtags, keine Überschrift, keine Anführungszeichen um den Text.

Gib ausschließlich den Rezensionstext aus. Keine Einleitung, keine Alternativen, keine Erklärung.`;

/** Deterministische Vorlage — Notausgang ohne API-Key oder bei API-Fehlern. */
export function fallbackReviewText(input: ReviewTextInput): string {
  const rated = input.dishes.filter(d => d.stars > 0);
  const avg = rated.length > 0
    ? rated.reduce((a, d) => a + d.stars, 0) / rated.length
    : 0;

  const liked = rated.filter(d => d.stars >= 4).map(d => d.name);
  const disliked = rated.filter(d => d.stars <= 2).map(d => d.name);

  const list = (names: string[]) =>
    names.length <= 1 ? names[0] : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;

  const parts: string[] = [];
  parts.push(
    avg >= 4 ? `War im ${input.restaurantName} und hat sich gelohnt.`
      : avg >= 3 ? `War im ${input.restaurantName}, insgesamt solide.`
      : `War im ${input.restaurantName}, leider nicht überzeugend.`
  );
  if (liked.length > 0) parts.push(`${list(liked)} kann ich empfehlen.`);
  if (disliked.length > 0) parts.push(`${list(disliked)} hat mich dagegen nicht überzeugt.`);

  const { service, ambience, speed } = input.overall;
  const strong = [
    service >= 4 ? 'der Service' : null,
    ambience >= 4 ? 'das Ambiente' : null,
    speed >= 4 ? 'die Schnelligkeit' : null,
  ].filter((v): v is string => v !== null);
  const weak = [
    service > 0 && service <= 2 ? 'der Service' : null,
    ambience > 0 && ambience <= 2 ? 'das Ambiente' : null,
    speed > 0 && speed <= 2 ? 'die Wartezeit' : null,
  ].filter((v): v is string => v !== null);

  if (strong.length > 0) parts.push(`Auch ${list(strong)} hat gepasst.`);
  if (weak.length > 0) parts.push(`Luft nach oben gibt es bei ${list(weak)}.`);
  parts.push(avg >= 4 ? 'Komme gerne wieder.' : avg >= 3 ? 'Einen zweiten Besuch ist es wert.' : 'Vielleicht hatte ich einen schlechten Tag erwischt.');

  return parts.join(' ');
}

export async function generateReviewText(input: ReviewTextInput, apiKey?: string | null): Promise<ReviewTextResult> {
  const rated = input.dishes.filter(d => d.stars > 0);
  if (rated.length === 0) {
    return { text: fallbackReviewText(input), source: 'fallback', fallbackReason: 'Keine bewerteten Gerichte.' };
  }

  const anthropic = claudeClient(apiKey);
  if (!anthropic) {
    return {
      text: fallbackReviewText(input),
      source: 'fallback',
      fallbackReason: 'Kein API-Schlüssel hinterlegt — Vorlage statt KI-Text.',
    };
  }

  const brief = [
    `Restaurant: ${input.restaurantName}${input.branchName ? ` (${input.branchName})` : ''}`,
    '',
    'Bewertete Gerichte:',
    ...rated.map(d =>
      `- ${d.name}: ${d.stars}/5 (${STAR_WORDS[d.stars] ?? ''})${d.note ? ` — Anmerkung des Gasts: „${d.note}"` : ''}`
    ),
    '',
    // Nur, wonach der Gast auch gefragt wurde. Ambiente und Schnelligkeit
    // stehen nicht mehr im Fragebogen und kommen als 0 an; „Ambiente: 0/5" im
    // Auftrag läse das Modell als vernichtendes Urteil.
    ...(input.overall.service > 0 || input.overall.ambience > 0 || input.overall.speed > 0
      ? [
        'Gesamteindruck:',
        ...(input.overall.service > 0 ? [`- Service: ${input.overall.service}/5`] : []),
        ...(input.overall.ambience > 0 ? [`- Ambiente: ${input.overall.ambience}/5`] : []),
        ...(input.overall.speed > 0 ? [`- Schnelligkeit: ${input.overall.speed}/5`] : []),
        '',
      ]
      : []),
    'Schreibe daraus die Rezension.',
  ].join('\n');

  try {
    const response = await anthropic.beta.messages.create({
      // Sonnet statt Opus: ein kurzer Rezensionstext aus einer Handvoll
      // Sterne ist keine Aufgabe für das Spitzenmodell, und dieser Aufruf
      // skaliert mit der Zahl der Bewertungen. Ein Drittel des Preises.
      model: 'claude-sonnet-5',
      max_tokens: 2048, // deckt Denk- und Antworttokens ab; der Text selbst ist kurz
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: brief }],
    });

    if (response.stop_reason === 'refusal') {
      return { text: fallbackReviewText(input), source: 'fallback', fallbackReason: 'Anfrage wurde vom Modell abgelehnt.' };
    }
    logUsage('rezensionstext', response);

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!text) {
      return { text: fallbackReviewText(input), source: 'fallback', fallbackReason: 'Leere Antwort vom Modell.' };
    }
    return { text, source: 'llm' };
  } catch (err) {
    console.error('Rezensionstext konnte nicht generiert werden:', err);
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.';
    return { text: fallbackReviewText(input), source: 'fallback', fallbackReason: message };
  }
}
