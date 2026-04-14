import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Workbook, RootTopic, Topic, writeLocalFile } from "xmind-generator";
import { readPayloadFile } from "./build_testcases_payload";
import { normalizePayload } from "./normalize_testcases";
import type { ExportResult } from "./types";

interface XmindMapping {
  group_by?: string;
  case_title_fields?: string[];
  detail_fields?: string[];
  detail_labels?: Record<string, string>;
}

function getResourceRoot(): string {
  return path.resolve(__dirname, "../../../requirement-to-testcase");
}

function readMapping(resourceRoot: string): XmindMapping {
  const mappingPath = path.join(resourceRoot, "templates", "xmind_mapping_review.json");
  if (!existsSync(mappingPath)) {
    throw new Error(`XMind mapping not found: ${mappingPath}`);
  }
  return JSON.parse(readFileSync(mappingPath, "utf8")) as XmindMapping;
}

function buildCaseTopic(item: Record<string, string>, mapping: XmindMapping) {
  const title = (mapping.case_title_fields ?? [])
    .map((field) => String(item[field] ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  const children = (mapping.detail_fields ?? []).map((field) => {
    const label = mapping.detail_labels?.[field] ?? field;
    const value = String(item[field] ?? "无");
    return Topic(`${label}：${value}`);
  });

  return Topic(title || "未命名用例").children(children);
}

export async function exportTestcasesToXmind(payloadFile: string, outputDirOverride?: string): Promise<ExportResult> {
  const resourceRoot = getResourceRoot();
  const mapping = readMapping(resourceRoot);
  const payload = normalizePayload(readPayloadFile(payloadFile));
  const outputDir = path.resolve(outputDirOverride ?? payload.output_dir ?? path.join(resourceRoot, "output"));

  mkdirSync(outputDir, { recursive: true });

  const grouped = new Map<string, ReturnType<typeof Topic>[]>();
  const groupField = mapping.group_by ?? "模块";
  for (const item of payload.test_cases as unknown as Record<string, string>[]) {
    const groupName = String(item[groupField] ?? "未分类模块").trim() || "未分类模块";
    if (!grouped.has(groupName)) {
      grouped.set(groupName, []);
    }
    grouped.get(groupName)?.push(buildCaseTopic(item, mapping));
  }

  const children = Array.from(grouped.entries()).map(([moduleName, cases]) => Topic(moduleName).children(cases));
  const outputFile = path.join(outputDir, `${payload.requirement_name}测试用例${payload.date}.xmind`);
  const workbook = Workbook(RootTopic(payload.requirement_name).children(children));

  await writeLocalFile(workbook, outputFile);
  return {
    format: "xmind",
    outputFile,
    caseCount: payload.test_cases.length,
    requirementName: payload.requirement_name,
  };
}
