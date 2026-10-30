import type { SectionType } from '@core/chordpro/model'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'

const TONE: Record<SectionType, string> = {
  verse: 'text-sec-verse bg-sec-verse/12 ring-sec-verse/25',
  chorus: 'text-sec-chorus bg-sec-chorus/12 ring-sec-chorus/25',
  prechorus: 'text-sec-prechorus bg-sec-prechorus/12 ring-sec-prechorus/25',
  bridge: 'text-sec-bridge bg-sec-bridge/12 ring-sec-bridge/25',
  intro: 'text-sec-other bg-sec-other/10 ring-sec-other/20',
  interlude: 'text-sec-other bg-sec-other/10 ring-sec-other/20',
  outro: 'text-sec-other bg-sec-other/10 ring-sec-other/20',
  tag: 'text-sec-other bg-sec-other/10 ring-sec-other/20',
  ending: 'text-sec-other bg-sec-other/10 ring-sec-other/20'
}

export const SECTION_DOT: Record<SectionType, string> = {
  verse: 'bg-sec-verse',
  chorus: 'bg-sec-chorus',
  prechorus: 'bg-sec-prechorus',
  bridge: 'bg-sec-bridge',
  intro: 'bg-sec-other',
  interlude: 'bg-sec-other',
  outro: 'bg-sec-other',
  tag: 'bg-sec-other',
  ending: 'bg-sec-other'
}

/** "Sloka 2", "Refrén", "Refrén 2", "Most" … from section type + id. */
export function sectionLabel(type: SectionType, id?: string, label?: string): string {
  if (label) return label
  const num = id?.match(/\d+$/)?.[0]
  const base = cs.sections[type]
  if (type === 'verse') return num ? `${base} ${num}` : base
  return num && num !== '1' ? `${base} ${num}` : base
}

export function SectionBadge({
  type,
  id,
  label,
  className
}: {
  type: SectionType
  id?: string
  label?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-chip px-1.5 text-meta font-[600] ring-1 ring-inset',
        TONE[type],
        className
      )}
    >
      {sectionLabel(type, id, label)}
    </span>
  )
}
