import type { JsonObject } from "../../shared/zentao_client";
import type { ReplyTemplate, ReplyRenderContext } from "../template_types";

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

function formatTaskLine(task: JsonObject, index: number): string {
  const parts: string[] = [];

  const deadline = getNestedValue(task, "deadline");
  const name = getNestedValue(task, "name");
  const status = getNestedValue(task, "status");
  const assignedTo = getNestedValue(task, "assignedTo");
  const execution = getNestedValue(task, "execution");
  const left = getNestedValue(task, "left");

  if (deadline) parts.push(`时间：${deadline}`);
  if (name) parts.push(`任务名：${name}`);
  if (status) parts.push(`状态：${status}`);
  if (assignedTo) parts.push(`执行人：${assignedTo}`);
  if (execution) parts.push(`所属执行：${execution}`);
  if (left) parts.push(`剩余工时：${left}`);

  return `${index + 1}. ${parts.join(" | ")}`;
}

function formatStatusCounts(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const summary = Object.entries(value as Record<string, unknown>)
    .map(([key, count]) => `${key}:${String(count)}`)
    .join(" | ");

  return summary || undefined;
}

export const queryMyTasksTemplate: ReplyTemplate = {
  name: "query-my-tasks",
  render(context: ReplyRenderContext): string {
    const result = context.result;

    const tasks = Array.isArray(result.tasks)
      ? result.tasks.filter(
          (item: unknown): item is JsonObject =>
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

    const lines: string[] = [
      `【用户】${displayUser}`,
      `【禅道角色】${displayZentaoRole}`,
      `【任务列表】`,
    ];

    if (tasks.length === 0) {
      lines.push("当前没有查询到你的任务或待办。");
      return lines.join("\n");
    }

    tasks.slice(0, 10).forEach((task: JsonObject, index: number) => {
      lines.push(formatTaskLine(task, index));
    });

    const statusSummary = formatStatusCounts(result.status_counts);
    if (statusSummary) {
      lines.push(`【状态统计】${statusSummary}`);
    }

    return lines.join("\n");
  },
};
