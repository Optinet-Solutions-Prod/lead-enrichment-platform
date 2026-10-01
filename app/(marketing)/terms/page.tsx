import type { Metadata } from 'next'
import { Bullets, LegalPage, Section } from '../_components/legal'

export const metadata: Metadata = {
  title: 'Terms of service — Lead Engine',
  description: 'The rules for using Lead Engine: accounts, acceptable outreach, credits and billing, the live demo, and liability.',
}

const CONTACT = 'admin@optinetsolutions.com'

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of service"
      intro="These terms govern your use of Lead Engine, operated by Optinet Solutions. By running the demo or creating an account you agree to them. They are written for businesses; Lead Engine is not offered to consumers."
      updated="1 October 2026"
      other={{ href: '/privacy', label: 'Privacy policy' }}
    >
      <Section title="What Lead Engine does">
        <p>
          Lead Engine finds the websites that rank on Google for a keyword in a chosen country, classifies them (affiliate, operator,
          publisher), records the brands and links they promote, collects the business contact details they publish, and gives your
          team a place to track outreach. It is a research and prospecting tool; it does not send messages on your behalf.
        </p>
      </Section>

      <Section title="Your account">
        <Bullets
          items={[
            'Give accurate details when you sign up and keep them current.',
            'Keep your password private. Everything done under your login is your responsibility, including by people you invite to your workspace.',
            'One person, one login. Workspaces may have several seats; sharing a single login is not allowed.',
            'You must be authorised to act for the business you register.',
          ]}
        />
      </Section>

      <Section title="Acceptable use">
        <p>You may use the contact details Lead Engine finds to propose genuine business partnerships. You agree to:</p>
        <Bullets
          items={[
            'follow the marketing and privacy laws that apply to you and to the people you contact, including GDPR, the ePrivacy rules (such as PECR in the UK), CAN-SPAM and CASL;',
            'identify yourself honestly in every message, include a working way to opt out, and honour opt-outs at once;',
            'not send bulk unsolicited messages, and not contact anyone who has asked you not to;',
            'not resell, publish or share the data as a list or database, and not combine it with other sources to profile individuals;',
            'not use the service to collect data about consumers, minors, or anyone outside a business context;',
            'not probe, overload, reverse-engineer or bypass the limits of the service, and not try to reach another customer’s workspace.',
          ]}
        />
        <p>We may suspend or close an account that breaks these rules, without refund of credits already used.</p>
      </Section>

      <Section title="The data you obtain">
        <p>
          Contact details come from the public pages of the sites we find and are provided as they were found. We do not guarantee that
          they are current, complete or that the person behind them wants to hear from you. Once you export or use them you are the
          data controller for that use. If we receive a removal request for a site we will remove it from your workspace too.
        </p>
      </Section>

      <Section title="Credits, plans and payment">
        <Bullets
          items={[
            'Runs consume credits. Every new workspace receives free credits to start; plans add monthly credits and seats; top-up packs add credits that do not expire.',
            'Prices are shown on the pricing page in EUR or USD, before VAT where it applies. Payment is handled by Stripe.',
            'Monthly plans renew automatically until cancelled. Cancel at any time; the plan stays active until the end of the paid period.',
            'Credits already used are not refundable. Contact us about unused packs.',
            'We may change prices with 30 days’ notice to account holders. Changes never affect credits you already hold.',
          ]}
        />
      </Section>

      <Section title="The live demo">
        <p>
          The demo on our landing page is free, limited per visitor and per day, and intended to show how the tool works. Its results
          are deleted after 24 hours. Nothing is sent from the demo. We may change, limit or pause it at any time.
        </p>
      </Section>

      <Section title="Availability and changes">
        <p>
          We work to keep Lead Engine available but do not promise uninterrupted service. Search engines, websites and the third-party
          services we rely on change without notice, and a run can return fewer results than expected. We may add, change or retire
          features; if a change removes something material from a paid plan we will tell account holders in advance.
        </p>
      </Section>

      <Section title="Ownership">
        <p>
          Lead Engine, its software, design and content belong to Optinet Solutions. Your lists, notes, outreach records and the
          settings of your workspace belong to you, and you can export them at any time while your account is open.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          Lead Engine is provided “as is”. To the extent the law allows, Optinet Solutions is not liable for indirect or consequential
          loss, lost profits, or for how you use the data you obtain. Our total liability to you for any claim is limited to the amount
          you paid us in the twelve months before the claim arose. Nothing here limits liability that cannot be limited by law.
        </p>
      </Section>

      <Section title="Ending the agreement">
        <p>
          You can close your account at any time from the workspace settings or by emailing us. We can end the agreement with 30 days’
          notice, or at once if you break these terms. On closure your workspace data is deleted within 30 days.
        </p>
      </Section>

      <Section title="General">
        <p>
          These terms are governed by the laws of the country in which Optinet Solutions is established, and its courts have
          jurisdiction. If a clause is found invalid the rest still applies. We may update these terms; the date at the top shows the
          current version, and material changes are announced to account holders by email. Questions:{' '}
          <a className="underline underline-offset-2" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  )
}
