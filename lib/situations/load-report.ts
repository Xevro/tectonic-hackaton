import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { EvalReport, PipelineSample } from "@/lib/situations/evaluate";

const candidateSchema = z.object({
  id: z.string(),
  rank: z.number().int(),
  title: z.string(),
  tag: z.enum(["existing_rule", "no_existing_rule"]),
  cohortSize: z.number().int(),
  medianLeadTimeDays: z.number().int().nullable(),
});

const reportSchema = z.object({
  households: z.number().int().positive(),
  plantedPatterns: z.number().int().positive(),
  recovered: z.number().int().nonnegative(),
  medianLeadTimeDays: z.number().int().nonnegative(),
  candidateSituations: z.number().int().nonnegative(),
  suppressedCohorts: z.number().int().nonnegative(),
  candidates: z.array(candidateSchema),
  suppressed: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      cohortSize: z.number().int(),
      protectionOnly: z.boolean(),
    }),
  ),
});

const pipelineSchema = z.object({
  households: z.number().int().positive(),
  dots: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      bent: z.boolean(),
      cluster: z.number().int().nullable(),
    }),
  ),
});

function readJson(name: string) {
  const file = path.join(process.cwd(), "out", name);
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

export function loadEvalReport(): EvalReport | null {
  try {
    return reportSchema.parse(readJson("eval_report.json"));
  } catch {
    return null;
  }
}

export function loadPipeline(): PipelineSample | null {
  try {
    return pipelineSchema.parse(readJson("pipeline.json"));
  } catch {
    return null;
  }
}
