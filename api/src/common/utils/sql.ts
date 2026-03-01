/**
 * Escape special characters for use in a PostgreSQL ILIKE/LIKE pattern.
 *
 * Characters `%`, `_`, and `\` have special meaning in LIKE expressions.
 * This function escapes them so user input is treated literally.
 *
 * @example
 *   const safe = escapeIlikeLiteral("50%_off\\deal");
 *   // → "50\\%\\_off\\\\deal"
 *   const pattern = `%${safe}%`;
 */
export function escapeIlikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
