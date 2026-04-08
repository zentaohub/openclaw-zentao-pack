import type { JsonObject } from "../../shared/zentao_client";
import type { ReplyTemplate } from "../template_types";

function getNestedValue(record: JsonObject | undefined, path: string): string | undefined {
  if (!record) return undefined;

  const parts = path.split(".");
  let current: unknown = record;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as JsonObject)[part];
  }

  if (current === undefined || current === null) {
    return undefined;
  }

  const text = String(current).trim();
  return text || undefined;
}

export const queryMyTasksAgentTemplate: ReplyTemplate = {
  name: "agent-query-my-tasks",
  render(context) {
    const result = context.result;
    const tasks = Array.isArray(result.tasks)
      ? result.tasks.filter(
          (item): item is JsonObject =>
            typeof item === "object" && item !== null && !Array.isArray(item),
        )
      : [];

    const displayUser =
      getNestedValue(result, "wecom_user.name") ??
      getNestedValue(result, "userid") ??
      context.userid ??
      "未知用户";

    const displayZentaoRole =
      getNestedValue(result, "matched_user.role") ??
      getNestedValue(result, "matched_user.account") ??
      getNestedValue(result, "matched_user.realname") ??
      "未匹配";

    const statusCounts =
      result.status_counts && typeof result.status_counts === "object" && !Array.isArray(result.status_counts)
        ? Object.entries(result.status_counts as Record<string, unknown>).map(([key, value]) => ({
            keyname: key,
            value: String(value),
          }))
        : [];

    const taskLines = tasks.slice(0, 3).map((task, index) => {
      const name = getNestedValue(task, "name") ?? `任务${index + 1}`;
      const status = getNestedValue(task, "status") ?? "unknown";
      const deadline = getNestedValue(task, "deadline");
      return `${index + 1}. ${name} [${status}]${deadline ? ` 截止:${deadline}` : ""}`;
    });

    return JSON.stringify({
      template_card: {
        card_type: "text_notice",
        source: {
          desc: "企微自建应用",
          desc_color: 0,
        },
        main_title: {
          title: `${displayUser}的任务`,
          desc: `禅道角色：${displayZentaoRole}`,
        },
        sub_title_text:
          taskLines.length > 0
            ? taskLines.join("\n")
            : "当前没有查询到你的任务或待办。",
        horizontal_content_list: [
          { keyname: "用户", value: displayUser },
          { keyname: "角色", value: displayZentaoRole },
          ...statusCounts.slice(0, 2),
        ],
        task_id: `query-my-tasks-${context.userid}`,
      },
    });
  },
};
