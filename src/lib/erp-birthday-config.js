/** Birthday celebration shown to everyone when they open ERP on this date. */
export const ERP_BIRTHDAY_CELEBRATION = {
  enabled: true,
  /** Local calendar date (month 1 to 12, day 1 to 31). */
  month: 7,
  day: 4,
  name: 'Muhammad Ali Shibli',
  headline: 'Happy Birthday',
  note: 'Wishing you joy, success, and an amazing year ahead: from everyone at Digitalis.',
};

/** @param {Date} [now] */
export function isErpBirthdayCelebrationActive(now = new Date()) {
  if (!ERP_BIRTHDAY_CELEBRATION.enabled) return false;
  return (
    now.getMonth() + 1 === ERP_BIRTHDAY_CELEBRATION.month &&
    now.getDate() === ERP_BIRTHDAY_CELEBRATION.day
  );
}

export function erpBirthdaySessionKey() {
  const { month, day } = ERP_BIRTHDAY_CELEBRATION;
  return `erp-birthday-${month}-${day}-celebrated`;
}
