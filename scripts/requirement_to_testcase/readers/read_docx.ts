import { existsSync, statSync } from "node:fs";
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
  
  // 验证文件是否存在
  if (!existsSync(inputFile)) {
    throw new Error(`DOCX 文件不存在：${inputFile}`);
  }
  
  // 验证文件是否为普通文件
  const stats = statSync(inputFile);
  if (!stats.isFile()) {
    throw new Error(`路径不是普通文件：${inputFile}`);
  }
  
  // 验证文件大小不为空
  if (stats.size === 0) {
    throw new Error(`DOCX 文件为空：${inputFile}`);
  }
  
  // 读取 DOCX 文件内容
  let result;
  try {
    result = await mammoth.extractRawText({ path: inputFile });
  } catch (error) {
    throw new Error(`mammoth 读取 DOCX 失败：${error instanceof Error ? error.message : String(error)}`);
  }
  
  const rawText = normalizeDocxText(result.value);
  const messages = result.messages as Array<{ message: string }> || [];
  const warnings = messages.map((item) => item.message);
  
  // 如果提取的文本很少（少于 100 字符），添加详细告警
  if (!rawText || rawText.trim().length < 100) {
    return {
      sourceType: "file",
      sourceName: fileName,
      rawText: rawText || "",
      titleCandidate: path.parse(fileName).name,
      warnings: [
        ...warnings,
        `DOCX 文件已读取，但提取到的正文内容很少（仅${rawText?.length || 0}字符）。可能的原因：1) 文件是扫描件或图片格式 2) 文件已损坏 3) 内容在文本框或表格中无法提取 4) 内容在页眉页脚中`,
      ],
    };
  }

  return {
    sourceType: "file",
    sourceName: fileName,
    rawText,
    titleCandidate: extractTitleCandidate(rawText, path.parse(fileName).name),
    warnings: warnings,
  };
}
