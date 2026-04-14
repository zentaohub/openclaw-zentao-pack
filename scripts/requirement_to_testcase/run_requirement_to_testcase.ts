import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPayloadFromSource } from "./build_testcases_payload";
import { exportTestcasesToExcel } from "./export_testcases_to_excel";
import { exportTestcasesToXmind } from "./export_testcases_to_xmind";
import { generatePayloadWithLlm } from "./llm_requirement_generator";
import { parseRunOptions } from "./parse_requirement_input";
import { readRequirementSource } from "./read_requirement_source";
import type { ExportResult, RequirementSource, TestcasePayload } from "./types";

function fail(stage: string, reason: string): never {
  process.stdout.write(`EXPORT_FAILED\nStage=${stage}\nReason=${reason}\n`);
  process.exit(1);
}

function getTmpRoot(): string {
  return path.resolve(__dirname, "../../../tmp/testcase-jobs");
}

function materializePayload(payload: TestcasePayload): string {
  const tempDir = getTmpRoot();
  mkdirSync(tempDir, { recursive: true });
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payloadPath = path.join(tempDir, `generated_payload_${uniqueSuffix}.json`);
  writeFileSync(payloadPath, JSON.stringify(payload, null, 2), "utf8");
  return payloadPath;
}

function buildCallbackReply(results: ExportResult[], sourceType: string): string {
  const lines = [
    "已完成需求转测试用例导出。",
    `需求名称：${results[0]?.requirementName ?? "未命名需求"}`,
    `用例数量：${results[0]?.caseCount ?? 0}`,
    `导出格式：${results.map((item) => item.format).join(" + ")}`,
    "导出文件：",
    ...results.map((item) => `- ${item.outputFile}`),
  ];
  for (const item of results) {
    lines.push(`MEDIA: ${item.outputFile}`);
  }
  if (sourceType === "agent") {
    lines.push("文件将按企业微信自建应用媒体链路回传。");
  }
  return lines.join("\n");
}

function buildCallbackParseSummary(source: RequirementSource | null): Record<string, unknown> | undefined {
  if (!source) {
    return undefined;
  }
  return {
    source_type: source.sourceType,
    source_name: source.sourceName,
    warnings: source.warnings,
  };
}

function printSuccess(results: ExportResult[]): void {
  if (results.length === 0) {
    fail("dispatch_export", "No export results generated");
  }
  const requirementName = results[0]?.requirementName ?? "未命名需求";
  const caseCount = results[0]?.caseCount ?? 0;
  const outputFiles = results.map((item) => item.outputFile);
  process.stdout.write(`EXPORT_SUCCESS\nRequirementName=${requirementName}\nCaseCount=${caseCount}\nOutputFiles=${outputFiles.join(";")}\n`);
  for (const file of outputFiles) {
    process.stdout.write(`MEDIA: ${file}\n`);
  }
}

async function main(): Promise<void> {
  const options = await parseRunOptions();
  let payloadFile = options.payloadFile;
  let source: RequirementSource | null = null;

  if (!payloadFile) {
    source = await readRequirementSource(options);
    const payload = source
      ? (await generatePayloadWithLlm(source, options.outputDir)) ?? buildPayloadFromSource(source, options.outputDir)
      : buildPayloadFromSource({
        sourceType: "text",
        sourceName: "inline-text",
        rawText: options.inputText ?? "",
        titleCandidate: "临时需求说明",
        warnings: [],
      }, options.outputDir);
    payloadFile = materializePayload(payload);
  }

  const results: ExportResult[] = [];
  if (options.format === "excel" || options.format === "both") {
    results.push(await exportTestcasesToExcel(payloadFile, options.outputDir));
  }
  if (options.format === "xmind" || options.format === "both") {
    results.push(await exportTestcasesToXmind(payloadFile, options.outputDir));
  }

  if (options.callbackMode) {
    const replyText = buildCallbackReply(results, options.sourceType);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      intent: "requirement-to-testcase",
      requirement_name: results[0]?.requirementName ?? "未命名需求",
      case_count: results[0]?.caseCount ?? 0,
      output_files: results.map((item) => item.outputFile),
      formats: results.map((item) => item.format),
      parse_summary: buildCallbackParseSummary(source),
      reply_text: replyText,
      reply_text_override: true,
      export_stage: "completed",
    }, null, 2)}\n`);
    return;
  }

  printSuccess(results);
}

void main().catch((error) => {
  fail("unexpected", error instanceof Error ? error.message : String(error));
});
