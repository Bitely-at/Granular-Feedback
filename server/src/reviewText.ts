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
//
// Zweisprachig: der Betrieb gibt die Sprache der Gastansicht vor
// (`brand.guestLang`). Steht sie auf Englisch, MUSS auch der
// Rezensionstext englisch sein — sonst kopiert ein englischer Gast
// deutschen Text in seine Google-Rezension. System-Prompt UND
// Vorlage hängen deshalb an `lang`.
// ═══════════════════════════════════════════════════════════

export type ReviewTextLang = 'de' | 'en';

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

const STAR_WORDS: Record<ReviewTextLang, Record<number, string>> = {
  de: { 5: 'zufrieden', 4: 'gut', 3: 'geht so', 2: 'eher enttäuscht', 1: 'schlecht' },
  en: { 5: 'happy', 4: 'good', 3: 'so-so', 2: 'rather disappointed', 1: 'bad' },
};

const SYSTEM_PROMPT: Record<ReviewTextLang, string> = {
  de: `Du schreibst kurze Restaurant-Rezensionen auf Deutsch, so wie ein normaler Gast sie beiläufig auf Google Maps hinterlässt. Nicht wie ein Kritiker, nicht wie Werbung.

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

Gib ausschließlich den Rezensionstext aus. Keine Einleitung, keine Alternativen, keine Erklärung.`,
  en: `You write short restaurant reviews in English, the way an ordinary guest jots one down on Google Maps in passing. Not like a critic, not like an advert.

Rules:
- First person, everyday language, matter-of-fact. The way someone quickly types two or three sentences.
- Short. Usually two to four sentences, 25 to 50 words. Rather too brief than too long.
- Do not overdo it. Even at five stars no gushing, no pile-up of superlatives, no exclamation marks. "Was good, will come back" is plenty.
- No dashes. Where one would go, use a comma or a full stop.
- Name the dishes that were rated. The tone matches the stars: 5 = happy, 4 = good, 3 = so-so, 2 = rather disappointed, 1 = bad.
- Pick up the guest's notes in substance, do not copy them word for word.
- Invent nothing: no prices, staff names, waiting times, opening hours or occasions that are not in the data.
- For low ratings stay factual and fair, not insulting.
- No emojis, no hashtags, no heading, no quotation marks around the text.

Output only the review text. No preamble, no alternatives, no explanation.`,
};

