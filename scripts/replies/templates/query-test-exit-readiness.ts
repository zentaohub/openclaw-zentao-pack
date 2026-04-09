import type { ReplyTemplate } from "../template_types";
import { asText, getNestedValue, section } from "./_helpers";

export const queryTestExitReadinessTemplate: ReplyTemplate = {
  name: "query-test-exit-readiness",
  render(context) {
    const blockers: unknown[] = Array.isArray(context.result.blockers) ? context.result.blockers : [];
    const blockerLines =
      blockers.length === 0
        ? ["1. 无"]
        : blockers.map((item: unknown, index: number) => `${index + 1}. ${String(item)}`);
    return [
      section("测试准出结论", context.result.ready_for_exit === true ? "可提测" : "不可提测"),
      section("对象", `测试单：${asText(getNestedValue(context.result, "testtask_detail.name"))}（${asText(getNestedValue(context.result, "testtask_detail.id"))}）`),
      section("关键统计", `总用例：${asText(getNestedValue(context.result, "summary.totalCases"), "0")}；通过：${asText(getNestedValue(context.result, "summary.passedCases"), "0")}；失败：${asText(getNestedValue(context.result, "summary.failedCases"), "0")}；未运行：${asText(getNestedValue(context.result, "summary.unrunCases"), "0")}`),
      section("Bug 情况", `关联Bug：${asText(getNestedValue(context.result, "summary.relatedBugCount"), "0")}；活跃Bug：${asText(getNestedValue(context.result, "summary.activeBugs"), "0")}；未解决Bug：${asText(getNestedValue(context.result, "summary.unresolvedBugs"), "0")}`),
      section("阻塞项", ""),
      ...blockerLines,
      section("建议", `如需继续，可发送：测试单详情 ${asText(getNestedValue(context.result, "testtask_detail.id"))} / 测试单用例 ${asText(getNestedValue(context.result, "testtask_detail.id"))}`),
    ].join("\n");
  },
};
