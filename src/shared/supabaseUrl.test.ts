import { describe, expect, it } from 'vitest'
import { supabaseProjectUrl } from './supabaseUrl'

describe('supabaseProjectUrl', () => {
  it('keeps only the project address from what the dashboard shows', () => {
    expect(supabaseProjectUrl('https://abcd.supabase.co')).toBe('https://abcd.supabase.co')
    expect(supabaseProjectUrl(' https://abcd.supabase.co/ ')).toBe('https://abcd.supabase.co')
    expect(supabaseProjectUrl('https://abcd.supabase.co/rest/v1/')).toBe('https://abcd.supabase.co')
    expect(supabaseProjectUrl('https://abcd.supabase.co/auth/v1?x=1#y')).toBe('https://abcd.supabase.co')
  })

  it('accepts http only for local development', () => {
    expect(supabaseProjectUrl('http://localhost:54321/rest/v1')).toBe('http://localhost:54321')
    expect(supabaseProjectUrl('http://abcd.supabase.co')).toBeNull()
  })

  it('rejects things that are not addresses', () => {
    expect(supabaseProjectUrl('')).toBeNull()
    expect(supabaseProjectUrl('abcd.supabase.co')).toBeNull()
    expect(supabaseProjectUrl('ftp://abcd.supabase.co')).toBeNull()
  })
})
