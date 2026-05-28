import { describe, it, expect, expectTypeOf } from 'vitest';
import { z } from 'zod';
import { parseEnvelopeJson } from '../../../../src/infrastructure/persistence/envelope.js';

const TrivialSchema = z.object({ bar: z.string() });

const EnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  computedAt: z.string(),
  payload: z.object({ value: z.number() }),
});

type Envelope = z.infer<typeof EnvelopeSchema>;

describe('parseEnvelopeJson', () => {
  it('returns null for null input', () => {
    expect(parseEnvelopeJson(null, TrivialSchema)).toBeNull();
  });

  it('returns null for empty string input', () => {
    expect(parseEnvelopeJson('', TrivialSchema)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseEnvelopeJson('{not json', TrivialSchema)).toBeNull();
  });

  it('returns null when schema rejects', () => {
    expect(parseEnvelopeJson('{"foo":1}', TrivialSchema)).toBeNull();
  });

  it('returns null for schemaVersion mismatch (z.literal(1))', () => {
    const raw = JSON.stringify({
      schemaVersion: 2,
      computedAt: '2026-05-28T00:00:00Z',
      payload: { value: 1 },
    });
    expect(parseEnvelopeJson(raw, EnvelopeSchema)).toBeNull();
  });

  it('returns parsed value on success', () => {
    const env: Envelope = {
      schemaVersion: 1,
      computedAt: '2026-05-28T00:00:00Z',
      payload: { value: 42 },
    };
    const raw = JSON.stringify(env);
    expect(parseEnvelopeJson(raw, EnvelopeSchema)).toEqual(env);
  });

  it('never throws on any failure mode', () => {
    const failureInputs: Array<string | null> = [
      null,
      '',
      '{not json',
      '"bare string"',
      '42',
      'null',
      '{"foo":1}',
      JSON.stringify({ schemaVersion: 2, computedAt: 'x', payload: { value: 1 } }),
    ];
    for (const raw of failureInputs) {
      expect(() => parseEnvelopeJson(raw, EnvelopeSchema)).not.toThrow();
    }
  });

  it('infers T from the supplied schema (compile-time)', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      computedAt: 'x',
      payload: { value: 1 },
    });
    const env = parseEnvelopeJson(raw, EnvelopeSchema);
    expectTypeOf(env).toEqualTypeOf<Envelope | null>();
  });
});
