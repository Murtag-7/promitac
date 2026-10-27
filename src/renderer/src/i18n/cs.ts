/**
 * All user-facing Czech texts live here (single source, easy to edit).
 * Keep keys in English, values in Czech.
 */
export const cs = {
  app: {
    name: 'Promítač'
  },
  nav: {
    live: 'Živě',
    plan: 'Plán',
    songs: 'Písně',
    bible: 'Bible',
    media: 'Média',
    settings: 'Nastavení',
    import: 'Import písně'
  }
} as const

export type Texts = typeof cs
