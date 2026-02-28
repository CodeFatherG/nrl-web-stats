/**
 * Result type for port interface return values.
 * Discriminated union for explicit success/failure handling.
 */

import type { Warning } from '../models/types.js';

export type Result<T> =
  | { readonly success: true; readonly data: T; readonly warnings: Warning[] }
  | { readonly success: false; readonly error: string };

/** Create a successful result */
export function success<T>(data: T, warnings: Warning[] = []): Result<T> {
  return { success: true, data, warnings };
}

/** Create a failed result */
export function failure<T>(error: string): Result<T> {
  return { success: false, error };
}
