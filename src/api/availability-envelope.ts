/**
 * AvailabilityEnvelope — wire-format wrapper for endpoints whose payload is
 * served from a precomputed-artifact repository.
 *
 * Returned with HTTP 200 in both branches. Clients MUST branch on the
 * top-level `available` discriminator before reading `data` / `asOfRound`.
 *
 * Feature: 037-analytics-cache-replacement (T035).
 */

export type AvailabilityEnvelope<T> =
  | {
      readonly available: true;
      readonly asOfRound: number;
      readonly data: T;
    }
  | {
      readonly available: false;
      readonly asOfRound: null;
      readonly reason: string;
    };

export function precomputePending(): AvailabilityEnvelope<never> {
  return {
    available: false,
    asOfRound: null,
    reason: 'precompute-pending',
  };
}

export function available<T>(asOfRound: number, data: T): AvailabilityEnvelope<T> {
  return { available: true, asOfRound, data };
}
