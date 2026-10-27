import { useEffect, useMemo, useState } from 'react'
import type { OutputFrame } from '@core/live/frame'
import { BUILT_IN_THEMES } from '@core/theme/defaults'
import type { Theme } from '@core/theme/model'
import { api } from '@/api/client'
import { ProjectionView } from '@/components/projection/ProjectionView'

/** The projection window: full screen, no chrome, renders whatever the control window sends. */
export function OutputApp({ outputId }: { outputId: string }) {
  const [frame, setFrame] = useState<OutputFrame | null>(null)
  const [override, setOverride] = useState<Theme | null>(null)

  useEffect(() => {
    document.title = `Promítač – výstup ${outputId}`
    document.documentElement.classList.add('output-window')
    return api().output.onFrame(setFrame)
  }, [outputId])

  // Optional per-output theme (e.g. a stage screen with high contrast).
  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      const [settings, themes] = await Promise.all([api().settings.get(), api().themes.list()])
      const themeId = settings.outputs.find((o) => o.id === outputId)?.themeId
      const all = [...BUILT_IN_THEMES, ...themes]
      if (alive) setOverride(themeId ? (all.find((t) => t.id === themeId) ?? null) : null)
    }
    void load()
    const off = api().output.onStatus(() => void load())
    return () => {
      alive = false
      off()
    }
  }, [outputId])

  const shown = useMemo(() => (frame && override ? { ...frame, theme: override } : frame), [frame, override])

  return (
    <div className="h-screen w-screen cursor-none bg-black" data-testid="output-root">
      <ProjectionView frame={shown} mode="output" className="h-full w-full" />
    </div>
  )
}
