/**
 * Cyrillic → Latin name forms for the author search index.
 *
 * YACPDB stores a composer's name in whatever script the source used, so
 * Russian, Ukrainian, Belarusian, Bulgarian, Serbian and Macedonian composers
 * sit in author_search in Cyrillic (3,194 of 20,870 rows — but 28% of all
 * problems, and half of the 1000-problem composers). A Latin-alphabet query
 * could never reach them.
 *
 * There is no single romanisation: ISO 9, BGN/PCGN, ALA-LC, the German
 * tradition (Schukowski, Saizew, Tschernjawski) and each country's own Latin
 * orthography all differ, and a reader will type whichever one the magazine
 * they saw used. So rather than pick one, generate the plausible readings of
 * every letter and store them all as extra search text. Wrong spellings cost
 * nothing: nobody searches for them.
 *
 * The generated forms are matched with the same substring LIKE the endpoint
 * already uses, so a prefix of any generated form ("tkach", "tschern") hits.
 */

/**
 * Per-letter readings, commonest first. Accented forms (ž, š, č) are kept
 * because asciiFold() turns them into the bare Serbian/Croatian spellings
 * (ž → z) that the digraphic countries actually print.
 */
const LETTERS: Record<string, string[]> = {
  // Russian and shared
  а: ['a'], б: ['b'], в: ['v', 'w'], г: ['g', 'h'], д: ['d'],
  е: ['e', 'ye', 'je', 'ie'], ё: ['e', 'yo', 'jo', 'io'],
  ж: ['zh', 'j', 'ž', 'sch'], з: ['z', 's'], и: ['i', 'y'],
  й: ['i', 'y', 'j', ''], к: ['k', 'c'], л: ['l'], м: ['m'], н: ['n'],
  о: ['o'], п: ['p'], р: ['r'], с: ['s'], т: ['t'], у: ['u', 'ou'],
  ф: ['f'], х: ['kh', 'h', 'ch'], ц: ['ts', 'c', 'z', 'tz'],
  ч: ['ch', 'č', 'tsch', 'tch'], ш: ['sh', 'š', 'sch'],
  щ: ['shch', 'sch', 'šč', 'stsch'], ъ: [''], ы: ['y', 'i'],
  ь: ['', "'"], э: ['e'], ю: ['yu', 'iu', 'ju', 'u'], я: ['ya', 'ia', 'ja', 'a'],
  // Ukrainian
  і: ['i', 'y'], ї: ['yi', 'i', 'ji'], є: ['ye', 'ie', 'je', 'e'], ґ: ['g'],
  // Belarusian
  ў: ['w', 'u', 'v'],
  // Serbian and Macedonian
  ј: ['j', 'i', 'y'], љ: ['lj', 'l'], њ: ['nj', 'n'], ћ: ['ć', 'c', 'tj'],
  ђ: ['đ', 'dj', 'd'], џ: ['dž', 'dz', 'dj'], ќ: ['ć', 'k', 'kj'],
  ѓ: ['đ', 'g', 'gj'], ѕ: ['dz', 'z'],
  // Rare diacritics
  ѐ: ['e'], ѝ: ['i'],
};

/** Whole-ending readings that no per-letter rule produces (-ov → -off). */
const ENDINGS: [RegExp, string[]][] = [
  [/ський$/, ['sky', 'ski', 'skyi', 'skiy', 'skij', 'skii']],
  [/ский$/, ['sky', 'ski', 'skii', 'skij', 'skiy']],
  [/цький$/, ['tsky', 'tski', 'cki', 'zki', 'tskyi']],
  [/цкий$/, ['tsky', 'tski', 'cki', 'zki', 'tzki']],
  [/ов$/, ['ov', 'off', 'ow', 'ow']],
  [/ёв$/, ['ev', 'yov', 'ow', 'eff']],
  [/ев$/, ['ev', 'ew', 'eff', 'yev', 'iev']],
  [/ий$/, ['y', 'iy', 'ii', 'ij', 'i']],
  [/ій$/, ['y', 'iy', 'ii', 'ij', 'i']],
];

