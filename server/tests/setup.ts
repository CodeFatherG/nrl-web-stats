/**
 * Test setup and utilities
 */

import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Load HTML fixture
const fixturesDir = path.join(__dirname, 'fixtures');

export function loadFixture(filename: string): string {
  return fs.readFileSync(path.join(fixturesDir, filename), 'utf-8');
}

// Mock fetcher module
export function mockFetcher(html: string) {
  return vi.fn().mockResolvedValue(html);
}
