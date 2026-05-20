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
  'Campbelltown Sports Stadium': 'campbelltown',
  'Ramsgate Road Ground': 'campbelltown',

  // PointsBet Stadium / Shark Park / Ocean Protect Stadium (Cronulla)
  'PointsBet Stadium': 'pointsbet',
  'Shark Park': 'pointsbet',
  'Shark Stadium': 'pointsbet',
  'Sharks Stadium': 'pointsbet',
  'Ocean Protect Stadium': 'pointsbet',

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

  // Go Media Stadium / Mt Smart Stadium (Auckland — NZL home ground)
  'Go Media Stadium': 'go_media',
  'Mt Smart Stadium': 'go_media',
  'Mount Smart Stadium': 'go_media',

  // Jubilee Stadium / Kogarah Oval (St George home ground)
  'Jubilee Stadium': 'jubilee',
  'Jubilee Oval': 'jubilee',
  'UOW Jubilee Oval': 'jubilee',
  'Kogarah Oval': 'jubilee',
  'Netstrata Jubilee Stadium': 'jubilee',

  // Glen Willow Oval (Mudgee — regional fixtures)
  'Glen Willow Oval': 'glen_willow',
  'Glen Willow Sporting Complex': 'glen_willow',

  // Carrington Park (Bathurst — regional fixtures)
  'Carrington Park': 'carrington_park',

  // HBF Park (Perth — rectangular stadium, distinct from Optus Stadium)
  'HBF Park': 'hbf_park',
  'nib Stadium': 'hbf_park',
  'Perth Oval': 'hbf_park',

  // Kayo Stadium (Redcliffe — Dolphins home ground)
  'Kayo Stadium': 'kayo_stadium',
  'Moreton Daily Stadium': 'kayo_stadium',
  'Dolphin Oval': 'kayo_stadium',
  'Redcliffe Showgrounds': 'kayo_stadium',

  // Polytec Stadium
  'Polytec Stadium': 'polytec',

  // Hnry Stadium (Wellington Regional Stadium / Sky Stadium)
  'Hnry Stadium': 'hnry',
  'Sky Stadium': 'hnry',
  'Wellington Regional Stadium': 'hnry',

  // One NZ Stadium
  'One NZ Stadium': 'one_nz',

  // Belmore Sports Ground / Belmore Oval (Canterbury traditional home)
  'Belmore Sports Ground': 'belmore',
  'Belmore Oval': 'belmore',

  // Apollo Projects Stadium (Christchurch — NZL home fixture, also AMI / Orangetheory / Rugby League Park)
  'Apollo Projects Stadium': 'apollo_projects',
  'Orangetheory Stadium': 'apollo_projects',
  'AMI Stadium': 'apollo_projects',
  'Rugby League Park': 'apollo_projects',
};

/** All valid canonical venue IDs — used for query param validation. */
export const VALID_VENUE_IDS: readonly string[] = [
  ...new Set(Object.values(VENUE_NORMALISATION)),
].sort();
