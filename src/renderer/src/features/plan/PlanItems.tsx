import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, TriangleAlert, X } from 'lucide-react'
import type { PlanItem } from '@core/plan/model'
import { parseReference } from '@core/bible/reference'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import type { LiveItem } from '@/live/items'
import { useBible } from '@/store/bible'
import { ITEM_ICON } from '@/features/live/CueList'

export function PlanItems({
  items,
  liveItems,
  selectedId,
  onSelect,
  onReorder,
  onUpdate,
  onRemove
}: {
  items: PlanItem[]
  liveItems: LiveItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onReorder: (items: PlanItem[]) => void
  onUpdate: (item: PlanItem) => void
  onRemove: (id: string) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const onDragEnd = (e: DragEndEvent): void => {
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex((i) => i.id === e.active.id)
    const to = items.findIndex((i) => i.id === e.over?.id)
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-1.5" data-testid="plan-items">
          {items.map((item, idx) => (
            <Row
              key={item.id}
              index={idx}
              item={item}
              live={liveItems.find((l) => l.id === item.id)}
              selected={selectedId === item.id}
              onSelect={() => onSelect(item.id)}
              onUpdate={onUpdate}
              onRemove={() => onRemove(item.id)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

function Row({
  index,
  item,
  live,
  selected,
  onSelect,
  onUpdate,
  onRemove
}: {
  index: number
  item: PlanItem
  live: LiveItem | undefined
  selected: boolean
  onSelect: () => void
  onUpdate: (item: PlanItem) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const Icon = ITEM_ICON[item.type]
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-card bg-panel ring-1 ring-inset ring-line',
        selected && 'ring-line-strong bg-raised',
        isDragging && 'relative z-10 shadow-overlay'
      )}
    >
      <div className="flex items-center gap-2 p-1.5 pr-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`${cs.common.more}: ${live?.title ?? ''}`}
          aria-roledescription="přesunutelná položka"
          className="grid size-8 cursor-grab place-items-center rounded-control text-ink-3 hover:bg-raised-2 hover:text-ink active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left">
          <span className="w-5 text-right text-meta tabular text-ink-3">{index + 1}</span>
          <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-[550] text-ink">{live?.title ?? cs.plan.itemKinds[item.type]}</span>
            <span className="flex items-center gap-1 text-meta text-ink-3">
              {live?.problem ? (
                <span className="flex items-center gap-1 text-warn">
                  <TriangleAlert className="size-3" aria-hidden />
                  {cs.live.itemProblem[live.problem]}
                </span>
              ) : (
                <>
                  {cs.plan.itemKinds[item.type]}
                  {live?.subtitle ? ` · ${live.subtitle}` : ''}
                  {live && live.slides.length > 0 ? ` · ${cs.common.slides(live.slides.length)}` : ''}
                </>
              )}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={cs.plan.removeItem}
          title={cs.plan.removeItem}
          className="press grid size-8 place-items-center rounded-control text-ink-3 hover:bg-raised-2 hover:text-danger"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {selected && (item.type === 'text' || item.type === 'bible') ? (
        <div className="border-t border-line p-3">
          {item.type === 'text' ? <TextItemEditor item={item} onUpdate={onUpdate} /> : null}
          {item.type === 'bible' ? <BibleItemEditor item={item} onUpdate={onUpdate} /> : null}
        </div>
      ) : null}
    </li>
  )
}

function TextItemEditor({
  item,
  onUpdate
}: {
  item: Extract<PlanItem, { type: 'text' }>
  onUpdate: (item: PlanItem) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <Field label={cs.plan.textTitle}>
        <Input value={item.title} onChange={(e) => onUpdate({ ...item, title: e.target.value })} />
      </Field>
      <Field label={cs.plan.textBody} hint={cs.plan.textBodyHint}>
        <Textarea rows={5} value={item.body} onChange={(e) => onUpdate({ ...item, body: e.target.value })} />
      </Field>
    </div>
  )
}

function BibleItemEditor({
  item,
  onUpdate
}: {
  item: Extract<PlanItem, { type: 'bible' }>
  onUpdate: (item: PlanItem) => void
}) {
  const translations = useBible((s) => s.translations)
  const valid = parseReference(item.reference) !== null
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-3">
      <Field label={cs.bible.title} hint={valid ? undefined : cs.plan.invalidReference}>
        <Input
          value={item.reference}
          placeholder={cs.plan.biblePlaceholder}
          aria-invalid={!valid}
          className={cn(!valid && 'ring-warn')}
          onChange={(e) => onUpdate({ ...item, reference: e.target.value })}
        />
      </Field>
      <Field label={cs.bible.translation}>
        <Select
          aria-label={cs.bible.translation}
          value={item.translationId}
          onValueChange={(translationId) => onUpdate({ ...item, translationId })}
          options={translations.map((t) => ({ value: t.id, label: `${t.abbreviation} – ${t.name}` }))}
        />
      </Field>
    </div>
  )
}
