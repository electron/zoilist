/**
 * If the current date on runtime matches Electron's quiet period
 */
export function isQuietPeriod() {
  return new Date().getMonth() === 11;
}
