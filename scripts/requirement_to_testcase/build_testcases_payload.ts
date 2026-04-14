import { readFileSync } from "node:fs";
import type { RequirementSource, StructuredTestcase, TestcasePayload } from "./types";

function compactDate(): string {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
}

function normalizeRequirementTitle(input: string): string {
  return input
    .replace(/^#+\s*/, "")
    .replace(/^需求名称[:：]?/u, "")
    .replace(/^[\^\s]+|[\^\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "临时需求说明";
}

function normalizeLine(line: string): string {
  return line
    .replace(/^#+\s*/, "")
    .replace(/^[-*•]+\s*/, "")
    .replace(/^[0-9]+[.、)]\s*/, "")
    .replace(/^[一二三四五六七八九十]+[、.：:]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function buildSimpleTestcases(source: RequirementSource): StructuredTestcase[] {
  const lines = dedupe(source.rawText.split(/\r?\n/).map(normalizeLine).filter(Boolean));
  const top = lines.slice(0, 8);
  const summary = truncate(source.rawText.replace(/\s+/g, " "), 200);

  const baseCases: StructuredTestcase[] = [
    {
      "用例ID": "TC-AUTO-001",
      "模块": normalizeRequirementTitle(source.titleCandidate),
      "关联需求点": top[0] || summary,
      "用例标题": `${normalizeRequirementTitle(source.titleCandidate)}主流程验证`,
      "前置条件": `已获取需求文档《${source.sourceName}》并完成需求理解。`,
      "测试步骤": `1. 阅读需求正文 2. 进入主流程页面或功能 3. 按需求执行主流程操作 4. 观察执行结果`,
      "测试数据": top.join(" | ") || summary,
      "预期结果": "主流程可闭环执行，页面展示、状态流转和结果输出符合需求描述。",
      "优先级": "P0",
      "用例类型": "功能",
    },
    {
      "用例ID": "TC-AUTO-002",
      "模块": normalizeRequirementTitle(source.titleCandidate),
      "关联需求点": top[1] || top[0] || summary,
      "用例标题": `${normalizeRequirementTitle(source.titleCandidate)}关键规则与边界校验`,
      "前置条件": "已进入需求对应的关键操作场景。",
      "测试步骤": "1. 覆盖需求中的必填、边界值、非法输入 2. 提交或触发关键动作 3. 检查系统提示和状态变化",
      "测试数据": top.slice(0, 4).join(" | ") || summary,
      "预期结果": "系统能够正确处理规则与边界场景，非法输入被拦截并给出明确提示。",
      "优先级": "P0",
      "用例类型": "边界",
    },
    {
      "用例ID": "TC-AUTO-003",
      "模块": normalizeRequirementTitle(source.titleCandidate),
      "关联需求点": top[2] || top[0] || summary,
      "用例标题": `${normalizeRequirementTitle(source.titleCandidate)}异常流程与风险验证`,
      "前置条件": "已具备触发异常场景的前置条件。",
      "测试步骤": "1. 模拟失败、超时、空数据或重复提交 2. 继续执行关键动作 3. 检查异常提示、数据状态和恢复逻辑",
      "测试数据": top.slice(0, 6).join(" | ") || summary,
      "预期结果": "系统在异常场景下处理正确，提示明确，且不会出现错误状态或数据不一致。",
      "优先级": "P1",
      "用例类型": "异常",
    },
  ];

  return baseCases;
}

export function readPayloadFile(filePath: string): TestcasePayload {
  return JSON.parse(readFileSync(filePath, "utf8")) as TestcasePayload;
}

export function buildPayloadFromSource(source: RequirementSource, outputDir?: string): TestcasePayload {
  return {
    requirement_name: normalizeRequirementTitle(source.titleCandidate || source.sourceName),
    date: compactDate(),
    output_dir: outputDir,
    sheet_name: "测试用例",
    test_cases: buildSimpleTestcases(source),
  };
}
