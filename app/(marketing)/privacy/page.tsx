import type { Metadata } from 'next'
import { Bullets, LegalPage, Section } from '../_components/legal'

export const metadata: Metadata = {
  title: 'Privacy policy — Lead Engine',
  description: 'What Lead Engine collects from visitors, account holders and the websites it finds, how long it is kept, and your rights.',
}

const CONTACT = 'admin@optinetsolutions.com'

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy policy"
      intro="Lead Engine is operated by Optinet Solutions. This page explains, in plain words, what we collect when you try the demo or use an account, what we do with the business contact details the tool finds on public websites, and how to ask us to remove something."
      updated="1 October 2026"
      other={{ href: '/terms', label: 'Terms of service' }}
    >
      <Section title="Who we are">
        <p>
          Optinet Solutions runs Lead Engine (this website and the workspace behind it). We are the data controller for the
          data described here. Questions and requests go to{' '}
          <a className="underline underline-offset-2" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          .
        </p>
      </Section>

      <Section title="The live demo on our landing page">
        <p>When you run the demo without an account we store:</p>
        <Bullets
          items={[
            'the keyword and country you typed;',
            'a hash of your IP address, made with a secret key so it cannot be turned back into the address. We use it only to limit how many demo runs one connection can start per hour;',
            'the results of the run: the page-one Google results for your keyword (URL, title, snippet), our classification of each site, the brands and links it promotes, and any business contact details shown on its public pages (email addresses, phone numbers, social profiles, contact page).',
          ]}
        />
        <p>
          Demo results are kept for <strong>24 hours</strong> and then deleted automatically. While they exist they can be opened only
          with the run’s random identifier, which is shown to nobody but you. The demo never sends an email or a text message; the
          “send” step only shows you what a message could look like.
        </p>
      </Section>

      <Section title="Account holders">
        <p>If you create an account we hold:</p>
        <Bullets
          items={[
            'your email address, name and the name of your workspace;',
            'your password, stored only as a salted hash by our authentication provider;',
            'what you do in the workspace: the keywords you scrape, the lists you build, outreach statuses and notes, credit usage;',
            'billing records if you buy credits. Card details are entered on and stored by Stripe; we see only the last four digits, the amount and the invoice.',
          ]}
        />
        <p>
          We use this to run the service for you, to bill you, to answer support requests and to keep the platform safe. The legal
          basis is the contract between us and, for security and abuse prevention, our legitimate interest.
        </p>
      </Section>

      <Section title="Websites and people the tool finds">
        <p>
          Lead Engine searches Google for a keyword, opens the websites that rank for it and reads their public pages. From those
          pages it records the business contact details the site itself publishes: generic and named email addresses, phone numbers,
          social profiles and the contact page. It also records how the site is classified (affiliate, operator, publisher) and which
          brands it promotes.
        </p>
        <p>
          We process this on the basis of legitimate interest: businesses that publish their contact details on a public website do so
          to be contacted about partnerships, and our customers use the tool to propose exactly that. We do not collect data from
          behind logins, from private profiles or from consumer-only pages, and we do not enrich it from data brokers.
        </p>
        <p>
          If your details appear in our system and you want them removed, email {CONTACT} with the website address. We remove them from
          all workspaces, add the domain to a suppression list so it is not collected again, and confirm within 30 days.
        </p>
      </Section>

      <Section title="Who processes data on our behalf">
        <Bullets
          items={[
            <>
              <strong>Supabase</strong> — database and authentication.
            </>,
            <>
              <strong>Vercel</strong> — hosting for this website and the API.
            </>,
            <>
              <strong>Apify</strong> and <strong>Serper</strong> — fetch Google search results for a keyword. They receive the keyword
              and country, never your account data.
            </>,
            <>
              <strong>OpenAI</strong> — receives the text and links of the public pages we open, plus the keyword, to judge relevance
              and classify the site. It receives no visitor or account data, and our data is not used for model training.
            </>,
            <>
              <strong>Stripe</strong> — payments and invoices.
            </>,
          ]}
        />
        <p>
          These providers process data in the European Union and the United States under their standard data processing terms,
          including standard contractual clauses where data leaves the EU.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          Signed-in users get one session cookie so the workspace knows who you are. The landing page and demo set no cookies. We use
          no advertising or third-party analytics cookies.
        </p>
      </Section>

      <Section title="How long we keep things">
        <Bullets
          items={[
            'Demo runs: 24 hours.',
            'Account and workspace data: for as long as the account exists, then deleted within 30 days of closure.',
            'Contact details found by the tool: kept in the workspace that found them until that workspace deletes or closes; re-checked and refreshed on a rolling basis.',
            'Billing records: as long as tax law requires, normally 7 years.',
            'Server logs: 30 days.',
          ]}
        />
      </Section>

      <Section title="Your rights">
        <p>
          Wherever you are, you can ask us what we hold about you, have it corrected or deleted, restrict or object to how we use it,
          and receive a copy in a portable format. If you are in the EU or UK you can also complain to your data protection authority.
          Write to {CONTACT}; we answer within 30 days.
        </p>
      </Section>

      <Section title="Changes">
        <p>When this policy changes we update the date at the top. Material changes are announced to account holders by email.</p>
      </Section>
    </LegalPage>
  )
}
