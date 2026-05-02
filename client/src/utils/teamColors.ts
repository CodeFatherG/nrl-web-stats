export interface TeamColors {
  /** Primary brand colour (hex) */
  primary: string;
  /** Very soft tint suitable as a table-row background */
  background: string;
}

const COLORS: Record<string, TeamColors> = {
  BRO: { primary: '#4E1A21', background: '#e8c4b8' }, // Broncos — warm brown-rose
  BUL: { primary: '#0062A3', background: '#b8d0f0' }, // Bulldogs — medium blue
  CBR: { primary: '#6CC24A', background: '#c4ecb0' }, // Raiders — lime green
  DOL: { primary: '#C8102E', background: '#f8b8b8' }, // Dolphins — red-pink
  GCT: { primary: '#009A93', background: '#9edcda' }, // Titans — teal
  MEL: { primary: '#490D60', background: '#d4b4ec' }, // Storm — purple
  MNL: { primary: '#5D0024', background: '#f5bcd8' }, // Sea Eagles — cool pink
  NEW: { primary: '#003087', background: '#f4c0c0' }, // Knights — rose red (accent, not blue)
  NQC: { primary: '#002B5C', background: '#fcec94' }, // Cowboys — bright yellow-gold
  NZL: { primary: '#808080', background: '#cccccc' }, // Warriors — grey
  PAR: { primary: '#0065A4', background: '#fcc870' }, // Eels — amber-gold (not blue)
  PTH: { primary: '#2D1A4A', background: '#dcd8f4' }, // Panthers — lavender
  SHA: { primary: '#00A2E5', background: '#a0d8f8' }, // Sharks — sky blue
  STG: { primary: '#E61E28', background: '#fcc8b8' }, // Dragons — coral
  STH: { primary: '#006937', background: '#a8dcc0' }, // Rabbitohs — forest green
  SYD: { primary: '#C8102E', background: '#f8e0c0' }, // Roosters — warm cream
  WST: { primary: '#E04E28', background: '#fcb890' }, // Wests Tigers — orange
};

const FALLBACK: TeamColors = { primary: '#666666', background: '#f5f5f5' };

export function getTeamColors(teamCode: string): TeamColors {
  return COLORS[teamCode] ?? FALLBACK;
}

/** Returns a soft background hex suitable for table rows. */
export function getTeamBackground(teamCode: string): string {
  return getTeamColors(teamCode).background;
}

/** Returns the primary brand hex for icons, chips, etc. */
export function getTeamPrimary(teamCode: string): string {
  return getTeamColors(teamCode).primary;
}
