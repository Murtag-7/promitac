import { cs } from './i18n/cs'

const NAV = [cs.nav.live, cs.nav.plan, cs.nav.songs, cs.nav.bible, cs.nav.media, cs.nav.settings]

export function App() {
  return (
    <div className="flex h-full flex-col">
      <nav aria-label="Hlavní navigace" className="flex gap-2 p-3">
        {NAV.map((label) => (
          <button key={label} type="button" className="rounded-md px-3 py-1.5 text-sm hover:bg-white/10">
            {label}
          </button>
        ))}
      </nav>
      <main className="flex-1 p-6">
        <h1 className="text-xl font-semibold">{cs.app.name}</h1>
      </main>
    </div>
  )
}
