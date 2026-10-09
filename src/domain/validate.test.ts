import { describe, expect, it } from 'vitest'
import { LIMITS, parseMessage, sanitizeText } from './validate'

const NOW = 1_700_000_000_000
const valid = { id: 'evt_1', ts: NOW, service: 'payments', severity: 'error', latencyMs: 120.44, message: 'Upstream 502' }
const parse = (value: unknown) => parseMessage(typeof value === 'string' ? value : JSON.stringify(value), NOW)

describe('parseMessage', () => {
  it('accepts a well-formed event and builds a fresh object from allow-listed fields', () => {
    const result = parse({ ...valid, extra: 'ignored', isAdmin: true })
    expect(result).toEqual({
      ok: true,
      value: { id: 'evt_1', timestamp: NOW, service: 'payments', severity: 'error', latencyMs: 120.4, message: 'Upstream 502' },
    })
  })

  it.each([
    ['non-text frame', 42, 'not-text'],
    ['binary frame', new ArrayBuffer(8), 'not-text'],
  ])('rejects %s before parsing', (_name, raw, reason) => {
    expect(parseMessage(raw, NOW)).toEqual({ ok: false, reason })
  })

  it('rejects oversized frames before JSON.parse', () => {
    expect(parseMessage('x'.repeat(LIMITS.maxRawLength + 1), NOW)).toEqual({ ok: false, reason: 'too-large' })
  })

  it.each([
    ['truncated JSON', '{"id": "a", "severity": '],
    ['plain text', 'hello'],
  ])('rejects %s', (_name, raw) => {
    expect(parseMessage(raw, NOW)).toEqual({ ok: false, reason: 'invalid-json' })
  })

  it.each([
    ['array', [1, 2]],
    ['null', null],
    ['number', 7],
  ])('rejects a JSON %s', (_name, value) => {
    expect(parse(value)).toEqual({ ok: false, reason: 'not-object' })
  })

  it.each([
    ['unknown severity', { severity: 'debug' }],
    ['latency as string', { latencyMs: 'fast' }],
    ['negative latency', { latencyMs: -1 }],
    ['non-finite latency (NaN)', { latencyMs: Number.NaN }],
    ['latency above cap', { latencyMs: LIMITS.maxLatencyMs + 1 }],
    ['markup in service name', { service: '<b>auth</b>' }],
    ['id with spaces', { id: 'a b' }],
    ['overlong id', { id: 'a'.repeat(LIMITS.maxIdLength + 1) }],
    ['empty message', { message: '   ' }],
    ['message of only control characters', { message: '\u0000\u0007' }],
  ])('rejects %s', (_name, patch) => {
    expect(parse({ ...valid, ...patch })).toEqual({ ok: false, reason: 'invalid-field' })
  })

  it('does not read fields from the prototype chain (__proto__ payload)', () => {
    const raw = '{"__proto__":{"message":"from proto"},"id":"p","service":"auth","severity":"info","latencyMs":1}'
    expect(parseMessage(raw, NOW)).toEqual({ ok: false, reason: 'invalid-field' })
    expect(({} as Record<string, unknown>).message).toBeUndefined()
  })

  it('keeps markup as inert text (escaping is the renderer’s job, not mangling input)', () => {
    const result = parse({ ...valid, message: '<img src=x onerror=alert(1)>' })
    expect(result.ok && result.value.message).toBe('<img src=x onerror=alert(1)>')
  })

  it('replaces implausible source timestamps with the receive time', () => {
    const result = parse({ ...valid, ts: NOW + 365 * 24 * 3600_000 })
    expect(result.ok && result.value.timestamp).toBe(NOW)
    const missing = parse({ ...valid, ts: undefined })
    expect(missing.ok && missing.value.timestamp).toBe(NOW)
  })
})

describe('sanitizeText', () => {
  it('strips bidi overrides and zero-width characters', () => {
    expect(sanitizeText('Invoice \u202Etxt.exe\u202C ready\u200B', 100)).toBe('Invoice txt.exe ready')
  })

  it('collapses whitespace and newlines', () => {
    expect(sanitizeText('  a\n\tb   c ', 100)).toBe('a b c')
  })

  it('truncates on code-point boundaries', () => {
    const out = sanitizeText('😀'.repeat(10), 5)
    expect(out).toBe('😀😀😀😀…')
    expect(out && /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out)).toBe(false)
  })
})
