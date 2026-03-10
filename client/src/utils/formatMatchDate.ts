/**
 * Format an ISO 8601 date string to a human-readable match date in AEST.
 * Example: "Sat 15 Mar, 7:30 PM"
 */
export function formatMatchDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const day = date.toLocaleDateString('en-AU', {
      weekday: 'short',
      timeZone: 'Australia/Sydney',
    });
    const dayMonth = date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Australia/Sydney',
    });
    const time = date.toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Australia/Sydney',
    });

    return `${day} ${dayMonth}, ${time}`;
  } catch {
    return isoString;
  }
}
