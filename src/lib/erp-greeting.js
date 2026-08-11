/**
 * Time-of-day greeting for ERP dashboard (local device time).
 * morning 5:00 to 11:59 · afternoon 12:00 to 16:59 · evening 17:00 to 20:59 · night 21:00 to 4:59
 */
export function erpGreetingForDate(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Good night';
}
