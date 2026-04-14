import path from "node:path";
import mammoth from "mammoth";
import type { RequirementSource } from "../types";

function normalizeDocxText(rawText: string): string {
  return rawText
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractTitleCandidate(content: string, fallbackName: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    || fallbackName;
}

export async function readDocx(inputFile: string): Promise<RequirementSource> {
  const fileName = path.basename(inputFile);
  const result = await mammoth.extractRawText({ path: inputFile });
  const rawText = normalizeDocxText(result.value);
  const warnings = result.messages.map((item) => item.message);

  return {
    sourceType: "file",
    sourceName: fileName,
    rawText,
    titleCandidate: extractTitleCandidate(rawText, path.parse(fileName).name),
    warnings: rawText ? warnings : [...warnings, "DOCX 已读取，但未提取到正文内容。"],
  };
}
