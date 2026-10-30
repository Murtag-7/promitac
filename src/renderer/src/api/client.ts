import type { PromitacApi } from '@shared/api'

let instance: PromitacApi | null = null

/** Resolve the API: Electron preload bridge, or the in-browser mock in the web build. */
export async function initApi(): Promise<PromitacApi> {
  if (instance) return instance
  if (window.promitac) {
    instance = window.promitac
  } else if (__WEB_MOCK__) {
    const { createMockApi } = await import('./mock')
    instance = createMockApi()
  } else {
    throw new Error('Promítač API is not available')
  }
  return instance
}

/** The initialised API (call initApi() once at startup). */
export function api(): PromitacApi {
  if (!instance) throw new Error('API not initialised')
  return instance
}

/** True when running inside the projection output window (`?output=<id>`). */
export function outputIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('output')
}
