/**
 * Test helper utilities for Miniflare integration tests
 */

import { Miniflare } from 'miniflare';

/**
 * Create a Miniflare instance for testing
 */
export async function createTestWorker(): Promise<Miniflare> {
  const mf = new Miniflare({
    modules: true,
    scriptPath: './dist/worker.js',
    compatibilityDate: '2024-01-01',
    compatibilityFlags: ['nodejs_compat'],
  });

  return mf;
}

/**
 * Make a request to the test worker
 */
export async function fetchFromWorker(
  mf: Miniflare,
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = `http://localhost${path}`;
  return mf.dispatchFetch(url, options);
}

/**
 * Parse JSON response from worker
 */
export async function getJsonFromWorker<T>(
  mf: Miniflare,
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetchFromWorker(mf, path, options);
  return response.json() as Promise<T>;
}

/**
 * Assert response status and return JSON body
 */
export async function expectJsonResponse<T>(
  mf: Miniflare,
  path: string,
  expectedStatus: number = 200,
  options?: RequestInit
): Promise<T> {
  const response = await fetchFromWorker(mf, path, options);

  if (response.status !== expectedStatus) {
    const body = await response.text();
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}. Body: ${body}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Create test fixtures for a given year
 */
export function createTestFixtures(year: number) {
  return [
    {
      id: `${year}-MEL-1`,
      year,
      round: 1,
      teamCode: 'MEL',
      opponentCode: 'BRO',
      isHome: true,
      isBye: false,
      strengthRating: 85,
    },
    {
      id: `${year}-BRO-1`,
      year,
      round: 1,
      teamCode: 'BRO',
      opponentCode: 'MEL',
      isHome: false,
      isBye: false,
      strengthRating: 72,
    },
    {
      id: `${year}-MEL-2`,
      year,
      round: 2,
      teamCode: 'MEL',
      opponentCode: null,
      isHome: false,
      isBye: true,
      strengthRating: -500,
    },
  ];
}
