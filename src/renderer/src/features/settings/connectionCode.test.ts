import { describe, expect, it } from 'vitest'
import { decodeConnectionCode, encodeConnectionCode } from './connectionCode'

const config = {
  url: 'https://abcd.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig-_x'
}

describe('connection code', () => {
  it('round-trips the project address and public key', () => {
    const code = encodeConnectionCode(config)
    expect(code.startsWith('PROMITAC-')).toBe(true)
    expect(code).not.toMatch(/[+/=\s]/)
    expect(decodeConnectionCode(code)).toEqual(config)
  })

  it('tolerates whitespace and line breaks from copying out of an e-mail', () => {
    const code = encodeConnectionCode(config)
    const messy = `  ${code.slice(0, 20)}\n${code.slice(20)}  `
    expect(decodeConnectionCode(messy)).toEqual(config)
  })

  it('carries an optional church invite code', () => {
    const code = encodeConnectionCode({ ...config, invite: 'abcd-1234' })
    expect(decodeConnectionCode(code)).toEqual({ ...config, invite: 'ABCD-1234' })
  })

  it('drops a trailing slash from the address', () => {
    const code = encodeConnectionCode({ ...config, url: 'https://abcd.supabase.co/' })
    expect(decodeConnectionCode(code)?.url).toBe('https://abcd.supabase.co')
  })

  it('rejects garbage, foreign prefixes and non-https addresses', () => {
    expect(decodeConnectionCode('')).toBeNull()
    expect(decodeConnectionCode('hello')).toBeNull()
    expect(decodeConnectionCode('PROMITAC-!!!')).toBeNull()
    expect(decodeConnectionCode(encodeConnectionCode(config).replace('PROMITAC-', 'OTHER-'))).toBeNull()
    expect(
      decodeConnectionCode(encodeConnectionCode({ ...config, url: 'ftp://abcd.supabase.co' }))
    ).toBeNull()
    expect(decodeConnectionCode(encodeConnectionCode({ ...config, anonKey: ' ' }))).toBeNull()
  })
})
