const { parseSolution } = require("../src/services/solutionParser.ts");
const { Chess } = require("chess.js");

function check(name, path) {
  const data = require(path);
  let ok = 0, fail = 0;
  const fmc = name === "help" ? "b" : "w";
  for (const p of data) {
    const tree = parseSolution(p.solutionText, fmc);
    if (tree.length === 0) { fail++; continue; }
    const keyNode = tree[0];
    let chess;
    try { chess = new Chess(p.fen); } catch { fail++; continue; }
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
    if (move) ok++; else fail++;
  }
  console.log(name + ":", ok + "/" + data.length, "(" + Math.round(ok/data.length*100) + "%)");
}

check("starter", "../src/data/problems-starter.json");
check("direct", "../src/data/problems-direct.json");
check("help", "../src/data/problems-help.json");
check("self", "../src/data/problems-self.json");
check("study", "../src/data/problems-study.json");
