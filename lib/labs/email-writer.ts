import 'server-only'
import { callOpenAI } from '@/lib/ai-analysis/core'
import { siteSummary } from './domain-tools'

/**
 * A first partnership email (or SMS) to a site, written from what the site
 * says about itself. OpenAI when a key is configured; a plain template
 * otherwise. Never sends anything.
 */

export type WriterInput = {
  domain: string
  brand: string
  offer: string
  channel: 'email' | 'sms'
  tone: 'friendly' | 'direct' | 'formal'
  senderName: string
}

export type WriterOutput = { subject: string | null; body: string; source: 'ai' | 'template'; siteTitle: string | null }

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
  required: ['subject', 'body'],
}

function template(i: WriterInput, title: string | null): WriterOutput {
  const site = title?.split(/[|–—-]/)[0]?.trim() || i.domain
  if (i.channel === 'sms') {
    return {
      subject: null,
      body: `Hi ${site} team, ${i.senderName} from ${i.brand} here. We'd like to work with ${i.domain}${i.offer ? ` — ${i.offer}` : ''}. Open to a quick chat? Reply STOP to opt out.`,
      source: 'template',
      siteTitle: title,
    }
  }
  const greet = i.tone === 'formal' ? `Dear ${site} team,` : `Hi ${site} team,`
  return {
    subject: `Partnership idea: ${i.brand} × ${i.domain}`,
    body: [
      greet,
      '',
      `I'm ${i.senderName} from ${i.brand}. I came across ${i.domain} and your audience looks like a strong fit for us.`,
      i.offer ? `We'd like to offer ${i.offer}.` : 'We run a partner programme with competitive terms and dedicated support.',
      '',
      i.tone === 'direct' ? 'Can we set up a 15-minute call this week?' : 'Would you be open to a short call to see if it makes sense?',
      '',
      'Best regards,',
      i.senderName,
      '',
      "If you'd rather not hear from us, just reply and we won't write again.",
    ].join('\n'),
    source: 'template',
    siteTitle: title,
  }
}

export async function writeOutreach(i: WriterInput): Promise<WriterOutput> {
  const site = await siteSummary(i.domain).catch(() => ({ domain: i.domain, title: null, description: null }))
  const key = (process.env.OPENAI_API_KEY ?? '').trim()
  if (!key) return template(i, site.title)

  const instructions = [
    `Write a short first ${i.channel === 'sms' ? 'SMS (max 300 characters, subject empty)' : 'cold email (max 120 words)'} proposing an affiliate or content partnership.`,
    `Tone: ${i.tone}. Sound like one person writing to another, not marketing copy. One specific detail about the site, one clear ask, no exaggerated claims, no emojis.`,
    'End with a one-line way to opt out. Reply strict JSON only.',
  ].join('\n')
  const input = [
    `Sender: ${i.senderName} at ${i.brand}`,
    i.offer ? `Offer: ${i.offer}` : '',
    `Site: ${i.domain}`,
    site.title ? `Site title: ${site.title}` : '',
    site.description ? `Site description: ${site.description}` : '',
  ].filter(Boolean).join('\n')

  const res = await callOpenAI(
    key,
    {
      model: 'gpt-5-mini',
      reasoning: { effort: 'low' },
      instructions,
      input,
      text: { format: { type: 'json_schema', name: 'outreach', strict: true, schema: SCHEMA } },
    },
    25_000,
  )
  const parsed = res.parsed as { subject?: string; body?: string } | null
  if (!res.ok || !parsed?.body) return template(i, site.title)
  return { subject: i.channel === 'sms' ? null : parsed.subject || null, body: parsed.body, source: 'ai', siteTitle: site.title }
}
