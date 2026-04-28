/**
 * Venue normalisation config — maps raw nrl.com stadium strings to canonical IDs.
 * Feature: 029-venue-weather-analytics
 *
 * The canonical IDs match the `id` column of the `stadiums` D1 table.
 * Raw strings are as they appear in `matches.stadium` from the nrl.com draw/results API.
 * Multiple raw variants for the same ground map to the same canonical ID.
 */

export const VENUE_NORMALISATION: Record<string, string> = {
  // Suncorp Stadium / Lang Park (Brisbane)
  'Suncorp Stadium': 'suncorp',
  'Suncorp Stadium Brisbane': 'suncorp',
  'Lang Park': 'suncorp',

  // Accor Stadium / Stadium Australia (Sydney Olympic Park)
  'Accor Stadium': 'accor_stadium',
  'Stadium Australia': 'accor_stadium',
  'ANZ Stadium': 'accor_stadium',

  // Allianz Stadium / Sydney Football Stadium (Moore Park)
  'Allianz Stadium': 'allianz',
  'Sydney Football Stadium': 'allianz',
  'SCG': 'allianz',

  // 4 Pines Park / Brookvale Oval (Manly)
  '4 Pines Park': '4_pines_park',
  'Brookvale Oval': '4_pines_park',

  // CommBank Stadium / Parramatta Stadium
  'CommBank Stadium': 'commbank',
  'Parramatta Stadium': 'commbank',
  'Western Sydney Stadium': 'commbank',

  // Leichhardt Oval
  'Leichhardt Oval': 'leichhardt',

  // Campbelltown Stadium
  'Campbelltown Stadium': 'campbelltown',
  'Ramsgate Road Ground': 'campbelltown',

  // PointsBet Stadium / Shark Park (Cronulla)
  'PointsBet Stadium': 'pointsbet',
  'Shark Park': 'pointsbet',

  // BlueBet Stadium / Penrith Stadium
  'BlueBet Stadium': 'bluebet',
  'Penrith Stadium': 'bluebet',

  // Industree Group Stadium / Central Coast Stadium (Gosford)
  'Industree Group Stadium': 'industree_group',
  'Central Coast Stadium': 'industree_group',
  'Bluetongue Stadium': 'industree_group',

  // McDonald Jones Stadium / Hunter Stadium (Newcastle)
  'McDonald Jones Stadium': 'mcdonald_jones',
  'Hunter Stadium': 'mcdonald_jones',
  'Newcastle Stadium': 'mcdonald_jones',

  // WIN Stadium (Wollongong)
  'WIN Stadium': 'win',
  'Wollongong Sports Ground': 'win',

  // GIO Stadium / Canberra Stadium
  'GIO Stadium': 'gio',
  'Canberra Stadium': 'gio',
  'Scrivener Oval': 'gio',

  // AAMI Park (Melbourne)
  'AAMI Park': 'aami_park',

  // Mars Stadium (Ballarat)
  'Mars Stadium': 'mars',

  // Cbus Super Stadium / Gold Coast Stadium
  'Cbus Super Stadium': 'cbus_super',
  'Gold Coast Stadium': 'cbus_super',
  'Robina Stadium': 'cbus_super',
  'CBus Super Stadium': 'cbus_super',

  // Queensland Country Bank Stadium (Townsville)
  'Queensland Country Bank Stadium': 'qcb_stadium',
  'Townsville Stadium': 'qcb_stadium',
  '1300SMILES Stadium': 'qcb_stadium',

  // Barlow Park (Cairns)
  'Barlow Park': 'barlow_park',

  // TIO Stadium (Darwin)
  'TIO Stadium': 'tio',
  'Darwin Stadium': 'tio',

  // Optus Stadium (Perth)
  'Optus Stadium': 'optus',
  'Perth Stadium': 'optus',

  // Allegiant Stadium (Las Vegas)
  'Allegiant Stadium': 'allegiant',
  'Allegiant Stadium Las Vegas': 'allegiant',
};

/** All valid canonical venue IDs — used for query param validation. */
export const VALID_VENUE_IDS: readonly string[] = [
  ...new Set(Object.values(VENUE_NORMALISATION)),
].sort();
