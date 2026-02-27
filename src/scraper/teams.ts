/**
 * Team code mapping constants for parsing
 */

/** Map of team image filenames to team codes */
export const TEAM_IMAGE_MAP: Record<string, string> = {
  'broncos': 'BRO',
  'bulldogs': 'BUL',
  'raiders': 'CBR',
  'dolphins': 'DOL',
  'titans': 'GCT',
  'storm': 'MEL',
  'sea-eagles': 'MNL',
  'seaeagles': 'MNL',
  'manly': 'MNL',
  'knights': 'NEW',
  'cowboys': 'NQC',
  'warriors': 'NZL',
  'eels': 'PAR',
  'perth': 'PTH',
  'sharks': 'SHA',
  'dragons': 'STG',
  'rabbitohs': 'STH',
  'roosters': 'SYD',
  'tigers': 'WST',
  'wests': 'WST',
  // Also match on 3-letter codes in URLs
  'bro': 'BRO',
  'bul': 'BUL',
  'cbr': 'CBR',
  'dol': 'DOL',
  'gct': 'GCT',
  'mel': 'MEL',
  'mnl': 'MNL',
  'new': 'NEW',
  'nqc': 'NQC',
  'nzl': 'NZL',
  'par': 'PAR',
  'pth': 'PTH',
  'sha': 'SHA',
  'stg': 'STG',
  'sth': 'STH',
  'syd': 'SYD',
  'wst': 'WST',
};

/**
 * Extract team code from image filename or URL
 */
export function extractTeamCodeFromImage(imageSrc: string): string | null {
  if (!imageSrc) return null;

  // Try to extract from image filename
  const lowerSrc = imageSrc.toLowerCase();

  // Check for team names in the URL
  for (const [key, code] of Object.entries(TEAM_IMAGE_MAP)) {
    if (lowerSrc.includes(key)) {
      return code;
    }
  }

  // Try to extract 3-letter code pattern from filename
  const match = lowerSrc.match(/([a-z]{3})\.(?:png|jpg|gif|svg)/);
  if (match) {
    const potentialCode = match[1].toUpperCase();
    if (Object.values(TEAM_IMAGE_MAP).includes(potentialCode)) {
      return potentialCode;
    }
  }

  return null;
}

/**
 * Check if a string is a valid 3-letter team code
 */
export function isTeamCode(text: string): boolean {
  const upperText = text.toUpperCase();
  return Object.values(TEAM_IMAGE_MAP).includes(upperText);
}
