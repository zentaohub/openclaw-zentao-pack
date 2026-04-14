import { readFileSync } from "node:fs";
import path from "node:path";
import type { RequirementSource } from "../types";

function normalizeText(rawText: string): string {
  return rawText.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
}

export function readTextFile(inputFile: string): RequirementSource {
  const fileName = path.basename(inputFile);
  const rawText = normalizeText(readFileSync(inputFile, "utf8"));
  const titleCandidate = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    || path.parse(fileName).name;

  return {
    sourceType: "file",
    sourceName: fileName,
    rawText,
    titleCandidate,
    warnings: [],
  };
}
