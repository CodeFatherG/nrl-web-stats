-- Migration: create stadiums lookup table
-- Feature: 029-venue-weather-analytics
--
-- Stores canonical NRL venue records. The `id` is the stable short key used
-- in the venue normalisation config, cache keys, and API params.
-- Seeded with all active NRL grounds at time of migration.

CREATE TABLE IF NOT EXISTS stadiums (
  id   TEXT PRIMARY KEY,   -- canonical identifier, e.g. 'suncorp'
  name TEXT NOT NULL,      -- display name
  city TEXT                -- city / region
);

-- Active NRL venues (seed data)
INSERT OR IGNORE INTO stadiums (id, name, city) VALUES
  ('suncorp',          'Suncorp Stadium',                   'Brisbane'),
  ('accor_stadium',    'Accor Stadium',                     'Sydney'),
  ('allianz',          'Allianz Stadium',                   'Sydney'),
  ('4_pines_park',     '4 Pines Park',                      'Sydney'),
  ('commbank',         'CommBank Stadium',                   'Sydney'),
  ('leichhardt',       'Leichhardt Oval',                   'Sydney'),
  ('campbelltown',     'Campbelltown Stadium',               'Sydney'),
  ('pointsbet',        'PointsBet Stadium',                  'Sydney'),
  ('bluebet',          'BlueBet Stadium',                    'Penrith'),
  ('industree_group',  'Industree Group Stadium',            'Gosford'),
  ('mcdonald_jones',   'McDonald Jones Stadium',             'Newcastle'),
  ('win',              'WIN Stadium',                        'Wollongong'),
  ('gio',              'GIO Stadium',                        'Canberra'),
  ('aami_park',        'AAMI Park',                          'Melbourne'),
  ('mars',             'Mars Stadium',                       'Ballarat'),
  ('cbus_super',       'Cbus Super Stadium',                 'Gold Coast'),
  ('qcb_stadium',      'Queensland Country Bank Stadium',    'Townsville'),
  ('barlow_park',      'Barlow Park',                        'Cairns'),
  ('tio',              'TIO Stadium',                        'Darwin'),
  ('optus',            'Optus Stadium',                      'Perth'),
  ('allegiant',        'Allegiant Stadium',                  'Las Vegas');
