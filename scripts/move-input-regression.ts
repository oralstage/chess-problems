import { getPromotionForMove } from '../src/services/moveInput';

interface Case {
  name: string;
  fen: string;
  source: string;
  target: string;
  selectedPiece: string;
  expected: string | undefined;
}

const cases: Case[] = [
  {
    name: 'rook moving to eighth rank stays a normal move',
    fen: '7k/8/8/8/8/8/R7/K7 w - - 0 1',
    source: 'a2',
    target: 'a8',
    selectedPiece: 'wR',
    expected: undefined,
  },
  {
    name: 'queen moving to eighth rank stays a normal move',
    fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1',
    source: 'd1',
    target: 'd8',
    selectedPiece: 'wQ',
    expected: undefined,
  },
  {
    name: 'white pawn promotes to queen',
    fen: '7k/P7/8/8/8/8/8/K7 w - - 0 1',
    source: 'a7',
    target: 'a8',
    selectedPiece: 'wQ',
    expected: 'q',
  },
  {
    name: 'white pawn underpromotes to knight',
    fen: '7k/P7/8/8/8/8/8/K7 w - - 0 1',
    source: 'a7',
    target: 'a8',
    selectedPiece: 'wN',
    expected: 'n',
  },
  {
    name: 'black pawn promotes on first rank',
    fen: '7k/8/8/8/8/8/p7/K7 b - - 0 1',
    source: 'a2',
    target: 'a1',
    selectedPiece: 'bR',
    expected: 'r',
  },
  {
    name: 'pawn away from promotion rank has no promotion data',
    fen: '7k/8/P7/8/8/8/8/K7 w - - 0 1',
    source: 'a6',
    target: 'a7',
    selectedPiece: 'wP',
    expected: undefined,
  },
];

let failures = 0;
for (const test of cases) {
  const actual = getPromotionForMove(
    test.fen,
    test.source,
    test.target,
    test.selectedPiece,
  );
  if (actual !== test.expected) {
    console.error(`FAIL: ${test.name}: expected ${String(test.expected)}, got ${String(actual)}`);
    failures++;
  }
}

if (failures > 0) process.exit(1);
console.log(`Move input: ${cases.length}/${cases.length} passed`);
