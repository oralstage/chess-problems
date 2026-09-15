/* A problem named in the address, rather than looked up.

   Shared by the board that goes in someone else's page and by the full-size
   page: both are handed a problem the same way, and both have to read it the
   same way. Written down once, because the two drifting apart would mean the
   same address showing two different positions. */
import { Chess } from 'chess.js';
import { fixCastlingRights } from '../src/services/api';
import { pieceCountParts } from '../src/utils/pieceCount';
import type { ChessProblem } from '../src/types';

/* Which problem the host page asked for, if it asked for one at all. Pasted
   without parameters the board carries the site's daily problem, so a page
   that wants one board on it for good has a board that is worth coming back
   to. */
export function problemIdFromUrl(q: URLSearchParams): number | null {
  const raw = q.get('id');
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/* The position, what is asked of it, and the solution. Nothing here is in the
   database, so a page can put a problem of its own on a board -- an original,
   an award entry, anything YACPDB has never seen.

   The solution goes in as Popeye prints it. No conversion, no JSON, no list
   of moves: YACPDB stores Popeye's output, so the parser this site has always
   used was written against exactly that text. */
export class BadRequest extends Error {}

/** `#2` / `h#3` / `h#2.5` / `s#2` / `+` / `=` -- which board this is, how long,
 *  and whether the side that does not own the numbering opens. */
export function readStipulation(stip: string):
  { genre: ChessProblem['genre']; moveCount: number; half: boolean } | null {
  const s = stip.replace(/\s+/g, '');
  if (/^[+=]$/.test(s)) return { genre: 'study', moveCount: 0, half: false };
  const m = /^(h|s)?#(\d+)(\.5)?$/i.exec(s);
  if (!m) return null;
  const genre = m[1] ? (m[1].toLowerCase() === 'h' ? 'help' : 'self') : 'direct';
  /* A half move means the other side opens: an h#2.5 is White to play, and
     runs five half-moves rather than four. Only helpmates are asked for one
     here -- a selfmate or a direct mate with a half move is a different animal
     and the board has no reading for it. */
  if (m[3] && genre !== 'help') return null;
  return { genre, moveCount: Number(m[2]), half: !!m[3] };
}

/** Does the side that does not own the numbering open? True for an h#N.5. */
export function opensOffNumber(stipulation: string | undefined): boolean {
  return /\.5$/.test((stipulation || '').replace(/\s+/g, ''));
}

/** The placement alone is a position too -- Popeye users often have no more
 *  than that -- so the rest of the fields are filled in as White to move. */
export function completeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/).filter(Boolean);
  const tail = ['w', '-', '-', '0', '1'];
  return [...parts, ...tail.slice(Math.max(0, parts.length - 1))].join(' ');
}

export function problemFromParams(q: URLSearchParams): ChessProblem {
  const stip = (q.get('stip') || '').trim();
  const sol = q.get('sol') || '';
  if (!stip) throw new BadRequest('This board needs a stipulation — add &stip=%232 for #2.');
  const read = readStipulation(stip);
  if (!read) throw new BadRequest(`“${stip}” is not a stipulation this board can play.`);

  const fen = fixCastlingRights(completeFen(q.get('fen') || ''), sol);
  try { new Chess(fen); } catch { throw new BadRequest('That position could not be read.'); }

  const year = Number(q.get('year'));
  const { white, black } = pieceCountParts(fen);
  return {
    id: 0,
    fen,
    authors: (q.get('author') || '').split(';').map(a => a.trim()).filter(Boolean),
    sourceName: (q.get('source') || '').trim(),
    sourceYear: Number.isInteger(year) && year > 0 ? year : null,
    stipulation: stip,
    moveCount: read.moveCount,
    genre: read.genre,
    difficulty: '',
    difficultyScore: 0,
    pieceCount: white + black,
    solutionTree: [],
    fullSolutionTree: [],
    solutionText: sol,
    keywords: [],
    award: '',
  };
}

/* Said above the diagram until the solve is decided. A diagram is a picture to
   most of the people who meet one on somebody else's page, and a picture is
   not something you reach for -- so the board says that it can be played
   rather than waiting to be found out. Here rather than beside the board that
   prints it, because the page that builds a board draws a picture of one and
   has to letter it with the same words. */
export const INVITE = 'Solve by moving pieces on the board';
