const FAQ = [
  {
    q: 'Where does the data come from?',
    a: 'From public sources we scrape on your behalf: direct-from-owner property sites, Maltapark classifieds, the MTA licence register, Airbnb (via a real-browser crawl), and Google / Bing search results for the affiliate module. Every lead links back to the listing or page it was found on.',
  },
  {
    q: 'What is a credit, and what does one cost?',
    a: 'A credit is one source run — one pass over one source. Most runs are 1 credit; the Airbnb crawl is 5 on your own Apify key or 15 on ours because it uses real browser compute. Filters, exports, cross-matching and workflows are free. New workspaces start with 100 credits.',
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
    a: 'We only collect what a listing or page shows publicly, keep one record per website, and never automate bulk contact reveals on login-gated platforms (Maltapark accounts, Airbnb messaging) — those are worked by hand, sustainably. You are responsible for how you contact people under GDPR.',
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
