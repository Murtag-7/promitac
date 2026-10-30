import { Music4, Plus, ScanText } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { useLibrary } from '@/store/library'
import { useUi } from '@/store/ui'
import { SongEditor } from './SongEditor'
import { SongList } from './SongList'

export function SongsScreen() {
  const selectedId = useUi((s) => s.selectedSongId)
  const openSong = useUi((s) => s.openSong)
  const setImportOpen = useUi((s) => s.setImportOpen)
  const exists = useLibrary((s) => (selectedId ? Boolean(s.songs[selectedId]) : false))
  const count = useLibrary((s) => s.order.length)
  const create = useLibrary((s) => s.create)

  const createSong = async (): Promise<void> => {
    const song = await create(cs.songs.newSongTemplate)
    openSong(song.id)
    toast(cs.songs.savedToast)
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
      <SongList selectedId={selectedId} onSelect={openSong} onCreate={() => void createSong()} />
      <div className="min-h-0">
        {selectedId && exists ? (
          <SongEditor key={selectedId} songId={selectedId} />
        ) : count === 0 ? (
          <EmptyState icon={Music4} title={cs.songs.emptyLibraryTitle} text={cs.songs.emptyLibraryText}>
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              <ScanText aria-hidden />
              {cs.nav.import}
            </Button>
            <Button onClick={() => void createSong()}>
              <Plus aria-hidden />
              {cs.songs.newSong}
            </Button>
          </EmptyState>
        ) : (
          <EmptyState icon={Music4} title={cs.songs.selectSong} text={cs.songs.selectSongHint}>
            <Button onClick={() => void createSong()}>
              <Plus aria-hidden />
              {cs.songs.newSong}
            </Button>
          </EmptyState>
        )}
      </div>
    </div>
  )
}
