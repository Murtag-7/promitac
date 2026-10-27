import { useEffect, useState } from 'react'
import type { OutputFrame } from '@core/live/frame'
import { api } from '@/api/client'
import { ProjectionView } from '@/components/projection/ProjectionView'

/** The projection window: full screen, no chrome, renders whatever the control window sends. */
export function OutputApp({ outputId }: { outputId: string }) {
  const [frame, setFrame] = useState<OutputFrame | null>(null)

  useEffect(() => {
    document.title = `Promítač – výstup ${outputId}`
    document.documentElement.classList.add('output-window')
    return api().output.onFrame(setFrame)
  }, [outputId])

  return (
    <div className="h-screen w-screen cursor-none bg-black" data-testid="output-root">
      <ProjectionView frame={frame} mode="output" className="h-full w-full" />
    </div>
  )
}
