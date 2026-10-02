'use server'

import { getOrgContext } from '@/lib/orgs/context'
import { verifyEmails } from '@/lib/labs/email-verify'
import { checkEmailAuth, guessEmails, lookupTech, searchDomain } from '@/lib/labs/domain-tools'
import { writeOutreach } from '@/lib/labs/email-writer'

/**
 * Labs: tools being tried out before they join the main workflow. Every
 * action needs a signed-in workspace member; list sizes are capped so a
 * paste can't turn into a crawl.
 */

/** Any unexpected failure becomes a plain error result the panel can show. */
async function safely<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn()
  } catch (e) {
    console.error('[labs]', e instanceof Error ? e.message : e)
    return { ok: false as const, error: 'That took too long or the site refused us. Try again, or try another site.' }
  }
}

async function requireMember(): Promise<string | null> {
  const ctx = await getOrgContext()
  return ctx ? null : 'Sign in to a workspace first.'
}

const splitList = (text: string) =>
  String(text ?? '')
    .split(/[\s,;]+/)
    .map(s => s.trim())
    .filter(Boolean)

export async function verifyEmailsAction(text: string) {
  return safely(async () => {
    const denied = await requireMember()
    if (denied) return { ok: false as const, error: denied }
    const list = splitList(text)
    if (list.length === 0) return { ok: false as const, error: 'Paste at least one email address.' }
    return { ok: true as const, results: await verifyEmails(list, 50), capped: list.length > 50 }
  })
}

export async function searchDomainsAction(text: string) {
  return safely(async () => {
    const denied = await requireMember()
    if (denied) return { ok: false as const, error: denied }
    const list = Array.from(new Set(splitList(text))).slice(0, 10)
    if (list.length === 0) return { ok: false as const, error: 'Type at least one website.' }
    const results = []
    for (let i = 0; i < list.length; i += 3) {
      results.push(...(await Promise.all(list.slice(i, i + 3).map(d => searchDomain(d)))))
    }
    return { ok: true as const, results }
  })
}

export async function guessEmailsAction(first: string, last: string, domain: string) {
  return safely(async () => {
    const denied = await requireMember()
    if (denied) return { ok: false as const, error: denied }
    const res = await guessEmails(first, last, domain)
    return res.error ? { ok: false as const, error: res.error } : { ok: true as const, ...res }
  })
}

export async function checkEmailAuthAction(domain: string) {
  return safely(async () => {
    const denied = await requireMember()
    if (denied) return { ok: false as const, error: denied }
    const res = await checkEmailAuth(domain)
    return res.error ? { ok: false as const, error: res.error } : { ok: true as const, ...res }
  })
}

export async function lookupTechAction(domain: string) {
  return safely(async () => {
    const denied = await requireMember()
    if (denied) return { ok: false as const, error: denied }
    const res = await lookupTech(domain)
    return res.error ? { ok: false as const, error: res.error } : { ok: true as const, ...res }
  })
}

export async function writeEmailAction(input: {
  domain: string
  brand: string
  offer: string
  channel: 'email' | 'sms'
  tone: 'friendly' | 'direct' | 'formal'
  senderName: string
}) {
  return safely(async () => {
    const denied = await requireMember()
    if (denied) return { ok: false as const, error: denied }
    if (!String(input.domain ?? '').trim()) return { ok: false as const, error: 'Type the website you are writing to.' }
    if (!String(input.brand ?? '').trim()) return { ok: false as const, error: 'Type your brand name.' }
    const res = await writeOutreach({
      domain: String(input.domain).trim().slice(0, 120),
      brand: String(input.brand).trim().slice(0, 80),
      offer: String(input.offer ?? '').trim().slice(0, 200),
      channel: input.channel === 'sms' ? 'sms' : 'email',
      tone: ['friendly', 'direct', 'formal'].includes(input.tone) ? input.tone : 'friendly',
      senderName: String(input.senderName ?? '').trim().slice(0, 60) || 'The partnerships team',
    })
    return { ok: true as const, ...res }
  })
}
