import { describe, expect, test } from 'bun:test'
import { normalizeInviteTokenInput, parseInviteTokenFromUrl } from './invites'

describe('invite links', () => {
  test('parses native app invite links', () => {
    expect(parseInviteTokenFromUrl('splitclub://invite/join_123')).toBe('join_123')
    expect(parseInviteTokenFromUrl('splitclub:///invite/join_abc')).toBe('join_abc')
  })

  test('parses hosted invite links and query tokens', () => {
    expect(parseInviteTokenFromUrl('https://api.splitclub.app/invite/join_456')).toBe('join_456')
    expect(parseInviteTokenFromUrl('https://splitclub.app/app?token=join_789')).toBe('join_789')
    expect(parseInviteTokenFromUrl('https://splitclub.app/#/invite/join_hash')).toBe('join_hash')
  })

  test('normalizes pasted raw invite tokens', () => {
    expect(normalizeInviteTokenInput(' join_manual ')).toBe('join_manual')
    expect(normalizeInviteTokenInput('not a token')).toBeNull()
    expect(normalizeInviteTokenInput('%')).toBeNull()
  })
})
