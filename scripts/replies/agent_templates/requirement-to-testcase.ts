import type { ReplyTemplate } from "../template_types";
import { buildTextNoticeCard } from "./card_support";

export const requirementToTestcaseAgentTemplate: ReplyTemplate = {
  name: "agent-requirement-to-testcase",
  render(context) {
    const requirementName = typeof context.result.requirement_name === "string"
      ? context.result.requirement_name
      : "未命名需求";
    const caseCount = typeof context.result.case_count === "number"
      ? context.result.case_count
      : 0;
    const formats = Array.isArray(context.result.formats)
      ? context.result.formats.map((item) => String(item)).join(" + ")
      : "excel";
    const warnings = Array.isArray((context.result.parse_summary as Record<string, unknown> | undefined)?.warnings)
      ? ((context.result.parse_summary as Record<string, unknown>).warnings as unknown[]).map((item) => String(item)).join("；")
      : "当前无阻塞性解析告警";

    const card = buildTextNoticeCard({
      title: "需求转测试用例完成",
      desc: requirementName,
      body: `已生成 ${caseCount} 条测试用例，导出格式：${formats}`,
      taskId: `requirement-to-testcase-${Date.now()}`,
      horizontalContentList: [
        { keyname: "需求名称", value: requirementName },
        { keyname: "用例数量", value: String(caseCount) },
        { keyname: "导出格式", value: formats },
        { keyname: "解析告警", value: warnings || "无" },
      ],
    });

    return JSON.stringify({ template_card: card });
  },
};
