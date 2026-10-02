import { FlaskConical } from 'lucide-react'
import { LabsTools } from './_components/labs-tools'

export const dynamic = 'force-dynamic'
// Domain search over ten sites can take a minute; the actions run in this route.
export const maxDuration = 120

/**
 * /labs — potential features, live and testable, before they join the main
 * workflow. Modelled on what a full lead-generation suite offers (finder,
 * verifier, deliverability, writer, campaigns, CRM sync); the ones we can run
 * without a paid data provider are built, the rest are listed with what they
 * would need.
 */

const ROADMAP: Array<{ title: string; body: string; needs: string }> = [
  {
    title: 'Drip campaigns and sequences',
    body: 'Send the first email and two follow-ups on a schedule, stop on reply, per lead list.',
    needs: 'A connected sending domain (Resend with your DNS) or a Google / Microsoft mailbox.',
  },
  {
    title: 'Open and click tracking',
    body: 'See who opened and clicked, and move replied leads to “Replied” automatically.',
    needs: 'Sending through the app first, plus a tracking domain on your DNS.',
  },
  {
    title: 'Email warm-up',
    body: 'Build sender reputation slowly before a new domain sends at volume.',
    needs: 'Mailbox access and a warm-up network; usually better bought from a specialist.',
  },
  {
    title: 'Multichannel outreach',
    body: 'Email and SMS from the same sequence, with LinkedIn steps kept manual.',
    needs: 'A Twilio (or similar) account for SMS. LinkedIn automation is left out on purpose — it breaks their terms.',
  },
  {
    title: 'CRM sync',
    body: 'Push hearted or replied sites to HubSpot or Pipedrive as companies and contacts.',
    needs: 'An API key from your CRM; mapping of our fields to theirs.',
  },
  {
    title: 'People search and LinkedIn email finder',
    body: 'Find the named partnerships manager behind a site, not only the team inbox.',
    needs: 'A licensed people-data provider. We will not scrape LinkedIn.',
  },
  {
    title: 'Phone number finder',
    body: 'Direct phone numbers for named contacts.',
    needs: 'A licensed phone-data provider; today we only show numbers a site publishes itself.',
  },
  {
    title: 'Inbox placement test and blacklist check',
    body: 'Send a test to seed inboxes and see whether it lands in inbox, promotions or spam; check IP and domain blocklists.',
    needs: 'Seed mailboxes at the big providers and a blocklist data feed.',
  },
  {
    title: 'Public API and Chrome extension',
    body: 'Run the finder, verifier and enrichment from your own tools or while browsing a site.',
    needs: 'API keys per workspace and a published extension.',
  },
]

export default function LabsPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      <header>
        <h1 className="inline-flex items-center gap-2 text-[16px] font-semibold text-[color:var(--color-text-primary)]">
          <FlaskConical className="h-4 w-4 text-[color:var(--color-text-secondary)]" />
          Labs · potential features
        </h1>
        <p className="mt-0.5 max-w-3xl text-[12px] text-[color:var(--color-text-secondary)]">
          Tools being tried out before they join the main workflow. Everything in the top half runs for real on public data;
          nothing here sends a message. Tell us which ones earn a place in the product.
        </p>
      </header>

      <LabsTools />

      <section>
        <h2 className="text-[14px] font-semibold text-[color:var(--color-text-primary)]">On the roadmap</h2>
        <p className="mt-0.5 text-[12px] text-[color:var(--color-text-secondary)]">
          Not built yet. Each one needs an account or provider we don&rsquo;t have connected.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ROADMAP.map(r => (
            <div key={r.title} className="rounded-xl border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-primary)] p-4">
              <p className="text-[13px] font-semibold text-[color:var(--color-text-primary)]">{r.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">{r.body}</p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-[color:var(--color-text-primary)]">
                <span className="font-medium">Needs:</span> {r.needs}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
