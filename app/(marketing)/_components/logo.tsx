import { Radar } from 'lucide-react'

/** Lead Engine wordmark: gradient tile + display-font name. Shared by the site header, footer and sign-in pages. */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const tile = size === 'lg' ? 'h-10 w-10 rounded-[10px]' : 'h-8 w-8 rounded-lg'
  const icon = size === 'lg' ? 'h-5 w-5' : 'h-[18px] w-[18px]'
  const text = size === 'lg' ? 'text-[30px]' : 'text-[22px]'
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`inline-flex items-center justify-center bg-gradient-to-br from-[#13ef93] to-[#149afb] text-[#0b0b0c] ${tile}`}>
        <Radar className={icon} strokeWidth={2.4} />
      </span>
      <span className={`font-display font-extrabold leading-none tracking-[-0.03em] text-white ${text}`}>Lead Engine</span>
    </span>
  )
}
