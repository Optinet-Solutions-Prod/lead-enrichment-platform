import type { Metadata } from 'next'
import { Faq } from '../_components/faq'
import { Pricing } from '../_components/pricing'

export const metadata: Metadata = {
  title: 'Pricing — Lead Engine',
  description:
    'Start free with 100 credits. Monthly plans from €49 include credits; top-up packs never expire. EUR or USD.',
}

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pb-12 pt-14">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">Pricing</p>
          <h1 className="mt-2 text-[34px] font-semibold leading-tight tracking-tight">
            Start free. Pay for the runs you make.
          </h1>
          <p className="mt-3 text-[14px] text-[color:var(--color-text-secondary)]">
            Every workspace starts with 100 credits and every page unlocked. Plans add monthly credits,
            seats and the heavier tooling; top-ups cover the busy months. Prices in EUR or USD.
          </p>
        </div>
        <div className="mt-10">
          <Pricing />
        </div>
      </section>
      <section className="border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-center text-[22px] font-semibold">Pricing questions</h2>
          <div className="mt-6">
            <Faq />
          </div>
        </div>
      </section>
    </>
  )
}
