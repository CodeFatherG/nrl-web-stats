/**
 * Shared KV quota-exhausted detection and write-side error translation.
 *
 * Centralises the regex + try/catch pattern previously duplicated across every
 * KV-backed adapter. See
 * `specs/041-kv-envelope-extraction/contracts/kv-errors.md`.
 */

/** Match KV's daily-write-limit-exceeded response. Cloudflare's KV SDK throws
 *  with a message containing "429" and a body referencing the rate-limit /
 *  daily-limit. We match conservatively on both signals so a generic 429 from
 *  a different cause (e.g. burst rate limit) doesn't get misclassified — and
 *  if we ARE wrong, the dispatcher's worst case is "terminal instead of
 *  retry," which is the safe direction (DLQ rather than burning retry slots). */
export function isQuotaExhaustedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (!/429/.test(msg)) return false;
  return /daily limit|rate limit|quota/i.test(msg);
}

/**
 * Execute `op`. If it throws a quota-exhausted error (per
 * `isQuotaExhaustedError`), translate it via `wrapQuotaAs(cause)` and throw
 * the typed error. All other errors propagate untouched.
 */
export async function wrapKvErrors<T, E extends Error>(args: {
  op: () => Promise<T>;
  wrapQuotaAs: (cause: Error) => E;
}): Promise<T> {
  try {
    return await args.op();
  } catch (err) {
    if (isQuotaExhaustedError(err)) {
      throw args.wrapQuotaAs(err as Error);
    }
    throw err;
  }
}
