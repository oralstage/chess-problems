/**
 * The words a name is searched by — used by both sides of the author index.
 *
 * scripts/translit.ts stores a row's searchable words with these rules; the
 * search endpoint has to break a typed query with exactly the same ones, or
 * the reader's spelling never reaches the stored one. It used to lowercase
 * the query and nothing more, so pasting a name as it is printed —
 * "Visocka, Jūlija", "Winter-Wood" — carried punctuation into the term and
 * matched nothing, and spelling a name properly (Kovačević) found less than
 * misspelling it, because the index holds the folded form.
 */

export function hasCyrillic(s: string): boolean {
  return /[Ѐ-ӿԀ-ԯ]/.test(s);
}

/** Strip diacritics so "Vukčević" is also reachable as "vukcevic". */
export function asciiFold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd').replace(/ø/g, 'o').replace(/ß/g, 'ss');
}

/**
 * A name or a query broken into bare words at every non-letter: comma,
 * hyphen and apostrophe all end a word, on both sides of the index.
 */
export function nameWords(s: string): string[] {
  return s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 0);
}

/**
 * The single form of a typed word to look for in the alias columns.
 *
 * ASCII-folded, because that is the form the index always holds: a Latin name
 * is stored folded as well as as printed, and every romanisation generated
 * from a Cyrillic one is ASCII already. Folding also settles how the reader's
 * keyboard composed the accent — "Jūlija" typed as u + combining macron finds
 * nothing against a stored precomposed ū, but both fold to "julija".
 *
 * A Cyrillic term keeps its own letters: folding leaves them as they are, so
 * there is nothing to fold it to, and the printed name is stored verbatim.
 */
export function searchKey(word: string): string {
  const w = word.normalize('NFC').toLowerCase();
  if (hasCyrillic(w)) return w;
  return asciiFold(w).replace(/[^a-z0-9]/g, '') || w;
}
