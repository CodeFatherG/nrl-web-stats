/**
 * Cache module exports.
 *
 * `CacheStore` and `getNextMondayExpiry` were removed by spec 038 — fixture
 * persistence now goes through `FixtureRepository`. Only the result-cache
 * (per-isolate match-result coalescing) remains.
 */

export { ResultCacheStore, resultCacheStore } from './result-cache.js';
