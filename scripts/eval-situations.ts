import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { evaluate } from "../lib/situations/evaluate";

const { report, pipeline } = evaluate();
const dir = path.join(process.cwd(), "out");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "eval_report.json"), JSON.stringify(report, null, 2));
writeFileSync(path.join(dir, "pipeline.json"), JSON.stringify(pipeline));

const top = report.candidates[0];
const home = report.candidates.find((candidate) => candidate.id === "first_home");
const suppressed = new Set(report.suppressed.map((cohort) => cohort.id));
const problems: string[] = [];
if (top?.id !== "self_employment" || top.tag !== "no_existing_rule") {
  problems.push("top situation is not the uncovered self-employment cohort");
}
if (!home || home.tag !== "existing_rule") {
  problems.push("first-home cohort was not tagged as an existing rule");
}
for (const id of ["separation", "distress", "care"]) {
  if (!suppressed.has(id)) problems.push(`missing suppressed cohort ${id}`);
}
if (!report.suppressed.find((cohort) => cohort.id === "care" && cohort.protectionOnly)) {
  problems.push("care cohort is missing the protection-only gate");
}
if (report.recovered < 1 || report.medianLeadTimeDays <= 0) {
  problems.push("lead time or recovery count is empty");
}
if (problems.length) {
  console.error(problems.join("\n"));
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(
  `${report.recovered} of ${report.plantedPatterns} patterns recovered, ${report.candidateSituations} candidates, ${report.suppressedCohorts} suppressed, median lead ${report.medianLeadTimeDays} days`,
);
