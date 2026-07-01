import { describe, it, expect, vi } from 'vitest';
import {
  isQuotaExhaustedError,
  wrapKvErrors,
} from '../../../../src/infrastructure/persistence/kv-errors.js';

class TypedQuotaError extends Error {
  constructor(message: string, public override readonly cause?: Error) {
    super(message);
    this.name = 'TypedQuotaError';
  }
}

describe('isQuotaExhaustedError', () => {
  it('returns false for non-Error inputs', () => {
    expect(isQuotaExhaustedError('string')).toBe(false);
    expect(isQuotaExhaustedError(null)).toBe(false);
    expect(isQuotaExhaustedError(undefined)).toBe(false);
    expect(isQuotaExhaustedError(429)).toBe(false);
    expect(isQuotaExhaustedError({ message: 'HTTP 429: quota' })).toBe(false);
  });

  it('returns false for Error without "429"', () => {
    expect(isQuotaExhaustedError(new Error('connection refused'))).toBe(false);
  });

  it('returns false for "429" without quota signal', () => {
    expect(
      isQuotaExhaustedError(new Error('HTTP 429 Too Many Requests')),
    ).toBe(false);
  });

  it('returns true for "429" + "daily limit"', () => {
    expect(
      isQuotaExhaustedError(new Error('HTTP 429: daily limit exceeded')),
    ).toBe(true);
  });

  it('returns true for "429" + "quota"', () => {
    expect(
      isQuotaExhaustedError(new Error('HTTP 429: quota exceeded')),
    ).toBe(true);
  });

  it('returns true for "429" + "rate limit" (case-insensitive)', () => {
    expect(
      isQuotaExhaustedError(new Error('HTTP 429: Rate Limit hit')),
    ).toBe(true);
  });
});

describe('wrapKvErrors', () => {
  it('returns op result on success', async () => {
    const result = await wrapKvErrors({
      op: async () => 42,
      wrapQuotaAs: cause => new TypedQuotaError('quota', cause),
    });
    expect(result).toBe(42);
  });

  it('re-throws non-quota errors unchanged', async () => {
    const original = new Error('network');
    await expect(
      wrapKvErrors({
        op: async () => {
          throw original;
        },
        wrapQuotaAs: cause => new TypedQuotaError('quota', cause),
      }),
    ).rejects.toBe(original);
  });

  it('translates quota errors via wrapQuotaAs with cause preserved', async () => {
    const original = new Error('HTTP 429: daily limit exceeded');
    try {
      await wrapKvErrors({
        op: async () => {
          throw original;
        },
        wrapQuotaAs: cause => new TypedQuotaError('translated', cause),
      });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TypedQuotaError);
      expect((err as TypedQuotaError).message).toBe('translated');
      expect((err as TypedQuotaError).cause).toBe(original);
    }
  });

  it('does not invoke wrapQuotaAs for non-quota errors', async () => {
    const wrap = vi.fn((cause: Error) => new TypedQuotaError('translated', cause));
    await expect(
      wrapKvErrors({
        op: async () => {
          throw new Error('network');
        },
        wrapQuotaAs: wrap,
      }),
    ).rejects.toThrow('network');
    expect(wrap).not.toHaveBeenCalled();
  });
});
