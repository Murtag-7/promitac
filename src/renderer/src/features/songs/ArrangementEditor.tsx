import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, RotateCcw, X } from 'lucide-react'
import type { SongSection } from '@core/chordpro/model'
import { SECTION_DOT, sectionLabel } from '@/components/common/SectionBadge'
import { Tip } from '@/components/ui/tooltip'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'

interface Entry {
  key: string
  id: string
}

/** Drag & drop editor of the projection order (sections can repeat without copying text). */
export function ArrangementEditor({
  sections,
  arrangement,
  onChange
}: {
  sections: SongSection[]
  arrangement: string[]
  onChange: (next: string[]) => void
}) {
  const effective = arrangement.length > 0 ? arrangement : sections.map((s) => s.id)
  const entries: Entry[] = effective.map((id, i) => ({ key: `${id}-${i}`, id }))
  const byId = new Map(sections.map((s) => [s.id, s]))
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDragEnd = (e: DragEndEvent): void => {
    if (!e.over || e.active.id === e.over.id) return
    const from = entries.findIndex((x) => x.key === e.active.id)
    const to = entries.findIndex((x) => x.key === e.over?.id)
    if (from < 0 || to < 0) return
    onChange(arrayMove(effective, from, to))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-small font-[600] text-ink-2">{cs.songs.arrangement}</span>
        {arrangement.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="press flex items-center gap-1 rounded-control px-1.5 py-0.5 text-meta font-[550] text-ink-3 hover:text-ink"
          >
            <RotateCcw className="size-3" aria-hidden />
            {cs.songs.arrangementReset}
          </button>
        ) : null}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={entries.map((e) => e.key)} strategy={horizontalListSortingStrategy}>
          <ol className="flex flex-wrap gap-1.5" aria-label={cs.songs.arrangement} data-testid="arrangement">
            {entries.map((entry, i) => {
              const section = byId.get(entry.id)
              return (
                <Chip
                  key={entry.key}
                  entry={entry}
                  label={section ? sectionLabel(section.type, section.id, section.label) : entry.id}
                  dot={section ? SECTION_DOT[section.type] : 'bg-ink-3'}
                  missing={!section}
                  onRemove={() => onChange(effective.filter((_, j) => j !== i))}
                />
              )
            })}
          </ol>
        </SortableContext>
      </DndContext>
      {sections.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-meta text-ink-3">{cs.common.add}:</span>
          {sections.map((s) => (
            <Tip key={s.id} label={cs.songs.arrangementHint}>
              <button
                type="button"
                onClick={() => onChange([...effective, s.id])}
                className="press flex h-7 items-center gap-1 rounded-full px-2 text-small text-ink-2 ring-1 ring-inset ring-dashed ring-line-strong hover:bg-raised hover:text-ink"
              >
                <Plus className="size-3" aria-hidden />
                {sectionLabel(s.type, s.id, s.label)}
              </button>
            </Tip>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Chip({
  entry,
  label,
  dot,
  missing,
  onRemove
}: {
  entry: Entry
  label: string
  dot: string
  missing: boolean
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.key })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-full bg-raised pl-2.5 pr-1 text-small font-[550] text-ink ring-1 ring-inset ring-line',
        isDragging && 'z-10 shadow-overlay ring-light/60',
        missing && 'text-warn ring-warn/40'
      )}
    >
      <span
        {...attributes}
        {...listeners}
        className="flex cursor-grab items-center gap-1.5 outline-none focus-visible:underline active:cursor-grabbing"
        aria-roledescription="přesunutelná sekce"
      >
        <span className={cn('size-1.5 rounded-full', dot)} aria-hidden />
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${cs.common.delete} ${label}`}
        className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-raised-2 hover:text-ink"
      >
        <X className="size-3" aria-hidden />
      </button>
    </li>
  )
}