/** Deterministische Vorlage — Notausgang ohne API-Key oder bei API-Fehlern. */
export function fallbackReviewText(input: ReviewTextInput, lang: ReviewTextLang = 'de'): string {
  const rated = input.dishes.filter(d => d.stars > 0);
  const avg = rated.length > 0
    ? rated.reduce((a, d) => a + d.stars, 0) / rated.length
    : 0;

  const liked = rated.filter(d => d.stars >= 4).map(d => d.name);
  const disliked = rated.filter(d => d.stars <= 2).map(d => d.name);
  const { service, ambience, speed } = input.overall;

  if (lang === 'en') {
    const list = (names: string[]) =>
      names.length <= 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    const parts: string[] = [];
    parts.push(
      avg >= 4 ? `Went to ${input.restaurantName} and it was worth it.`
        : avg >= 3 ? `Went to ${input.restaurantName}, solid overall.`
        : `Went to ${input.restaurantName}, sadly not convincing.`
    );
    if (liked.length > 0) parts.push(`I can recommend ${list(liked)}.`);
    if (disliked.length > 0) parts.push(`${list(disliked)} did not win me over though.`);
    const strong = [
      service >= 4 ? 'the service' : null,
      ambience >= 4 ? 'the atmosphere' : null,
      speed >= 4 ? 'how quick it was' : null,
    ].filter((v): v is string => v !== null);
    const weak = [
      service > 0 && service <= 2 ? 'the service' : null,
      ambience > 0 && ambience <= 2 ? 'the atmosphere' : null,
      speed > 0 && speed <= 2 ? 'the wait' : null,
    ].filter((v): v is string => v !== null);
    if (strong.length > 0) parts.push(`${list(strong).replace(/^./, c => c.toUpperCase())} was fine too.`);
    if (weak.length > 0) parts.push(`There is room for improvement with ${list(weak)}.`);
    parts.push(avg >= 4 ? 'Happy to come back.' : avg >= 3 ? 'Worth a second visit.' : 'Maybe I just caught a bad day.');
    return parts.join(' ');
  }

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

export async function generateReviewText(
  input: ReviewTextInput,
  apiKey?: string | null,
  lang: ReviewTextLang = 'de',
): Promise<ReviewTextResult> {
  const en = lang === 'en';
  const rated = input.dishes.filter(d => d.stars > 0);
  if (rated.length === 0) {
    return {
      text: fallbackReviewText(input, lang),
      source: 'fallback',
      fallbackReason: en ? 'No rated dishes.' : 'Keine bewerteten Gerichte.',
    };
  }

  const anthropic = claudeClient(apiKey);
  if (!anthropic) {
    return {
      text: fallbackReviewText(input, lang),
      source: 'fallback',
      fallbackReason: en
        ? 'No API key configured — template instead of AI text.'
        : 'Kein API-Schlüssel hinterlegt — Vorlage statt KI-Text.',
    };
  }

  const overallShown = input.overall.service > 0 || input.overall.ambience > 0 || input.overall.speed > 0;
  const brief = en
    ? [
      `Restaurant: ${input.restaurantName}${input.branchName ? ` (${input.branchName})` : ''}`,
      '',
      'Rated dishes:',
      ...rated.map(d =>
        `- ${d.name}: ${d.stars}/5 (${STAR_WORDS.en[d.stars] ?? ''})${d.note ? ` — guest note: "${d.note}"` : ''}`
      ),
      '',
      // Nur, wonach der Gast auch gefragt wurde — 0 = nicht beurteilt.
      ...(overallShown
        ? [
          'Overall impression:',
          ...(input.overall.service > 0 ? [`- Service: ${input.overall.service}/5`] : []),
          ...(input.overall.ambience > 0 ? [`- Atmosphere: ${input.overall.ambience}/5`] : []),
          ...(input.overall.speed > 0 ? [`- Speed: ${input.overall.speed}/5`] : []),
          '',
        ]
        : []),
      'Write the review from this.',
    ].join('\n')
    : [
      `Restaurant: ${input.restaurantName}${input.branchName ? ` (${input.branchName})` : ''}`,
      '',
      'Bewertete Gerichte:',
      ...rated.map(d =>
        `- ${d.name}: ${d.stars}/5 (${STAR_WORDS.de[d.stars] ?? ''})${d.note ? ` — Anmerkung des Gasts: „${d.note}"` : ''}`
      ),
      '',
      // Nur, wonach der Gast auch gefragt wurde. Ambiente und Schnelligkeit
      // stehen nicht mehr im Fragebogen und kommen als 0 an; „Ambiente: 0/5" im
      // Auftrag läse das Modell als vernichtendes Urteil.
      ...(overallShown
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
      system: SYSTEM_PROMPT[lang],
      messages: [{ role: 'user', content: brief }],
    });

    if (response.stop_reason === 'refusal') {
      return {
        text: fallbackReviewText(input, lang),
        source: 'fallback',
        fallbackReason: en ? 'Request was refused by the model.' : 'Anfrage wurde vom Modell abgelehnt.',
      };
    }
    logUsage('rezensionstext', response);

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!text) {
      return {
        text: fallbackReviewText(input, lang),
        source: 'fallback',
        fallbackReason: en ? 'Empty response from the model.' : 'Leere Antwort vom Modell.',
      };
    }
    return { text, source: 'llm' };
  } catch (err) {
    console.error('Rezensionstext konnte nicht generiert werden:', err);
    const message = err instanceof Error ? err.message : (en ? 'Unknown error.' : 'Unbekannter Fehler.');
    return { text: fallbackReviewText(input, lang), source: 'fallback', fallbackReason: message };
  }
}
