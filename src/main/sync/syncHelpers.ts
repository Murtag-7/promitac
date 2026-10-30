/**
 * Runs one task at a time. A call while a run is in flight does not start a second run in
 * parallel: it waits for the current one and schedules exactly one follow-up run (later edits
 * must still be synced), which every caller during that window shares.
 */
export class SingleFlight<T> {
  private running: Promise<T> | null = null
  private queued: Promise<T> | null = null

  constructor(private readonly task: () => Promise<T>) {}

  run(): Promise<T> {
    if (!this.running) {
      this.running = this.task().finally(() => {
        this.running = null
      })
      return this.running
    }
    if (!this.queued) {
      const after = this.running.catch(() => undefined)
      this.queued = after.then(() => {
        this.queued = null
        return this.run()
      })
    }
    return this.queued
  }
}

/**
 * Storage objects of shared media that were deleted (locally or by another computer) and can be
 * removed from Supabase Storage. `known` maps media id → storage path as seen on earlier syncs.
 * Only media with a tombstone count: a media entry that disappeared for another reason (e.g. a
 * backup restore) must not delete the shared file the rest of the sbor still uses.
 */
export function mediaStorageCleanup(
  known: Record<string, string>,
  current: Array<{ id: string; storagePath?: string }>,
  tombstoned: Record<string, string>
): { remove: string[]; known: Record<string, string> } {
  const next: Record<string, string> = {}
  const remove: string[] = []
  const present = new Set(current.map((m) => m.id))
  for (const m of current) if (m.storagePath) next[m.id] = m.storagePath
  for (const [id, path] of Object.entries(known)) {
    if (present.has(id)) continue
    if (tombstoned[id]) remove.push(path)
    else next[id] = path
  }
  return { remove, known: next }
}
