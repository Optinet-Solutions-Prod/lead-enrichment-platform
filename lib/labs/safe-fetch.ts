import 'server-only'
import { promises as dns } from 'node:dns'
import net from 'node:net'

/**
 * Fetch a page a user typed in, without letting it reach our own network:
 * every hop (and every redirect target) must be http(s) on the default port
 * and resolve only to public addresses.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36'
const MAX_BYTES = 1_500_000

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number) as [number, number]
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    )
  }
  const v = ip.toLowerCase()
  if (v === '::1' || v === '::') return true
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7))
  return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff')
}

/** Lower-case bare hostname from "Example.com", "https://example.com/x", "www.example.com". */
export function normalizeHost(raw: string): string | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  let host: string
  try {
    host = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname
  } catch {
    return null
  }
  host = host.replace(/\.$/, '')
  if (!host.includes('.') || net.isIP(host) || host.length > 253) return null
  if (!/^[a-z0-9.-]+$/.test(host) || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)) return null
  return host
}

/** Resolve or give up: Node's resolver has no timeout of its own. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>(r => setTimeout(() => r(fallback), ms))])
}

/**
 * DNS over HTTPS (Cloudflare), used when the system resolver fails or times
 * out — large TXT answers need TCP, which some networks drop.
 */
export async function dohQuery(name: string, type: 'TXT' | 'MX' | 'A'): Promise<string[]> {
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const body = (await res.json()) as { Answer?: Array<{ type: number; data: string }> }
    const want = type === 'TXT' ? 16 : type === 'MX' ? 15 : 1
    return (body.Answer ?? [])
      .filter(a => a.type === want)
      .map(a => (type === 'TXT' ? a.data.replace(/^"|"$/g, '').replace(/"\s*"/g, '') : a.data))
  } catch {
    return []
  }
}

export async function hostIsPublic(host: string): Promise<boolean> {
  try {
    const addrs = await withTimeout(dns.lookup(host, { all: true, verbatim: true }), 4000, [])
    return addrs.length > 0 && addrs.every(a => !isPrivateIp(a.address))
  } catch {
    return false
  }
}

export type SafePage = { url: string; status: number; html: string | null; headers: Record<string, string>; error: string | null }

export async function safeFetchPage(startUrl: string, timeoutMs = 9000): Promise<SafePage> {
  let url = startUrl
  const deadline = Date.now() + timeoutMs
  for (let hop = 0; hop < 5; hop++) {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      return { url, status: 0, html: null, headers: {}, error: 'Bad address' }
    }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || (u.port && u.port !== '80' && u.port !== '443')) {
      return { url, status: 0, html: null, headers: {}, error: 'Only plain http(s) addresses are opened' }
    }
    const host = normalizeHost(u.hostname)
    if (!host || !(await hostIsPublic(host))) return { url, status: 0, html: null, headers: {}, error: 'That address is not a public website' }
    const left = deadline - Date.now()
    if (left <= 0) return { url, status: 0, html: null, headers: {}, error: 'Timed out' }
    let res: Response
    try {
      res = await fetch(u, {
        redirect: 'manual',
        signal: AbortSignal.timeout(left),
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'en-GB,en;q=0.8' },
      })
    } catch (e) {
      const msg = e instanceof Error ? (e.name === 'TimeoutError' ? 'Timed out' : e.message) : String(e)
      return { url, status: 0, html: null, headers: {}, error: msg.slice(0, 160) }
    }
    const headers: Record<string, string> = {}
    res.headers.forEach((v, k) => {
      headers[k] = v
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, u).toString()
      continue
    }
    if (!res.ok) return { url, status: res.status, html: null, headers, error: `HTTP ${res.status}` }
    const type = res.headers.get('content-type') ?? ''
    if (type && !/html|xml|text\/plain/i.test(type)) return { url, status: res.status, html: null, headers, error: `Not a web page (${type.split(';')[0]})` }
    try {
      const text = await res.text()
      return { url, status: res.status, html: text.slice(0, MAX_BYTES), headers, error: null }
    } catch (e) {
      const msg = e instanceof Error ? (e.name === 'TimeoutError' || e.name === 'AbortError' ? 'Timed out' : e.message) : String(e)
      return { url, status: res.status, html: null, headers, error: msg.slice(0, 160) }
    }
  }
  return { url, status: 0, html: null, headers: {}, error: 'Too many redirects' }
}
