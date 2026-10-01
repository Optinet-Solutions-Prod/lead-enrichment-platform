import Link from 'next/link'

/** Shared shell for the privacy policy and terms: narrow column, dated, with a cross-link. */
export function LegalPage({
  eyebrow,
  title,
  intro,
  updated,
  other,
  children,
}: {
  eyebrow: string
  title: string
  intro: string
  updated: string
  other: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <article className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">{eyebrow}</p>
      <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-tight">{title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--color-text-secondary)]">{intro}</p>
      <p className="mt-2 text-[12px] text-[color:var(--color-text-secondary)]">
        Last updated {updated} ·{' '}
        <Link href={other.href} className="underline underline-offset-2 hover:text-[color:var(--color-text-primary)]">
          {other.label}
        </Link>
      </p>
      <div className="mt-8 flex flex-col gap-8 text-[14px] leading-relaxed text-[color:var(--color-text-primary)]">{children}</div>
    </article>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}
