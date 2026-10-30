import type { SongFile } from '@core/chordpro/model'
import type { ServicePlan } from '@core/plan/model'
import { planFromTemplate, sundayTemplate } from '@core/plan/templates'
import { SAMPLE_SONGS } from '@core/samples/songs'
import { newId } from '@core/util/id'

/** Extra invented songs so the browser demo (tests, screenshots) has a realistic library. */
const DEMO_SONGS: Array<{ id: string; content: string }> = [
  {
    id: '9d1f0000-0000-4000-8000-000000000101',
    content: `{title: Žehnej, duše má}
{artist: Ukázkový autor}
{key: D}
{tags: chvály}
{arrangement: V1 C V2 C C}

{start_of_verse: V1}
[D]Žehnej, duše má, [A]Pánu svému,
[Hmi]nezapomeň, co [G]dobrého ti dal.
[D]On tě zvedá [A]z prachu cesty,
[G]korunuje tě [A]láskou dnes i dál.
{end_of_verse}

{start_of_chorus: C}
[G]Zpívej, [D]duše má,
[A]zpívej, [Hmi]celé srdce mé,
[G]Jeho jméno [D]svaté
[A]navždy chválit [D]chce.
{end_of_chorus}

{start_of_verse: V2}
[D]Jako otec [A]k dětem svým se
[Hmi]sklání k nám, když [G]padá stín,
[D]jeho milost [A]trvá věčně,
[G]nový den nám [A]dává za každý z vin.
{end_of_verse}
`
  },
  {
    id: '9d1f0000-0000-4000-8000-000000000102',
    content: `{title: Světlo nad městem}
{artist: Ukázkový autor}
{key: A}
{tags: chvály, mládež}
{arrangement: V1 P C V2 P C B C}

{start_of_verse: V1}
[A]Nad střechami [E]vychází den,
[F#mi]město se [D]probouzí,
[A]v ulicích je [E]slyšet zpěv,
[D]co srdce [E]rozbuší.
{end_of_verse}

{start_of_prechorus: P}
[D]Ať každý [E]pozná,
[F#mi]že není [D]sám.
{end_of_prechorus}

{start_of_chorus: C}
[A]Jsi světlo [E]nad městem,
[F#mi]jsi naděje [D]v nás,
[A]rozsviť nás [E]láskou svou
[D]a veď nás [E]zas.
{end_of_chorus}

{start_of_verse: V2}
[A]Kdo je unavený, [E]ať přijde blíž,
[F#mi]u stolu je [D]místo dost,
[A]kdo nese těžký [E]kříž,
[D]najde tu [E]radost.
{end_of_verse}

{start_of_bridge: B}
[F#mi]Ó, ó, [D]svítí dál,
[A]Ó, ó, [E]svítí dál.
{end_of_bridge}
`
  },
  {
    id: '9d1f0000-0000-4000-8000-000000000103',
    content: `{title: Ty jsi skála má}
{artist: Ukázkový autor}
{key: G}
{tags: chvály, klidné}

{start_of_verse: V1}
[G]Když se země [C]chvěje pod nohama,
[Emi]když se vlny [D]zvedají,
[G]Ty jsi skála, [C]na níž stojím,
[Emi]Tvoje ruce [D]drží mě.
{end_of_verse}

{start_of_chorus: C}
[C]Ty jsi skála [G]má,
[D]Ty jsi pevný [Emi]hrad,
[C]v Tobě bezpečí [G]mám,
[D]nebudu se [G]bát.
{end_of_chorus}
`
  }
]

export function seedSongs(now: string): SongFile[] {
  return [...SAMPLE_SONGS, ...DEMO_SONGS].map((s) => ({ id: s.id, content: s.content, updatedAt: now }))
}

function nextSunday(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function seedPlans(now: string): ServicePlan[] {
  const template = sundayTemplate(now)
  const plan = planFromTemplate(template, nextSunday(), now)
  plan.title = 'Nedělní bohoslužba'
  plan.items = [
    { id: newId(), type: 'text', title: 'Vítejte', body: 'Vítejte na bohoslužbě\nZačínáme v 10:00' },
    { id: newId(), type: 'song', songId: '9d1f0000-0000-4000-8000-000000000102' },
    { id: newId(), type: 'song', songId: '9d1f0000-0000-4000-8000-000000000101' },
    { id: newId(), type: 'bible', reference: 'Ž 23', translationId: 'cs-bkr' },
    { id: newId(), type: 'song', songId: '5f0c3c2e-8b51-4a8e-9d7e-2b1f0a000001' },
    {
      id: newId(),
      type: 'text',
      title: 'Oznámení',
      body: 'Ve středu v 18:00 zkouška chval\n\nV sobotu brigáda na zahradě'
    },
    { id: newId(), type: 'song', songId: '9d1f0000-0000-4000-8000-000000000103' },
    { id: newId(), type: 'blank' }
  ]
  return [template, plan]
}
