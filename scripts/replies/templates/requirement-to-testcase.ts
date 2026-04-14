import type { ReplyTemplate } from "../template_types";

export const requirementToTestcaseTemplate: ReplyTemplate = {
  name: "requirement-to-testcase",
  render(context) {
    const requirementName = typeof context.result.requirement_name === "string"
      ? context.result.requirement_name
      : "未命名需求";
    const caseCount = typeof context.result.case_count === "number"
      ? context.result.case_count
      : 0;
    const formats = Array.isArray(context.result.formats)
      ? context.result.formats.join(" + ")
      : "excel";
    const outputFiles = Array.isArray(context.result.output_files)
      ? context.result.output_files.map((item) => String(item)).join("\n")
      : "无";
    const warnings = Array.isArray((context.result.parse_summary as Record<string, unknown> | undefined)?.warnings)
      ? ((context.result.parse_summary as Record<string, unknown>).warnings as unknown[]).map((item) => String(item)).join("；")
      : "当前无阻塞性解析告警";

    return [
      "已完成需求转测试用例。",
      `需求名称：${requirementName}`,
      `测试用例数量：${caseCount}`,
      `导出格式：${formats}`,
      `解析告警：${warnings || "当前无阻塞性解析告警"}`,
      "导出文件：",
      outputFiles,
    ].join("\n");
  },
};