/**
 * One consistent choice per letter for each romanisation actually in use.
 * Generating these as whole words guarantees every convention survives, which
 * a capped cross product does not: truncation eats the later variants of the
 * early letters, and the German tradition (Tschernjawski, Saizew) uses the
 * third or fourth reading of several letters at once.
 */
const PROFILES: Record<string, string>[] = [
  // BGN/PCGN — the usual English-language spelling
  { в: 'v', г: 'g', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ы: 'y', ю: 'yu', я: 'ya' },
  // German tradition (Die Schwalbe and older continental sources)
  { в: 'w', г: 'g', е: 'e', ё: 'jo', ж: 'sch', з: 's', и: 'i', й: 'i', х: 'ch', ц: 'z', ч: 'tsch', ш: 'sch', щ: 'stsch', ы: 'y', ю: 'ju', я: 'ja' },
  // ISO 9 / scientific transliteration
  { в: 'v', г: 'g', е: 'e', ё: 'e', ж: 'ž', з: 'z', и: 'i', й: 'j', х: 'h', ц: 'c', ч: 'č', ш: 'š', щ: 'šč', ы: 'y', ю: 'ju', я: 'ja' },
  // ALA-LC (US libraries)
  { в: 'v', г: 'g', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ы: 'y', ю: 'iu', я: 'ia' },
  // Ukrainian national romanisation
  { в: 'v', г: 'h', е: 'e', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'yi', є: 'ye', й: 'i', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ю: 'yu', я: 'ya' },
  // Serbian / Macedonian Latin (both scripts are official there)
  { в: 'v', г: 'g', ж: 'ž', з: 'z', и: 'i', ј: 'j', љ: 'lj', њ: 'nj', ћ: 'ć', ђ: 'đ', џ: 'dž', ќ: 'ć', ѓ: 'đ', х: 'h', ц: 'c', ч: 'č', ш: 'š' },
  // Serbian / Macedonian written without diacritics (the common ASCII form)
  { в: 'v', г: 'g', ж: 'z', з: 'z', и: 'i', ј: 'j', љ: 'lj', њ: 'nj', ћ: 'c', ђ: 'dj', џ: 'dz', ќ: 'kj', ѓ: 'gj', х: 'h', ц: 'c', ч: 'c', ш: 's' },
  // Belarusian
  { в: 'v', г: 'h', е: 'e', ж: 'zh', з: 'z', и: 'i', і: 'i', й: 'i', ў: 'v', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', ы: 'y', ю: 'yu', я: 'ya' },
  // French tradition
  { в: 'v', г: 'g', е: 'e', ж: 'j', з: 'z', и: 'i', й: 'i', у: 'ou', х: 'kh', ц: 'ts', ч: 'tch', ш: 'ch', щ: 'chtch', ю: 'iou', я: 'ia' },
];

/** Cross product over the two commonest readings, for mixed spellings. */
const CROSS_VARIANTS = 2;
const MAX_CROSS = 64;

/** Letters after which е ё ю я are read with their leading y/j. */
const GLIDE_AFTER = new Set(['ь', 'ъ', 'а', 'е', 'ё', 'и', 'і', 'о', 'у', 'ы', 'э', 'ю', 'я', 'ї', 'є']);
const GLIDE: Record<string, string[]> = {
  е: ['ye', 'je', 'ie'], ё: ['yo', 'jo', 'io'], ю: ['yu', 'ju', 'iu'], я: ['ya', 'ja', 'ia'],
};

function profileForms(word: string): string[] {
  const forms: string[] = [];
  for (const prof of PROFILES) {
    // Two readings per profile: one flat, one applying the glide rule, since
    // sources differ on whether they mark it.
    for (const glide of [false, true]) {
      let out = '';
      const chars = [...word];
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const prev = i === 0 ? null : chars[i - 1];
        if (glide && GLIDE[ch] && (prev === null || GLIDE_AFTER.has(prev))) {
          const want = GLIDE[ch].find(g => (prof[ch] ?? '').startsWith(g[0])) ?? GLIDE[ch][0];
          out += want;
          continue;
        }
        out += prof[ch] ?? LETTERS[ch]?.[0] ?? ch;
      }
      forms.push(out);
    }
  }
  return forms;
}

