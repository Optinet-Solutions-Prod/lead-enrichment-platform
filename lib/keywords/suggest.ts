import 'server-only'
import { callOpenAI } from '@/lib/ai-analysis/core'

/**
 * Keyword ideas for a niche or brand: the searches affiliate, review and
 * comparison sites rank for. OpenAI when a key is configured, a pattern list
 * in the local language otherwise. The caller removes what the workspace has
 * already scraped.
 */

export const GAMBLING_RE = /\b(casinos?|gambl\w*|betting|bets?|bookmakers?|slots?|poker|roulette|blackjack|sportsbooks?|wett\w*|spielbank|apuestas|scommesse|paris sportifs|kasyno|bukmacher)\b/i

export type KeywordIdea = { keyword: string; angle: string }

const YEAR = new Date().getUTCFullYear()

/** Search patterns per language. {s} is the niche, {c} the country name. */
const PATTERNS: Record<string, Array<[string, string]>> = {
  en: [
    ['best {s}', 'best-of lists'],
    ['best {s} ' + YEAR, 'best-of lists'],
    ['{s} review', 'reviews'],
    ['{s} reviews ' + YEAR, 'reviews'],
    ['top 10 {s}', 'best-of lists'],
    ['{s} comparison', 'comparisons'],
    ['cheapest {s}', 'deals'],
    ['{s} deals', 'deals'],
    ['{s} discount code', 'coupons'],
    ['{s} coupon', 'coupons'],
    ['{s} alternatives', 'alternatives'],
    ['best {s} for beginners', 'use cases'],
    ['best {s} for small business', 'use cases'],
    ['is {s} worth it', 'reviews'],
    ['best {s} in {c}', 'local'],
    ['{s} {c}', 'local'],
  ],
  de: [
    ['beste {s}', 'Bestenlisten'], ['{s} test', 'Tests'], ['{s} vergleich', 'Vergleiche'], ['{s} test ' + YEAR, 'Tests'],
    ['{s} erfahrungen', 'Erfahrungen'], ['günstige {s}', 'Angebote'], ['{s} gutschein', 'Gutscheine'], ['{s} alternativen', 'Alternativen'],
    ['{s} testsieger', 'Bestenlisten'], ['{s} für anfänger', 'Anwendungen'], ['{s} deutschland', 'lokal'],
  ],
  fr: [
    ['meilleur {s}', 'classements'], ['{s} avis', 'avis'], ['comparatif {s}', 'comparatifs'], ['meilleur {s} ' + YEAR, 'classements'],
    ['{s} pas cher', 'offres'], ['code promo {s}', 'codes promo'], ['alternative {s}', 'alternatives'], ['{s} france', 'local'],
  ],
  es: [
    ['mejor {s}', 'rankings'], ['{s} opiniones', 'opiniones'], ['comparativa {s}', 'comparativas'], ['mejores {s} ' + YEAR, 'rankings'],
    ['{s} barato', 'ofertas'], ['código descuento {s}', 'cupones'], ['alternativas a {s}', 'alternativas'], ['{s} españa', 'local'],
  ],
  it: [
    ['migliore {s}', 'classifiche'], ['{s} recensioni', 'recensioni'], ['confronto {s}', 'confronti'], ['migliori {s} ' + YEAR, 'classifiche'],
    ['{s} economico', 'offerte'], ['codice sconto {s}', 'coupon'], ['alternative a {s}', 'alternative'], ['{s} italia', 'locale'],
  ],
  nl: [
    ['beste {s}', 'toplijsten'], ['{s} review', 'reviews'], ['{s} vergelijken', 'vergelijkingen'], ['beste {s} ' + YEAR, 'toplijsten'],
    ['goedkope {s}', 'aanbiedingen'], ['{s} kortingscode', 'kortingscodes'], ['{s} alternatieven', 'alternatieven'], ['{s} nederland', 'lokaal'],
  ],
}

function fromPatterns(seed: string, language: string, countryName: string): KeywordIdea[] {
  const list = PATTERNS[language] ?? PATTERNS.en!
  return list.map(([p, angle]) => ({
    keyword: p.replace('{s}', seed).replace('{c}', countryName).replace(/\s+/g, ' ').trim().toLowerCase(),
    angle,
  }))
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { keyword: { type: 'string' }, angle: { type: 'string' } },
        required: ['keyword', 'angle'],
      },
    },
  },
  required: ['ideas'],
}

async function fromAi(
  key: string,
  seed: string,
  language: string,
  countryName: string,
  avoid: string[],
  gambling: boolean,
): Promise<KeywordIdea[] | null> {
  const instructions = [
    'You plan Google searches for a partnerships team. They want to find AFFILIATE, review and comparison websites that could promote their brand.',
    `Suggest 16 search queries that such sites rank for, as a person in ${countryName} would type them, written in the language with code "${language}".`,
    'Mix the angles: best-of lists, reviews, head-to-head comparisons, deals and coupon codes, alternatives, and specific use cases. Keep each query 2 to 6 words, lower case, no quotes, no brand names unless the niche is a brand.',
    gambling ? '' : 'Never suggest gambling, casino or betting queries.',
    'Give each query a one or two word angle label. Reply strict JSON only.',
  ].filter(Boolean).join('\n')
  const input = [`Niche or brand: ${seed}`, avoid.length ? `Already searched, do not repeat: ${avoid.slice(0, 150).join('; ')}` : ''].filter(Boolean).join('\n')
  const res = await callOpenAI(
    key,
    {
      model: 'gpt-5-mini',
      reasoning: { effort: 'low' },
      instructions,
      input,
      text: { format: { type: 'json_schema', name: 'keyword_ideas', strict: true, schema: SCHEMA } },
    },
    25_000,
  )
  const ideas = (res.parsed as { ideas?: KeywordIdea[] } | null)?.ideas
  if (!res.ok || !Array.isArray(ideas)) return null
  return ideas
    .filter(i => typeof i?.keyword === 'string')
    .map(i => ({ keyword: i.keyword.toLowerCase().replace(/\s+/g, ' ').trim(), angle: String(i.angle ?? '').slice(0, 24) }))
}

export async function suggestKeywords(input: {
  seed: string
  language: string
  countryName: string
  /** Lower-cased keywords to leave out: the workspace's history plus the current list. */
  exclude: Set<string>
  gambling: boolean
}): Promise<{ ideas: KeywordIdea[]; source: 'ai' | 'patterns'; hiddenUsed: number }> {
  const seed = input.seed.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60)
  const key = (process.env.OPENAI_API_KEY ?? '').trim()
  let source: 'ai' | 'patterns' = 'patterns'
  let ideas: KeywordIdea[] | null = null
  if (key) {
    ideas = await fromAi(key, seed, input.language, input.countryName, [...input.exclude], input.gambling).catch(() => null)
    if (ideas && ideas.length) source = 'ai'
  }
  if (!ideas || ideas.length === 0) ideas = fromPatterns(seed, input.language, input.countryName)

  const seen = new Set<string>()
  let hiddenUsed = 0
  const out: KeywordIdea[] = []
  for (const i of ideas) {
    const k = i.keyword
    if (k.length < 3 || k.length > 120 || seen.has(k)) continue
    seen.add(k)
    if (!input.gambling && GAMBLING_RE.test(k)) continue
    if (input.exclude.has(k)) {
      hiddenUsed++
      continue
    }
    out.push(i)
  }
  return { ideas: out.slice(0, 12), source, hiddenUsed }
}
