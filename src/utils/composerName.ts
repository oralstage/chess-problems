/* YACPDB stores a composer as the sort key "Lastname, Firstname". That is an
   index form, not a display form: problem magazines print the name above the
   diagram as "Firstname Lastname" and join co-composers with "&" (The
   Problemist, September 2020 — "Arnoldo Ellerman & Eric Westbury"). Rendering
   the stored form beside the diagram also turns one composer into two once the
   comma sits between the halves, and a joint composition into four names.

   Display only. The database, the author index and /api/search all keep the
   stored order, so search results are unaffected. */

/** Generational suffixes travel with the given name ("Salai, Ladislav sr.") and belong after the family name. */
const NAME_SUFFIX = /\s+(sr|jr)\.?$/i;

/** "Bonavia Hunt, Noel Aubrey" → "Noel Aubrey Bonavia Hunt". Names without a comma are left alone. */
export function displayComposer(name: string): string {
  const comma = name.indexOf(',');
  if (comma === -1) return name.trim();
  const family = name.slice(0, comma).trim();
  let given = name.slice(comma + 1).trim();
  if (!family || !given) return name.trim();
  const suffix = given.match(NAME_SUFFIX);
  if (suffix) given = given.slice(0, suffix.index).trim();
  return [given, family, suffix ? suffix[0].trim() : ''].filter(Boolean).join(' ');
}

/** Joint compositions join with "&", so the separator never looks like the comma inside one name. */
export function composerLine(authors: string[] | undefined | null): string {
  return authors?.length ? authors.map(displayComposer).join(' & ') : '';
}
