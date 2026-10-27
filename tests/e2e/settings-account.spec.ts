import { expect, test, type Page } from '@playwright/test'

async function openAccount(page: Page): Promise<void> {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Hlavní navigace' })
    .getByRole('button', { name: 'Nastavení', exact: true })
    .click()
  await page
    .getByRole('navigation', { name: 'Nastavení', exact: true })
    .getByRole('button', { name: 'Účet a synchronizace', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Účet a sdílená knihovna' })).toBeVisible()
}

test.describe('browser mock (no sync available)', () => {
  test('shows the connect form with validation', async ({ page }) => {
    await openAccount(page)
    await expect(page.getByText('Aplikace funguje plně i bez účtu.', { exact: false })).toBeVisible()
    const url = page.getByLabel('Supabase URL')
    const key = page.getByLabel('Anon (public) klíč')
    await expect(url).toBeVisible()
    await expect(key).toBeVisible()
    await expect(page.getByText('docs/SUPABASE_SETUP.md', { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Připojit', exact: true }).click()
    await expect(page.getByText('Zadejte adresu začínající https://', { exact: false })).toBeVisible()
    await expect(page.getByText('Vložte anon (public) klíč.')).toBeVisible()
    await expect(url).toHaveAttribute('aria-invalid', 'true')

    await url.fill('http://abcd.supabase.co')
    await key.fill('eyJhbGciOiJIUzI1NiJ9.demo')
    await expect(page.getByText('Zadejte adresu začínající https://', { exact: false })).toBeVisible()
    await expect(page.getByText('Vložte anon (public) klíč.')).toHaveCount(0)
  })

  test('valid URL and key show an inline error from the mock', async ({ page }) => {
    await openAccount(page)
    await page.getByLabel('Supabase URL').fill('https://abcd.supabase.co')
    await page.getByLabel('Anon (public) klíč').fill('eyJhbGciOiJIUzI1NiJ9.demo')
    await page.getByRole('button', { name: 'Připojit', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('V ukázce v prohlížeči není synchronizace dostupná.')
    // Still in the connect state, values kept so the user can fix them.
    await expect(page.getByLabel('Supabase URL')).toHaveValue('https://abcd.supabase.co')
  })
})

type FakeStart = 'signed-out' | 'no-org' | 'org-admin'

/**
 * Replaces the whole preload API before the app loads, so the signed-in states can be tested in the
 * browser. Everything except sync is an empty local library.
 */
async function installFakeApi(page: Page, start: FakeStart): Promise<void> {
  await page.addInitScript((startState: FakeStart) => {
    const noopUnsub = (): (() => void) => () => undefined
    const user = { id: 'u-anna', email: 'anna@example.com' }
    const org = { id: 'o-1', name: 'Sbor v Horní Vsi', role: 'admin' as const, inviteCode: 'HVRA-4821' }
    let members = [
      {
        userId: 'u-anna',
        email: 'anna@example.com',
        role: 'admin' as 'admin' | 'member',
        displayName: 'Anna'
      },
      { userId: 'u-petr', email: 'petr@example.com', role: 'member' as 'admin' | 'member', displayName: null }
    ]
    let status = {
      state: 'signed-out',
      lastSyncedAt: null as string | null,
      error: null as string | null,
      configured: true,
      user: null as typeof user | null,
      org: null as typeof org | null,
      builtInConfig: false
    }
    if (startState !== 'signed-out') status = { ...status, user, state: 'synced' }
    if (startState === 'org-admin') status = { ...status, org, lastSyncedAt: '2026-10-25T08:41:00.000Z' }
    const listeners = new Set<(s: typeof status) => void>()
    const emit = (): void => listeners.forEach((l) => l(structuredClone(status)))

    const settings = {
      linesPerSlide: 4,
      defaultThemeId: 'classic-dark',
      outputs: [{ id: 'main', name: 'Plátno', displayId: 'auto', enabled: true, windowed: false }],
      uiTheme: 'dark',
      deviceName: 'Počítač',
      bibleTranslationId: 'cs-bkr',
      bibleMaxChars: 260,
      bibleVerseNumbers: true,
      supabase: { url: 'https://horni-ves.supabase.co', anonKey: 'demo' }
    }

    ;(window as unknown as { promitac: unknown }).promitac = {
      platform: 'linux',
      app: {
        version: async () => '0.0.0-test',
        openDataFolder: async () => undefined,
        getPathForFile: () => '',
        openExternal: async () => undefined
      },
      songs: {
        list: async () => [],
        save: async () => undefined,
        remove: async () => undefined,
        onExternalChange: noopUnsub
      },
      plans: { list: async () => [], save: async () => undefined, remove: async () => undefined },
      themes: { list: async () => [], save: async () => undefined, remove: async () => undefined },
      media: {
        list: async () => [],
        importPaths: async () => [],
        importFiles: async () => [],
        update: async () => undefined,
        remove: async () => undefined,
        url: () => ''
      },
      settings: {
        get: async () => structuredClone(settings),
        update: async (patch: object) => Object.assign(settings, patch) && structuredClone(settings)
      },
      displays: { list: async () => [], onChange: noopUnsub },
      output: {
        setFrame: () => undefined,
        onFrame: noopUnsub,
        status: async () => [],
        onStatus: noopUnsub,
        refresh: async () => []
      },
      bible: {
        listTranslations: async () => [],
        load: async () => {
          throw new Error('no bible in test')
        },
        importTranslation: async () => {
          throw new Error('no bible in test')
        },
        removeTranslation: async () => undefined
      },
      backup: { exportZip: async () => ({ ok: false }), importZip: async () => ({ ok: false }) },
      sync: {
        status: async () => structuredClone(status),
        onStatus: (cb: (s: typeof status) => void) => {
          listeners.add(cb)
          return () => listeners.delete(cb)
        },
        configure: async (config: object | null) => {
          status = config
            ? { ...status, configured: true, state: 'signed-out' }
            : { ...status, configured: false, user: null, org: null, state: 'local' }
          emit()
          return structuredClone(status)
        },
        signUp: async () => ({ ok: true }),
        signIn: async (_email: string, password: string) => {
          if (password !== 'spravne-heslo') return { ok: false, error: 'Nesprávný e-mail nebo heslo.' }
          status = { ...status, user, state: 'synced' }
          emit()
          return { ok: true }
        },
        signOut: async () => {
          status = { ...status, user: null, org: null, state: 'signed-out' }
          emit()
          return { ok: true }
        },
        createOrg: async (name: string) => {
          status = { ...status, org: { ...org, name } }
          emit()
          return { ok: true }
        },
        joinOrg: async (code: string) =>
          code === 'HVRA-4821'
            ? ((status = { ...status, org: { ...org, role: 'admin' } }), emit(), { ok: true })
            : { ok: false, error: 'Kód pozvánky neplatí. Zkontrolujte ho prosím.' },
        leaveOrg: async () => {
          status = { ...status, org: null }
          emit()
          return { ok: true }
        },
        members: async () => structuredClone(members),
        setMemberRole: async (userId: string, role: 'admin' | 'member') => {
          members = members.map((m) => (m.userId === userId ? { ...m, role } : m))
          return { ok: true }
        },
        removeMember: async (userId: string) => {
          members = members.filter((m) => m.userId !== userId)
          return { ok: true }
        },
        rotateInviteCode: async () => {
          if (status.org) status = { ...status, org: { ...status.org, inviteCode: 'NOVY-0007' } }
          emit()
          return { ok: true }
        },
        syncNow: async () => {
          status = { ...status, state: 'synced', lastSyncedAt: new Date().toISOString() }
          emit()
          return structuredClone(status)
        }
      }
    }
  }, start)
}

test.describe('with a sync backend', () => {
  test('sign in shows server errors inline, then moves on', async ({ page }) => {
    await installFakeApi(page, 'signed-out')
    await openAccount(page)
    await expect(page.getByText('Připojeno k horni-ves.supabase.co')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Odpojit' })).toBeVisible()

    await page.getByLabel('E-mail').fill('anna@example.com')
    await page.getByLabel('Heslo').fill('spatne')
    await page.getByRole('button', { name: 'Přihlásit se', exact: true }).last().click()
    await expect(page.getByRole('alert')).toHaveText('Nesprávný e-mail nebo heslo.')

    await page.getByLabel('Heslo').fill('spravne-heslo')
    await page.getByRole('button', { name: 'Přihlásit se', exact: true }).last().click()
    await expect(page.getByText('Zatím nejste v žádném sboru.')).toBeVisible()
    await expect(page.getByText('Přihlášeno jako anna@example.com')).toBeVisible()
  })

  test('sign up confirms and switches to sign in', async ({ page }) => {
    await installFakeApi(page, 'signed-out')
    await openAccount(page)
    await page.getByRole('radio', { name: 'Vytvořit účet' }).click()
    await page.getByLabel('E-mail').fill('novy@example.com')
    await page.getByLabel('Heslo').fill('123')
    await page.getByRole('button', { name: 'Vytvořit účet', exact: true }).last().click()
    await expect(page.getByText('Heslo musí mít aspoň 6 znaků.')).toBeVisible()
    await page.getByLabel('Heslo').fill('dlouhe-heslo')
    await page.getByRole('button', { name: 'Vytvořit účet', exact: true }).last().click()
    await expect(page.getByRole('status').filter({ hasText: 'Účet vytvořen.' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Přihlásit se' })).toHaveAttribute('aria-checked', 'true')
  })

  test('join with a wrong code shows the error, create org enters it', async ({ page }) => {
    await installFakeApi(page, 'no-org')
    await openAccount(page)
    await page.getByLabel('Kód pozvánky').fill('abcd-0000')
    await page.getByRole('button', { name: 'Připojit se ke sboru' }).click()
    await expect(page.getByRole('alert')).toHaveText('Kód pozvánky neplatí. Zkontrolujte ho prosím.')

    await page.getByRole('button', { name: 'Založit sbor' }).click()
    await expect(page.getByText('Zadejte název sboru.')).toBeVisible()
    await page.getByLabel('Název sboru').fill('Sbor v Dolní Vsi')
    await page.getByRole('button', { name: 'Založit sbor' }).click()
    await expect(page.getByText('Sbor v Dolní Vsi')).toBeVisible()
    await expect(page.getByTestId('invite-code')).toHaveText('HVRA-4821')
  })

  test('admin manages the invite code, members and sync', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await installFakeApi(page, 'org-admin')
    await openAccount(page)

    await expect(page.getByText('Sbor v Horní Vsi')).toBeVisible()
    await expect(page.getByText('Vaše role: Správce', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Zkopírovat kód' }).click()
    await expect(page.getByRole('button', { name: 'Zkopírováno' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('HVRA-4821')

    await page.getByRole('button', { name: 'Vygenerovat nový kód' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Vygenerovat nový kód' }).click()
    await expect(page.getByTestId('invite-code')).toHaveText('NOVY-0007')

    const members = page.getByRole('list', { name: 'Členové' })
    await expect(members.getByRole('listitem')).toHaveCount(2)
    // No actions on yourself.
    await expect(page.getByRole('button', { name: 'Možnosti pro Anna' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Možnosti pro petr@example.com' }).click()
    await page.getByRole('menuitem', { name: 'Udělat správcem' }).click()
    await expect(members.getByRole('listitem').filter({ hasText: 'petr@example.com' })).toContainText(
      'Správce'
    )

    await page.getByRole('button', { name: 'Možnosti pro petr@example.com' }).click()
    await page.getByRole('menuitem', { name: 'Odebrat ze sboru' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Odebrat ze sboru' }).click()
    await expect(members.getByRole('listitem').filter({ hasText: 'petr@example.com' })).toHaveCount(0)

    await expect(page.getByText('25. 10. 2026', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Synchronizovat teď' }).click()
    await expect(page.getByTestId('sync-state')).toHaveText('Synchronizováno')

    await page.getByRole('button', { name: 'Opustit sbor' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Opustit sbor' }).click()
    await expect(page.getByText('Zatím nejste v žádném sboru.')).toBeVisible()
  })
})
