import type { StructuredTestcase, TestcasePayload } from "./types";

const REQUIRED_FIELDS: Array<keyof StructuredTestcase> = [
  "用例ID",
  "模块",
  "关联需求点",
  "用例标题",
  "前置条件",
  "测试步骤",
  "测试数据",
  "预期结果",
  "优先级",
  "用例类型",
];

function compactDate(): string {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function sanitizeFileName(name: string): string {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "未命名需求";
}

function normalizeCase(item: Partial<StructuredTestcase>, index: number): StructuredTestcase {
  const normalized = {} as StructuredTestcase;
  for (const field of REQUIRED_FIELDS) {
    const raw = item[field];
    normalized[field] = raw === undefined || raw === null || raw === ""
      ? (field === "用例ID" ? `TC-AUTO-${String(index + 1).padStart(3, "0")}` : "无")
      : String(raw);
  }
  return normalized;
}

export function normalizePayload(payload: Partial<TestcasePayload>): TestcasePayload {
  const cases = Array.isArray(payload.test_cases) ? payload.test_cases : [];
  return {
    requirement_name: sanitizeFileName(String(payload.requirement_name || "未命名需求")),
    date: /^\d{8}$/.test(String(payload.date || "")) ? String(payload.date) : compactDate(),
    output_dir: payload.output_dir,
    sheet_name: String(payload.sheet_name || "测试用例").trim() || "测试用例",
    test_cases: cases.map((item, index) => normalizeCase(item, index)),
  };
}
