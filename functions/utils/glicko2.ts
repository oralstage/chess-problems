/**
 * Glicko-2 Rating System (server-side copy)
 * Kept in sync with src/utils/glicko2.ts
 */

export interface Glicko2Rating {
  rating: number;
  rd: number;
  vol: number;
}

const TAU = 0.5;
const CONVERGENCE_TOLERANCE = 1e-6;
const SCALE = 173.7178;

function toMu(rating: number): number {
  return (rating - 1500) / SCALE;
}

function toPhi(rd: number): number {
  return rd / SCALE;
}

function fromMu(mu: number): number {
  return mu * SCALE + 1500;
}

function fromPhi(phi: number): number {
  return phi * SCALE;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
}

function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

export function updateRating(
  player: Glicko2Rating,
  opponent: { rating: number; rd: number },
  score: number
): Glicko2Rating {
  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);
  const sigma = player.vol;

  const muJ = toMu(opponent.rating);
  const phiJ = toPhi(opponent.rd);

  const gPhiJ = g(phiJ);
  const eVal = E(mu, muJ, phiJ);

  const v = 1 / (gPhiJ * gPhiJ * eVal * (1 - eVal));
  const delta = v * gPhiJ * (score - eVal);

  const a = Math.log(sigma * sigma);
  const tau2 = TAU * TAU;

  function f(x: number): number {
    const ex = Math.exp(x);
    const phi2 = phi * phi;
    const num1 = ex * (delta * delta - phi2 - v - ex);
    const den1 = 2 * (phi2 + v + ex) * (phi2 + v + ex);
    return num1 / den1 - (x - a) / tau2;
  }

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);

  while (Math.abs(B - A) > CONVERGENCE_TOLERANCE) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  const newSigma = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gPhiJ * (score - eVal);

  return {
    rating: fromMu(newMu),
    rd: fromPhi(newPhi),
    vol: newSigma,
  };
}

export function defaultRating(): Glicko2Rating {
  return { rating: 800, rd: 350, vol: 0.06 };
}

/**
 * Spread apart problems that share a move and piece count.
 *
 * difficultyScore carries a solution-length term of its own, but it is capped at
 * +50, which is far too narrow: inside a single (moveCount, pieceCount) bucket
 * real solutions run from ~10 to ~2000 characters — a branchy problem and a
 * one-liner currently land on the exact same rating. A log scale turns that 200x
 * range into about half a move-step of rating: enough to break the tie, not
 * enough to overturn the move/piece ordering.
 */
function solutionSpread(solutionLength: number | undefined, perDoubling: number, lo: number, hi: number): number {
  if (!solutionLength || solutionLength <= 0) return 0;
  return Math.max(lo, Math.min(hi, perDoubling * Math.log2(solutionLength / 200)));
}

export function difficultyToRating(difficultyScore: number, moveCount?: number, pieceCount?: number, genre?: string, solutionLength?: number): number {
  if (moveCount != null && pieceCount != null) {
    // difficultyScore is built in scripts/fetch-problems.ts as
    //   genreBase + moveCount*100 + pieceCount*2 + min(solutionLen/10, 50)
    // so the genre offset has to come off too, or the leftover is >= 500 for
    // help and >= 1000 for self and the term below pins to its +50 cap.
    const genreBase = genre === 'help' ? 500 : genre === 'self' ? 1000 : 0;
    const solutionComponent = Math.min((difficultyScore - genreBase - moveCount * 100 - pieceCount * 2) * 5, 50);
    // Same weights for every genre: move count and material carry the difficulty,
    // the solution term only breaks ties between problems that match on both.
    // Genre averages are left where they fall (self runs high because selfmates in
    // this collection are simply longer) — the pools are rated separately, so there
    // is nothing to normalise against.
    const rating = 600 + (moveCount - 2) * 300 + pieceCount * 50
      + Math.max(0, solutionComponent) + solutionSpread(solutionLength, 8, -25, 25);
    // No lower clamp: a floor of 600 collapsed every light #1 onto one value
    // (3 pieces computed 505 and 4 pieces 555, and both came out 600).
    return Math.min(3200, rating);
  }
  return Math.max(600, Math.min(3200, 700 + (difficultyScore - 200) * 7));
}
