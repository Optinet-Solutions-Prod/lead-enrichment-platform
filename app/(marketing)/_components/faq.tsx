const FAQ = [
  {
    q: 'Where does the data come from?',
    a: 'From public sources we scrape on your behalf: Google and Bing results for your keywords in each country (desktop and mobile, organic and paid), creator platforms (YouTube, TikTok, Twitch, Kick, Snapchat, Telegram) and Facebook’s Ad Library, plus the websites themselves for contact details. Every record links back to the page it was found on.',
  },
  {
    q: 'What is a credit, and what does one cost?',
    a: 'Keyword searches are metered by a daily quota per user (one keyword on one engine in one country is one search), not by credits. Credits pay for source runs: 1 credit per run of a built-in or custom source. AI classification, contact enrichment, filters, exports, outreach tracking and workflows are included. New workspaces start with 100 credits.',
  },
  {
    q: 'Do I need my own API keys?',
    a: 'No. Everything runs on our keys out of the box. Connecting your own (Apify first) makes the expensive crawls cheaper in credits and keeps that spend on your own account — useful once you run them often.',
  },
  {
    q: 'Can my team use it together?',
    a: 'Yes. Invite teammates with a link, give them a role (owner, admin, member), transfer ownership when someone leaves, and belong to several workspaces if you run more than one business. Data never crosses workspaces.',
  },
  {
    q: 'Is this compliant with the platforms you scrape?',
    a: 'We only collect what a page or profile shows publicly, keep one record per website, and never automate bulk messaging or contact reveals on login-gated platforms — you send every message yourself, from your own accounts. You are responsible for how you contact people under GDPR.',
  },
  {
    q: 'Does it send the outreach for me?',
    a: 'Not yet. It gives you the contact, the context (which brands they promote, how they rank), a status on every site and a follow-up reminder on the day — you send from your own email, Telegram or LinkedIn, so deliverability and tone stay yours. Sequences are on the roadmap.',
  },
  {
    q: 'What happens when I run out of credits?',
    a: 'Runs pause until you top up — nothing is deleted and nothing is charged automatically. Plan credits reset every month; top-up credits never expire.',
  },
]

export function Faq() {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-[color:var(--color-border)] rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]">
      {FAQ.map(item => (
        <details key={item.q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-medium [&::-webkit-details-marker]:hidden">
            {item.q}
            <span className="text-[color:var(--color-text-secondary)] transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--color-text-secondary)]">{item.a}</p>
        </details>
      ))}
    </div>
  )
}
