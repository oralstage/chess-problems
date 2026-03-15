const { parseSolution } = require("../src/services/solutionParser.ts");
const { Chess } = require("chess.js");
const direct = require("../src/data/problems-direct.json");
const starter = require("../src/data/problems-starter.json");
const all = [...starter, ...direct];

function tryExecuteKey(fen, keyNode) {
  const chess = new Chess(fen);
  const uci = keyNode.moveUci;
  if (!uci.startsWith("san:") && uci.length >= 4) {
    try { const m = chess.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci.length > 4 ? uci[4] : undefined }); if (m) return m; } catch {}
  }
  const san = uci.startsWith("san:") ? uci.slice(4) : keyNode.moveSan;
  try { const m = chess.move(san); if (m) return m; } catch {}
  try { const m = chess.move(san.replace(/[+#]/g, "")); if (m) return m; } catch {}
  const destMatch = keyNode.moveSan.match(/([a-h][1-8])/);
  if (destMatch) {
    const legal = chess.moves({ verbose: true });
    const cands = legal.filter(m => m.to === destMatch[1]);
    if (cands.length === 1) { try { const m = chess.move(cands[0]); if (m) return m; } catch {} }
  }
  return null;
}

let tryIssues=0, castleIssues=0, bracketIssues=0, sanIssues=0, emptyTree=0, ok=0;
for (const p of all) {
  const tree = parseSolution(p.solutionText, p.genre === "help" ? "b" : "w");
  if (tree.length === 0) { emptyTree++; continue; }
  const keyNode = tree[0];
  const move = tryExecuteKey(p.fen, keyNode);
  if (move) { ok++; continue; }
  const sol = p.solutionText || "";
  if (keyNode.moveSan.includes("O-O") || keyNode.moveSan.includes("0-0")) castleIssues++;
  else if (sol.includes("?") && sol.includes("!")) tryIssues++;
  else if (sol.includes("[")) bracketIssues++;
  else sanIssues++;
}
console.log("Total:", all.length, "OK:", ok, "Empty:", emptyTree, "Try:", tryIssues, "Castle:", castleIssues, "Bracket:", bracketIssues, "SAN:", sanIssues);