function crossForms(word: string): string[] {
  let forms = [''];
  for (const ch of word) {
    const opts = (LETTERS[ch] ?? [ch]).slice(0, CROSS_VARIANTS);
    const next: string[] = [];
    for (const prefix of forms) for (const o of opts) next.push(prefix + o);
    forms = [...new Set(next)];
    if (forms.length > MAX_CROSS) forms = forms.slice(0, MAX_CROSS);
  }
  return forms;
}

function readingsOf(word: string): string[] {
  return [...new Set([...profileForms(word), ...crossForms(word)])];
}

export function hasCyrillic(s: string): boolean {
  return /[\u0400-\u04FF\u0500-\u052F]/.test(s);
}

/** Strip diacritics so "Vukčević" is also reachable as "vukcevic". */
export function asciiFold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').replace(/ø/g, 'o').replace(/ß/g, 'ss');
}

/** Every plausible Latin reading of one Cyrillic word. */
export function latinFormsOfWord(word: string): string[] {
  const w = word.toLowerCase();
  if (!hasCyrillic(w)) return [];
  const out = new Set<string>(readingsOf(w));
  for (const [re, tails] of ENDINGS) {
    if (!re.test(w)) continue;
    const stem = w.replace(re, '');
    for (const s of readingsOf(stem)) for (const t of tails) out.add(s + t);
  }
  const cleaned = new Set<string>();
  for (const f of out) {
    const a = asciiFold(f).replace(/[^a-z]/g, '');
    if (a.length > 0) cleaned.add(a);
  }
  return [...cleaned];
}

/**
 * The extra search text stored alongside name_lower for one author row: the
 * ASCII-folded name plus every Latin reading of each Cyrillic word. Forms are
 * separated by spaces, and a search term never contains a space, so a term
 * can never match across the join between two forms.
 */
export function searchAliases(name: string): string {
  const lower = name.toLowerCase();
  const out = new Set<string>();
  const folded = asciiFold(lower).replace(/[^a-z0-9 ]/g, ' ').trim();
  for (const w of folded.split(/\s+/)) if (w) out.add(w);
  if (hasCyrillic(lower)) {
    for (const w of lower.split(/[^\p{L}']+/u)) {
      if (!w) continue;
      for (const f of latinFormsOfWord(w)) out.add(f);
    }
  }
  return [...out].join(' ');
}

/**
 * The words a search term may start inside, split by name part.
 *
 * Every searchable word lives here — the printed name's own words as well as
 * the generated readings — because matching is anchored to a word start, and
 * anchoring inside a stored name would otherwise need SQL to know that comma,
 * hyphen and apostrophe end a word. Both the raw word and its ASCII-folded
 * form are kept, so "Živković" and "Zivkovic" both work.
 *
 * Surname and the rest are separate: a surname hit outranks a patronymic one.
 * "Bron" reaches both Брон, Владимир Акимович with 589 problems and the
 * patronymic in Згерский, Геннадий Брониславович, and without the distinction
 * the second one's newer problems fill the whole page.
 */
export function extraSearchParts(name: string): { surname: string; other: string } {
  const comma = name.indexOf(',');
  const surname = comma === -1 ? name : name.slice(0, comma);
  const rest = comma === -1 ? '' : name.slice(comma + 1);
  const words = (part: string, taken: Set<string>) => {
    const out: string[] = [];
    const add = (w: string) => {
      if (w && !taken.has(w)) { taken.add(w); out.push(w); }
    };
    for (const w of part.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (!w) continue;
      add(w);
      add(asciiFold(w).replace(/[^a-z0-9]/g, ''));
      for (const f of latinFormsOfWord(w)) add(f);
    }
    return out.join(' ');
  };
  const taken = new Set<string>();
  const sur = words(surname, taken);
  return { surname: sur, other: words(rest, taken) };
}
