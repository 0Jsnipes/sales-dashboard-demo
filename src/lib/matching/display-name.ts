/** Converts vendor-exported ALL CAPS names to readable title case without changing already-cased names. */
export function formatImportedName(value: unknown) {
  const name = String(value ?? "").trim();
  if (!name || name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
