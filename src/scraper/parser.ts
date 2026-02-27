/**
 * HTML parser for NRL schedule table using LinkedOM
 * Migrated from Cheerio for Cloudflare Workers compatibility
 */

import { parseHTML } from 'linkedom';
import type { Fixture } from '../models/fixture.js';
import { createFixture } from '../models/fixture.js';
import type { Warning } from '../models/types.js';
import { extractTeamCodeFromImage, isTeamCode } from './teams.js';
import { logger } from '../utils/logger.js';

interface ParseResult {
  fixtures: Fixture[];
  warnings: Warning[];
  teamCount: number;
}

interface CellData {
  opponentCode: string | null;
  isHome: boolean;
  isBye: boolean;
  strengthRating: number;
}

/**
 * Parse opponent/bye and strength from a cell
 */
function parseCell(cellText: string, row: number, col: number): { data: CellData | null; warning: Warning | null } {
  const text = cellText.trim();

  if (!text || text === '-') {
    return { data: null, warning: null };
  }

  // Check for bye week
  if (text.toUpperCase().includes('BYE') || text.startsWith('-')) {
    // Extract bye penalty (negative number)
    const strengthMatch = text.match(/(-?\d+)/);
    const strengthRating = strengthMatch ? parseInt(strengthMatch[1], 10) : -500;

    return {
      data: {
        opponentCode: null,
        isHome: false,
        isBye: true,
        strengthRating,
      },
      warning: null,
    };
  }

  // Parse regular fixture: "MEL(A)" or "MEL" followed by a number
  // Pattern: 3-letter code + optional (A) + number
  const fixtureMatch = text.match(/^([A-Z]{3})(\(A\))?\s*(-?\d+)/i);

  if (fixtureMatch) {
    const opponentCode = fixtureMatch[1].toUpperCase();
    const isAway = !!fixtureMatch[2];
    const strengthRating = parseInt(fixtureMatch[3], 10);

    return {
      data: {
        opponentCode,
        isHome: !isAway,
        isBye: false,
        strengthRating,
      },
      warning: null,
    };
  }

  // Try alternative pattern: number first, then code
  const altMatch = text.match(/(-?\d+)\s*([A-Z]{3})(\(A\))?/i);
  if (altMatch) {
    const strengthRating = parseInt(altMatch[1], 10);
    const opponentCode = altMatch[2].toUpperCase();
    const isAway = !!altMatch[3];

    return {
      data: {
        opponentCode,
        isHome: !isAway,
        isBye: false,
        strengthRating,
      },
      warning: null,
    };
  }

  // Check if it's just a team code
  const codeMatch = text.match(/^([A-Z]{3})(\(A\))?$/i);
  if (codeMatch) {
    return {
      data: {
        opponentCode: codeMatch[1].toUpperCase(),
        isHome: !codeMatch[2],
        isBye: false,
        strengthRating: 0,
      },
      warning: {
        type: 'MISSING_DATA',
        message: 'No strength rating found for fixture',
        context: { row, col, content: text },
      },
    };
  }

  // Malformed cell
  return {
    data: null,
    warning: {
      type: 'MALFORMED_CELL',
      message: 'Could not parse cell content',
      context: { row, col, content: text },
    },
  };
}

/**
 * Parse HTML to extract schedule data using LinkedOM
 */
export function parseScheduleHtml(html: string, year: number): ParseResult {
  const { document } = parseHTML(html);
  const fixtures: Fixture[] = [];
  const warnings: Warning[] = [];
  const teamsFound = new Set<string>();

  // Find tables that look like schedule tables
  const tables = document.querySelectorAll('table');

  logger.debug('Found tables', { count: tables.length });

  // Only process the first valid schedule table to avoid duplicates
  // (some pages have the same table twice for different viewport sizes)
  let foundValidTable = false;

  for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
    // Skip if we already found a valid table
    if (foundValidTable) {
      break;
    }

    const table = tables[tableIndex];
    const rows = table.querySelectorAll('tr');

    // Look for header row with round numbers
    let headerRow: Element | null = null;
    let headerRowIndex = -1;
    let roundCount = 0;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const cells = row.querySelectorAll('td, th');
      const cellTexts: string[] = [];

      cells.forEach((cell: Element) => {
        cellTexts.push(cell.textContent?.trim() || '');
      });

      // Check if this row contains round headers (Rd1, Rd2, etc.)
      const roundCells = cellTexts.filter(text => /^Rd\d+$/i.test(text));
      if (roundCells.length >= 20) {
        headerRow = row;
        headerRowIndex = rowIndex;
        roundCount = roundCells.length;
        logger.debug('Found header row', { tableIndex, rowIndex, roundCount });
        break;
      }
    }

    if (!headerRow || roundCount === 0) {
      continue; // Continue to next table
    }

    // Mark that we found a valid table - don't process any more tables
    foundValidTable = true;
    logger.debug('Using table', { tableIndex });

    // Process data rows (rows after header that contain team data)
    for (let dataRowIndex = headerRowIndex + 1; dataRowIndex < rows.length; dataRowIndex++) {
      const row = rows[dataRowIndex];
      const cells = row.querySelectorAll('td');

      if (cells.length < roundCount) {
        continue; // Skip rows with insufficient cells
      }

      // Try to extract team code from first cell (usually contains team image)
      const firstCell = cells[0];
      const teamImg = firstCell.querySelector('img');
      let teamCode = teamImg ? extractTeamCodeFromImage(teamImg.getAttribute('src') || '') : null;

      // Fallback: try to find team code in cell text
      if (!teamCode) {
        const cellText = firstCell.textContent?.trim() || '';
        if (isTeamCode(cellText)) {
          teamCode = cellText.toUpperCase();
        }
      }

      if (!teamCode) {
        // Try all images in the row
        const allImgs = Array.from(row.querySelectorAll('img'));
        for (const img of allImgs) {
          if (!teamCode) {
            const src = img.getAttribute('src');
            if (src) {
              teamCode = extractTeamCodeFromImage(src);
            }
          }
        }
      }

      if (!teamCode) {
        logger.debug('Could not extract team code from row', {
          tableIndex,
          dataRowIndex,
          firstCellText: (firstCell.textContent?.trim() || '').substring(0, 50),
        });
        continue;
      }

      teamsFound.add(teamCode);

      // Parse each round cell
      // The data row has: [team code cell] [team image cell] [Rd1 data] [Rd2 data] ...
      // So we need to skip the first 2 cells before fixture data begins
      const teamInfoCells = 2;

      for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
        // Skip the team info cells at the start
        if (cellIndex < teamInfoCells) continue;

        const cell = cells[cellIndex];
        const cellText = cell.textContent?.trim() || '';
        const roundNumber = cellIndex - teamInfoCells + 1;

        if (roundNumber > roundCount) continue;

        const { data, warning } = parseCell(cellText, dataRowIndex, cellIndex);

        if (warning) {
          warnings.push(warning);
        }

        if (data) {
          const fixture = createFixture(
            year,
            roundNumber,
            teamCode,
            data.opponentCode,
            data.isHome,
            data.strengthRating
          );
          fixtures.push(fixture);
        }
      }
    }
  }

  logger.info('Parsed schedule HTML', {
    year,
    fixturesFound: fixtures.length,
    teamsFound: teamsFound.size,
    warnings: warnings.length,
  });

  return {
    fixtures,
    warnings,
    teamCount: teamsFound.size,
  };
}
