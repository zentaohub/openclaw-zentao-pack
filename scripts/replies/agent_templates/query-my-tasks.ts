import type { JsonObject } from "../../shared/zentao_client";
import {
  WECOM_INTERACTIVE_ACTIONS,
  buildInteractiveActionKey,
} from "../../callbacks/wecom_interactive_registry";
import type { ReplyRenderContext, ReplyTemplate } from "../template_types";
import { buildButtonInteractionCard } from "./card_support";

function buildUniqueTaskId(base: string, userid?: string): string {
  const normalizedBase = base.replace(/[^A-Za-z0-9._:-]+/g, "-");
  const normalizedUser = (userid || "unknown").replace(/[^A-Za-z0-9._:-]+/g, "-");
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${normalizedBase}-${normalizedUser}-${uniqueSuffix}`;
}

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
  render(context: ReplyRenderContext) {
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
      "Unknown user";

    const displayRole =
      getNestedValue(result, "matched_user.role") ??
      getNestedValue(result, "matched_user.account") ??
      getNestedValue(result, "matched_user.realname") ??
      "Unmatched";

    const statusCounts =
      result.status_counts && typeof result.status_counts === "object" && !Array.isArray(result.status_counts)
        ? Object.entries(result.status_counts as Record<string, unknown>).map(([key, value]) => ({
            keyname: key,
            value: String(value),
          }))
        : [];

    const taskLines = tasks.slice(0, 3).map((task: JsonObject, index: number) => {
      const name = getNestedValue(task, "name") ?? `Task ${index + 1}`;
      const status = getNestedValue(task, "status") ?? "unknown";
      const deadline = getNestedValue(task, "deadline");
      return `${index + 1}. ${name} [${status}]${deadline ? ` due:${deadline}` : ""}`;
    });

    const firstTaskId = getNestedValue(tasks[0], "id");
    const card = buildButtonInteractionCard({
      title: `${displayUser} tasks`,
      desc: `Zentao role: ${displayRole}`,
      body:
        taskLines.length > 0
          ? taskLines.join("\n")
          : "No tasks or todos were found for the current user.",
      taskId: buildUniqueTaskId("query-my-tasks", context.userid),
      horizontalContentList: [
        { keyname: "User", value: displayUser },
        { keyname: "Role", value: displayRole },
        ...statusCounts.slice(0, 2),
      ],
      quoteText: taskLines.length > 0
        ? "Use the card buttons to continue with the first task or open related bugs."
        : "Try opening your bug list or refresh this card later.",
      buttonList: [
        ...(firstTaskId
          ? [{
              label: "查看首条任务",
              key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.taskOpenDetail, { task: firstTaskId }),
              style: 1 as const,
            }]
          : []),
        {
          label: "查看我的Bug",
          key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.taskQueryMyBugs),
          style: 2,
        },
        {
          label: "刷新任务",
          key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.taskRefreshMine),
          style: 2,
        },
      ],
    });

    return JSON.stringify({ template_card: card });
  },
};
