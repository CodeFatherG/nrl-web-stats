/**
 * HTML parser for NRL schedule table using Cheerio
 */

import * as cheerio from 'cheerio';
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
 * Parse HTML to extract schedule data
 */
export function parseScheduleHtml(html: string, year: number): ParseResult {
  const $ = cheerio.load(html);
  const fixtures: Fixture[] = [];
  const warnings: Warning[] = [];
  const teamsFound = new Set<string>();

  // Find tables that look like schedule tables
  const tables = $('table');

  logger.debug('Found tables', { count: tables.length });

  // Only process the first valid schedule table to avoid duplicates
  // (some pages have the same table twice for different viewport sizes)
  let foundValidTable = false;

  tables.each((tableIndex, table) => {
    // Skip if we already found a valid table
    if (foundValidTable) {
      return;
    }

    const rows = $(table).find('tr');

    // Look for header row with round numbers
    let headerRow: ReturnType<typeof $> | null = null;
    let roundCount = 0;

    rows.each((rowIndex, row) => {
      const cells = $(row).find('td, th');
      const cellTexts = cells.map((_, cell) => $(cell).text().trim()).get();

      // Check if this row contains round headers (Rd1, Rd2, etc.)
      const roundCells = cellTexts.filter(text => /^Rd\d+$/i.test(text));
      if (roundCells.length >= 20) {
        headerRow = $(row);
        roundCount = roundCells.length;
        logger.debug('Found header row', { tableIndex, rowIndex, roundCount });
      }
    });

    if (!headerRow || roundCount === 0) {
      return; // Continue to next table
    }

    // Mark that we found a valid table - don't process any more tables
    foundValidTable = true;
    logger.debug('Using table', { tableIndex });

    // Process data rows (rows after header that contain team data)
    let headerRowIndex = rows.index(headerRow);

    rows.slice(headerRowIndex + 1).each((dataRowIndex, row) => {
      const cells = $(row).find('td');

      if (cells.length < roundCount) {
        return; // Skip rows with insufficient cells
      }

      // Try to extract team code from first cell (usually contains team image)
      const firstCell = cells.first();
      const teamImg = firstCell.find('img').attr('src');
      let teamCode = teamImg ? extractTeamCodeFromImage(teamImg) : null;

      // Fallback: try to find team code in cell text
      if (!teamCode) {
        const cellText = firstCell.text().trim();
        if (isTeamCode(cellText)) {
          teamCode = cellText.toUpperCase();
        }
      }

      if (!teamCode) {
        // Try all images in the row
        const allImgs = $(row).find('img');
        allImgs.each((_, img) => {
          if (!teamCode) {
            const src = $(img).attr('src');
            if (src) {
              teamCode = extractTeamCodeFromImage(src);
            }
          }
        });
      }

      if (!teamCode) {
        logger.debug('Could not extract team code from row', {
          tableIndex,
          dataRowIndex,
          firstCellText: firstCell.text().trim().substring(0, 50),
        });
        return;
      }

      teamsFound.add(teamCode);

      // Parse each round cell
      // The data row has: [team code cell] [team image cell] [Rd1 data] [Rd2 data] ...
      // So we need to skip the first 2 cells before fixture data begins
      const teamInfoCells = 2;
      cells.each((cellIndex, cell) => {
        // Skip the team info cells at the start
        if (cellIndex < teamInfoCells) return;

        const cellText = $(cell).text().trim();
        const roundNumber = cellIndex - teamInfoCells + 1;

        if (roundNumber > roundCount) return;

        const { data, warning } = parseCell(cellText, dataRowIndex, cellIndex);

        if (warning) {
          warnings.push(warning);
        }

        if (data) {
          const fixture = createFixture(
            year,
            roundNumber,
            teamCode!,
            data.opponentCode,
            data.isHome,
            data.strengthRating
          );
          fixtures.push(fixture);
        }
      });
    });
  });

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
