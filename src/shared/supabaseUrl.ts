/**
 * The Supabase client needs just the project address, https://<ref>.supabase.co. The dashboard also
 * shows longer addresses (e.g. the REST endpoint …/rest/v1/); with one of those every request goes
 * to a wrong path and Supabase answers "Invalid path specified in request URL". Only the origin is
 * kept. Returns null for anything that is not an https address (http only for local development).
 */
export function supabaseProjectUrl(input: string): string | null {
  try {
    const url = new URL(input.trim())
    if (!url.hostname) return null
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !local) return null
    return url.origin
  } catch {
    return null
  }
}
