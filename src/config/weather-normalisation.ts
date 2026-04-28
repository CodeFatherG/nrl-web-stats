/**
 * Weather normalisation config — maps raw nrl.com weather strings to canonical categories.
 * Feature: 029-venue-weather-analytics
 *
 * Raw strings are as they appear in `matches.weather` from the nrl.com match centre JSON.
 * Weather is only populated for completed matches.
 * Strings not present in this map are excluded from RPI calculations.
 *
 * Category ordering by precipitation severity: clear < cloudy < showers < rain < heavy_rain
 * Windy is orthogonal (can co-occur with any precipitation level).
 */

export type WeatherCategory = 'clear' | 'cloudy' | 'showers' | 'rain' | 'heavy_rain' | 'windy';

export const WEATHER_NORMALISATION: Record<string, WeatherCategory> = {
  // Clear / fine / sunny
  'Clear': 'clear',
  'Fine': 'clear',
  'Sunny': 'clear',
  'Mostly Sunny': 'clear',
  'Mostly Clear': 'clear',
  'Clear Skies': 'clear',

  // Cloudy / overcast
  'Partly Cloudy': 'cloudy',
  'Mostly Cloudy': 'cloudy',
  'Cloudy': 'cloudy',
  'Overcast': 'cloudy',

  // Showers (intermittent, lighter than rain)
  'Showers': 'showers',
  'Showers developing': 'showers',
  'Showers clearing': 'showers',
  'Shower or two': 'showers',
  'Isolated Showers': 'showers',

  // Rain (sustained)
  'Raining': 'rain',
  'Rain': 'rain',
  'Light Rain': 'rain',
  'Drizzle': 'rain',
  'Light Drizzle': 'rain',

  // Heavy rain / storms
  'Heavy Rain': 'heavy_rain',
  'Storm': 'heavy_rain',
  'Thunderstorm': 'heavy_rain',
  'Thunderstorms': 'heavy_rain',

  // Windy
  'Windy': 'windy',
  'Strong Wind': 'windy',
  'Breezy': 'windy',
  'Strong Winds': 'windy',
};

/** Canonical weather categories in severity order — used for query param validation. */
export const VALID_WEATHER_CATEGORIES: readonly WeatherCategory[] = [
  'clear',
  'cloudy',
  'showers',
  'rain',
  'heavy_rain',
  'windy',
];
