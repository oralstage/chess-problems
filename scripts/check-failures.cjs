const { parseSolution } = require("../src/services/solutionParser.ts");
const { Chess } = require("chess.js");

function checkFile(name, path) {
  const data = require(path);
  const fmc = name === "help" ? "b" : "w";
  const failures = [];
  for (const p of data) {
    const tree = parseSolution(p.solutionText, fmc);
    if (tree.length === 0) {
      failures.push({ id: p.id, reason: "empty_tree", sol: p.solutionText.slice(0, 80) });
      continue;
    }
    const keyNode = tree[0];
    let chess;
    try { chess = new Chess(p.fen); } catch { failures.push({ id: p.id, reason: "bad_fen" }); continue; }
    const uci = keyNode.moveUci;
    let move = null;
    if (!uci.startsWith("san:") && uci.length >= 4) {
      try { move = chess.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci.length > 4 ? uci[4] : undefined }); } catch {}
    }
    if (!move) {
      const san = uci.startsWith("san:") ? uci.slice(4) : keyNode.moveSan;
      try { move = chess.move(san); } catch {}
      if (!move) try { move = chess.move(san.replace(/[+#]/g, "")); } catch {}
    }
    if (!move) {
      // Try destination matching
      const destMatch = keyNode.move.match(/([a-h][1-8])(?:=[QRBN])?[+#!?]*$/i);
      if (destMatch) {
        const legal = chess.moves({ verbose: true });
        const cands = legal.filter(m => m.to === destMatch[1]);
        if (cands.length === 1) {
          try { move = chess.move(cands[0]); } catch {}
        }
      }
    }
    if (!move) {
      failures.push({
        id: p.id,
        reason: "move_fail",
        uci: keyNode.moveUci,
        san: keyNode.moveSan,
        move: keyNode.move,
        sol: p.solutionText.slice(0, 100),
      });
    }
  }
  console.log(`\n=== ${name} (${failures.length}/${data.length} failures) ===`);

  // Categorize
  const categories = {};
  for (const f of failures) {
    const cat = f.reason === "empty_tree" ? "empty_tree" :
                f.reason === "bad_fen" ? "bad_fen" :
                (f.san || "").includes("O-O") ? "castling" :
                (f.sol || "").includes("retro") ? "retro" :
                "parse_fail";
    categories[cat] = (categories[cat] || 0) + 1;
  }
  console.log("Categories:", categories);

  // Show first 10 parse_fail details
  const parseFails = failures.filter(f => f.reason === "move_fail" && !(f.san || "").includes("O-O"));
  console.log(`\nFirst 10 parse failures:`);
  for (const f of parseFails.slice(0, 10)) {
    console.log(`  #${f.id}: uci=${f.uci} san=${f.san} move="${f.move}" sol="${f.sol}"`);
  }
}

checkFile("direct", "../src/data/problems-direct.json");
checkFile("help", "../src/data/problems-help.json");
checkFile("self", "../src/data/problems-self.json");
checkFile("study", "../src/data/problems-study.json");
