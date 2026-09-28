/**
 * Vertical modules and which of them this deployment shows.
 *
 * The property module (owner leads, Airbnb, licence register, workflows) is
 * secluded: it is moving to its own repository
 * (Optinet-Solutions-Prod/property-listings-scraper). Its code stays here
 * behind this switch so the two trees can be diffed during the transfer, but
 * nothing renders, routes or advertises it unless NEXT_PUBLIC_PROPERTY_MODULE
 * is set to "on" at build time.
 *
 * Plain constants only — imported by the edge proxy and client components.
 */
export const PROPERTY_MODULE_ENABLED = process.env.NEXT_PUBLIC_PROPERTY_MODULE === 'on'

/** Dashboard routes that belong to the property module. */
export const PROPERTY_ROUTE_PREFIXES = [
  '/property-scrape',
  '/property-leads',
  '/pm-prospects',
  '/airbnb-listings',
  '/hfps-register',
  '/pipeline',
] as const

export function isPropertyRoute(pathname: string): boolean {
  return PROPERTY_ROUTE_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

/** The modules an org may actually see: what its settings say, minus the
 *  secluded ones. Never empty — the discovery vertical is the default. */
export function visibleModules(modules: readonly string[] | null | undefined): string[] {
  const list = (modules ?? []).filter(m => PROPERTY_MODULE_ENABLED || m !== 'property')
  return list.length > 0 ? list : ['affiliate']
}
