-- Migration: add missing NRL venues
--
-- Adds stadium rows that were absent from the original 0012 seed, discovered
-- by sweeping all 2026 rounds from /api/rounds/:year/:round.
--
-- IDs match the canonical identifiers used in VENUE_NORMALISATION.

INSERT OR IGNORE INTO stadiums (id, name, city) VALUES
  ('go_media',        'Go Media Stadium',           'Auckland'),
  ('jubilee',         'Jubilee Stadium',            'Sydney'),
  ('glen_willow',     'Glen Willow Oval',           'Mudgee'),
  ('carrington_park', 'Carrington Park',            'Bathurst'),
  ('hbf_park',        'HBF Park',                   'Perth'),
  ('kayo_stadium',    'Kayo Stadium',               'Redcliffe'),
  ('polytec',         'Polytec Stadium',            NULL),
  ('hnry',            'Hnry Stadium',               'Wellington'),
  ('one_nz',          'One NZ Stadium',             NULL),
  ('belmore',         'Belmore Sports Ground',      'Sydney'),
  ('apollo_projects', 'Apollo Projects Stadium',    'Christchurch');
