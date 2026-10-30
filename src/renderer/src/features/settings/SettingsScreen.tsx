import {
  Cloud,
  HardDriveDownload,
  MonitorSmartphone,
  Palette,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { type SettingsSection, useUi } from '@/store/ui'
import { AccountPanel } from './AccountPanel'
import { AiPanel } from './AiPanel'
import { BackupPanel } from './BackupPanel'
import { GeneralPanel } from './GeneralPanel'
import { OutputsPanel } from './OutputsPanel'
import { ThemesPanel } from './ThemesPanel'

const SECTIONS: Array<{ id: SettingsSection; label: string; icon: typeof Cloud }> = [
  { id: 'outputs', label: cs.settings.sections.outputs, icon: MonitorSmartphone },
  { id: 'themes', label: cs.settings.sections.themes, icon: Palette },
  { id: 'general', label: cs.settings.sections.general, icon: SlidersHorizontal },
  { id: 'account', label: cs.settings.sections.account, icon: Cloud },
  { id: 'backup', label: cs.settings.sections.backup, icon: HardDriveDownload },
  { id: 'ai', label: cs.settings.sections.ai, icon: Sparkles }
]

export function SettingsScreen() {
  const section = useUi((s) => s.settingsSection)
  const openSettings = useUi((s) => s.openSettings)
  return (
    <div className="grid h-full min-h-0 grid-cols-[232px_minmax(0,1fr)]">
      <nav aria-label={cs.settings.title} className="flex flex-col gap-0.5 border-r border-line bg-panel p-3">
        <h1 className="px-2.5 pb-3 pt-1 text-screen font-[650] tracking-[-0.01em] text-ink">
          {cs.settings.title}
        </h1>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => openSettings(id)}
            aria-current={section === id ? 'page' : undefined}
            className={cn(
              'press flex h-9 items-center gap-2.5 rounded-control px-2.5 text-left text-body font-[550] text-ink-2 hover:bg-raised hover:text-ink',
              section === id && 'bg-raised text-ink ring-1 ring-inset ring-line'
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden />
            {label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 overflow-y-auto">
        {section === 'outputs' ? <OutputsPanel /> : null}
        {section === 'themes' ? <ThemesPanel /> : null}
        {section === 'general' ? <GeneralPanel /> : null}
        {section === 'account' ? <AccountPanel /> : null}
        {section === 'backup' ? <BackupPanel /> : null}
        {section === 'ai' ? <AiPanel /> : null}
      </div>
    </div>
  )
}
