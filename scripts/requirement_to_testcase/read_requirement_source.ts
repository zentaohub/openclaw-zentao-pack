import { existsSync } from "node:fs";
import path from "node:path";
import { readDocx } from "./readers/read_docx";
import { readOnlineDoc } from "./readers/read_online_doc";
import { readTextFile } from "./readers/read_text_file";
import type { RequirementSource, RunRequirementOptions } from "./types";

const TEXT_FILE_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json", ".yaml", ".yml", ".csv", ".html", ".htm"]);

function cleanInlineText(text: string): string {
  return text
    .replace(/\^/g, " ")
    .replace(/\\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

export async function readRequirementSource(options: RunRequirementOptions): Promise<RequirementSource | null> {
  if (options.payloadFile) {
    return null;
  }

  if (options.inputText) {
    const cleanedText = cleanInlineText(options.inputText);
    return {
      sourceType: "text",
      sourceName: "inline-text",
      rawText: cleanedText,
      titleCandidate: cleanedText.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "临时需求说明",
      warnings: [],
    };
  }

  if (options.inputUrl) {
    return readOnlineDoc({ url: options.inputUrl });
  }

  if (options.inputFile) {
    // 验证文件是否存在
    if (!existsSync(options.inputFile)) {
      throw new Error(`输入文件不存在：${options.inputFile}`);
    }
    
    const ext = path.extname(options.inputFile).toLowerCase();
    if (ext === ".docx") {
      return readDocx(options.inputFile);
    }
    if (TEXT_FILE_EXTENSIONS.has(ext)) {
      return readTextFile(options.inputFile);
    }
    return {
      sourceType: "file",
      sourceName: path.basename(options.inputFile),
      rawText: `已收到需求附件：${path.basename(options.inputFile)}。当前文件类型 ${ext || "unknown"} 尚未实现正文抽取。`,
      titleCandidate: path.parse(options.inputFile).name,
      warnings: [`暂未支持直接解析 ${ext || "unknown"} 文件内容。`],
    };
  }

  return null;
}
