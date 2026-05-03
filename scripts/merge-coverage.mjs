import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();
const workspaces = ["apps/api", "apps/admin", "apps/tracker", "packages/shared"];

let totalLines = 0, coveredLines = 0, totalBranches = 0, coveredBranches = 0;
let totalFunctions = 0, coveredFunctions = 0, totalStatements = 0, coveredStatements = 0;
const perFile = {};

function normalizeFilePath(ws, filePath) {
  if (filePath === "total") return null;
  const wsSegment = "/" + ws + "/";
  const wsIndex = filePath.indexOf(wsSegment);
  if (wsIndex !== -1) {
    return join(ws, filePath.substring(wsIndex + wsSegment.length));
  }
  return join(ws, filePath);
}

for (const ws of workspaces) {
  const summaryPath = join(root, ws, "coverage", "coverage-summary.json");
  if (!existsSync(summaryPath)) continue;
  const data = JSON.parse(readFileSync(summaryPath, "utf8"));
  for (const [filePath, fileData] of Object.entries(data)) {
    if (filePath === "total") continue;
    const key = normalizeFilePath(ws, filePath);
    perFile[key] = fileData;
    totalLines += fileData.lines.total;
    coveredLines += fileData.lines.covered;
    totalBranches += fileData.branches.total;
    coveredBranches += fileData.branches.covered;
    totalFunctions += fileData.functions.total;
    coveredFunctions += fileData.functions.covered;
    totalStatements += fileData.statements.total;
    coveredStatements += fileData.statements.covered;
  }
}

const pct = (c, t) => t ? Number(((c / t) * 100).toFixed(2)) : 0;
const summary = {
  ...perFile,
  total: {
    lines: { total: totalLines, covered: coveredLines, pct: pct(coveredLines, totalLines) },
    statements: { total: totalStatements, covered: coveredStatements, pct: pct(coveredStatements, totalStatements) },
    functions: { total: totalFunctions, covered: coveredFunctions, pct: pct(coveredFunctions, totalFunctions) },
    branches: { total: totalBranches, covered: coveredBranches, pct: pct(coveredBranches, totalBranches) },
  },
};

const outDir = join(root, "coverage");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "coverage-summary.json"), JSON.stringify(summary, null, 2));
console.log("Coverage: " + summary.total.lines.pct + "% lines (" + coveredLines + "/" + totalLines + ")");
