import 'server-only'
import { promises as dns } from 'node:dns'
import { dohQuery, withTimeout } from './safe-fetch'

/**
 * Email check without sending anything: syntax, whether the domain can take
 * mail (MX, or an A record as the RFC fallback), throwaway providers, role
 * inboxes and free webmail. A mailbox-level SMTP probe is not done — cloud
 * hosts block outbound port 25 — so "deliverable domain" is the strongest
 * verdict, and the UI says so.
 */

export type EmailVerdict = 'deliverable_domain' | 'risky' | 'undeliverable' | 'invalid'

export type EmailCheck = {
  email: string
  verdict: EmailVerdict
  reason: string
  domain: string | null
  mx: string[]
  disposable: boolean
  role: boolean
  freeProvider: boolean
}

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', '10minutemail.net', 'tempmail.com',
  'temp-mail.org', 'tempmailo.com', 'yopmail.com', 'yopmail.net', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc',
  'mailnesia.com', 'throwawaymail.com', 'fakeinbox.com', 'emailondeck.com', 'mintemail.com', 'moakt.com', 'mohmal.com', 'burnermail.io',
  'spamgourmet.com', 'mytemp.email', 'tempinbox.com', 'mailcatch.com', 'inboxkitten.com', 'tmail.ws', 'tmpmail.org', 'discard.email',
])
const FREE = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'web.de', 'mail.com', 'yandex.com', 'zoho.com',
])
const ROLE = /^(info|contact|hello|hi|support|help|admin|sales|marketing|press|media|office|team|enquiries|inquiries|partners?|partnerships|affiliates?|advertis(e|ing)|editor|editorial|news|billing|accounts|jobs|careers|hr|privacy|legal|abuse|noreply|no-reply|webmaster|postmaster)$/i

const mxCache = new Map<string, Promise<string[] | null>>()

async function mxFor(domain: string): Promise<string[] | null> {
  if (!mxCache.has(domain)) {
    mxCache.set(
      domain,
      (async () => {
        try {
          const recs = await withTimeout(dns.resolveMx(domain), 4000, [])
          const hosts = recs.sort((a, b) => a.priority - b.priority).map(r => r.exchange).filter(h => h && h !== '.')
          if (hosts.length) return hosts
          const viaDoh = (await dohQuery(domain, 'MX')).map(d => (d.split(/\s+/)[1] ?? '').replace(/\.$/, '')).filter(h => h && h !== '.')
          if (viaDoh.length) return viaDoh
        } catch {
          /* fall through */
        }
        try {
          const a = await withTimeout(dns.resolve4(domain), 4000, [])
          return a.length ? [`${domain} (A record)`] : []
        } catch {
          return []
        }
      })(),
    )
  }
  return mxCache.get(domain)!
}

export async function verifyEmail(raw: string): Promise<EmailCheck> {
  const email = String(raw ?? '').trim().toLowerCase().replace(/^mailto:/, '')
  const base: EmailCheck = { email, verdict: 'invalid', reason: '', domain: null, mx: [], disposable: false, role: false, freeProvider: false }
  if (!EMAIL_RE.test(email) || email.length > 254) return { ...base, reason: 'Not a valid email address' }
  const [local, domain] = email.split('@') as [string, string]
  const disposable = DISPOSABLE.has(domain)
  const role = ROLE.test(local)
  const freeProvider = FREE.has(domain)
  const mx = (await mxFor(domain)) ?? []
  const out = { ...base, domain, mx, disposable, role, freeProvider }
  if (mx.length === 0) return { ...out, verdict: 'undeliverable', reason: 'The domain has no mail server' }
  if (disposable) return { ...out, verdict: 'risky', reason: 'Throwaway inbox provider' }
  if (role) return { ...out, verdict: 'deliverable_domain', reason: 'Team inbox (role address); domain accepts mail' }
  return { ...out, verdict: 'deliverable_domain', reason: freeProvider ? 'Personal webmail; domain accepts mail' : 'Domain accepts mail' }
}

export async function verifyEmails(list: string[], max = 50): Promise<EmailCheck[]> {
  const unique = Array.from(new Set(list.map(e => e.trim().toLowerCase()).filter(Boolean))).slice(0, max)
  const out: EmailCheck[] = []
  for (let i = 0; i < unique.length; i += 8) {
    out.push(...(await Promise.all(unique.slice(i, i + 8).map(verifyEmail))))
  }
  return out
}
