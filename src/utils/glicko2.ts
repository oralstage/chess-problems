/**
 * Glicko-2 Rating System
 * Reference: Mark E. Glickman, "Example of the Glicko-2 system" (2013)
 *
 * Each solve is treated as a single-game rating period.
 * Player vs Problem: score 1.0 = perfect solve, 0.0 = fail.
 */

export interface Glicko2Rating {
  rating: number;
  rd: number;
  vol: number;
}

// System constant — controls volatility change speed (0.3–1.2 typical)
const TAU = 0.5;
const CONVERGENCE_TOLERANCE = 1e-6;
const SCALE = 173.7178; // 400 / ln(10)

/** Convert Glicko-2 rating to internal mu scale */
function toMu(rating: number): number {
  return (rating - 1500) / SCALE;
}

/** Convert Glicko-2 RD to internal phi scale */
function toPhi(rd: number): number {
  return rd / SCALE;
}

/** Convert internal mu back to rating */
function fromMu(mu: number): number {
  return mu * SCALE + 1500;
}

/** Convert internal phi back to RD */
function fromPhi(phi: number): number {
  return phi * SCALE;
}

/** g(phi) function */
function g(phi: number): number {
  return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
}

/** E(mu, mu_j, phi_j) — expected score */
function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Update a rating after a single game.
 *
 * @param player - Current rating of the entity being updated
 * @param opponent - Rating of the opponent { rating, rd }
 * @param score - Game result: 1.0 (win), 0.5 (draw), 0.0 (loss)
 * @returns Updated rating
 */
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

  // Step 3: Compute estimated variance v
  const v = 1 / (gPhiJ * gPhiJ * eVal * (1 - eVal));

  // Step 4: Compute delta
  const delta = v * gPhiJ * (score - eVal);

  // Step 5: Determine new volatility sigma' (Illinois algorithm)
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

  // Step 6: Update phi to new pre-rating period value
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);

  // Step 7: Update phi and mu
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gPhiJ * (score - eVal);

  return {
    rating: fromMu(newMu),
    rd: fromPhi(newPhi),
    vol: newSigma,
  };
}

/** Default starting rating */
export function defaultRating(): Glicko2Rating {
  return { rating: 800, rd: 350, vol: 0.06 };
}

/**
 * Map a problem to a Glicko-2 rating based on move count, piece count, and solution length.
 *
 * Formula: 600 + (moveCount - 2) * 300 + pieceCount * 50 + min(solutionLen/10, 50)
 * Each piece adds ~50 rating points. Each extra move adds ~300.
 *
 * Examples (#2): 3pc=750, 6pc=900, 10pc=1100, 14pc=1300
 * Examples (#3): 3pc=1050, 6pc=1200, 10pc=1400
 *
 * Also accepts difficultyScore as fallback (legacy).
 */
export function difficultyToRating(difficultyScore: number, moveCount?: number, pieceCount?: number): number {
  if (moveCount != null && pieceCount != null) {
    const solutionComponent = Math.min((difficultyScore - moveCount * 100 - pieceCount * 2) * 5, 50);
    const rating = 600 + (moveCount - 2) * 300 + pieceCount * 50 + Math.max(0, solutionComponent);
    return Math.max(600, Math.min(3200, rating));
  }
  // Fallback: estimate from difficultyScore alone
  return Math.max(600, Math.min(3200, 700 + (difficultyScore - 200) * 7));
}
