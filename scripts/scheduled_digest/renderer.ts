import type { JsonObject } from "../shared/zentao_client";
import type { DigestFocusItem, DigestLink, RoleDigestData, ScheduledDigestConfig, ScheduledDigestTimeslot, UserDigestMessage } from "./types";
import { dedupeFocusItems } from "./utils";

export function renderUserDigestMessage(
  config: ScheduledDigestConfig,
  user: { userid: string; zentaoAccount: string; roles: RoleDigestData["role"][] },
  timeslot: ScheduledDigestTimeslot,
  roleDigests: RoleDigestData[],
): UserDigestMessage {
  if (roleDigests.length === 1 || !config.strategy.mergeMultiRoles) {
    return renderSingleRoleDigest(config, user, roleDigests[0]);
  }
  return renderMergedDigest(config, user, timeslot, roleDigests);
}

function renderSingleRoleDigest(
  config: ScheduledDigestConfig,
  user: { userid: string; zentaoAccount: string; roles: RoleDigestData["role"][] },
  digest: RoleDigestData,
): UserDigestMessage {
  const focusItems = limitFocusItems(config, digest.riskItems, digest.todoItems);
  const lines: string[] = [digest.title, digest.overviewParts.join("｜")];

  if (focusItems.length > 0) {
    lines.push("");
    lines.push(...focusItems.map((item, index) => `${index + 1}. ${formatFocusItem(item)}`));
  } else {
    lines.push("", "1. 当前无高优风险");
  }

  const linkLine = formatLinks(digest.links.slice(0, config.strategy.maxLinks));
  if (linkLine) {
    lines.push("", linkLine);
  }

  return {
    userid: user.userid,
    zentaoAccount: user.zentaoAccount,
    roles: [...user.roles],
    markdown: lines.join("\n"),
    title: digest.title,
    overviewParts: [...digest.overviewParts],
    riskItems: dedupeFocusItems(digest.riskItems),
    todoItems: dedupeFocusItems(digest.todoItems),
    links: digest.links.slice(0, config.strategy.maxLinks),
    metrics: digest.metrics,
  };
}

function renderMergedDigest(
  config: ScheduledDigestConfig,
  user: { userid: string; zentaoAccount: string; roles: RoleDigestData["role"][] },
  timeslot: ScheduledDigestTimeslot,
  digests: RoleDigestData[],
): UserDigestMessage {
  const riskItems = dedupeFocusItems(digests.flatMap((item) => item.riskItems));
  const todoItems = dedupeFocusItems(digests.flatMap((item) => item.todoItems));
  const links = dedupeLinks(digests.flatMap((item) => item.links)).slice(0, config.strategy.maxLinks);
  const overviewParts = [
    `风险 ${riskItems.length}`,
    `待办 ${todoItems.length}`,
    `角色 ${digests.length}`,
  ];
  const title = timeslot === "morning" ? "早报｜工作摘要" : "晚报｜工作摘要";
  const lines: string[] = [title, overviewParts.join("｜")];

  const maxSections = config.strategy.maxSections;
  if (riskItems.length > 0 && maxSections >= 1) {
    lines.push("", "【我的风险】");
    lines.push(...riskItems.slice(0, Math.min(2, config.strategy.topN)).map((item, index) => `${index + 1}. ${formatFocusItem(item)}`));
  } else {
    lines.push("", "【我的风险】", "1. 当前无高优风险");
  }

  if (maxSections >= 2) {
    const todoSectionItems = todoItems.slice(0, Math.min(2, config.strategy.topN));
    lines.push("", "【我的待办】");
    if (todoSectionItems.length > 0) {
      lines.push(...todoSectionItems.map((item, index) => `${index + 1}. ${formatFocusItem(item)}`));
    } else {
      lines.push("1. 当前无重点待办");
    }
  }

  const linkLine = formatLinks(links);
  if (linkLine) {
    lines.push("", linkLine);
  }

  return {
    userid: user.userid,
    zentaoAccount: user.zentaoAccount,
    roles: [...user.roles],
    markdown: lines.join("\n"),
    title,
    overviewParts,
    riskItems,
    todoItems,
    links,
    metrics: mergeMetrics(digests.map((item) => item.metrics)),
  };
}

function limitFocusItems(config: ScheduledDigestConfig, risks: DigestFocusItem[], todos: DigestFocusItem[]): DigestFocusItem[] {
  const uniqueRisks = dedupeFocusItems(risks);
  const uniqueTodos = dedupeFocusItems(todos);
  const combined: DigestFocusItem[] = [];
  for (const item of uniqueRisks) {
    if (combined.length >= config.strategy.topN) {
      break;
    }
    combined.push(item);
  }
  for (const item of uniqueTodos) {
    if (combined.length >= config.strategy.topN) {
      break;
    }
    if (!combined.some((current) => current.key === item.key)) {
      combined.push(item);
    }
  }
  return combined;
}

function formatFocusItem(item: DigestFocusItem): string {
  return item.url ? `[${item.text}](${item.url})` : item.text;
}

function formatLinks(links: DigestLink[]): string {
  return links
    .map((item) => `[${item.label}](${item.url})`)
    .join(" / ");
}

function dedupeLinks(links: DigestLink[]): DigestLink[] {
  const map = new Map<string, DigestLink>();
  for (const link of links) {
    if (!map.has(link.label)) {
      map.set(link.label, link);
    }
  }
  return Array.from(map.values());
}

function mergeMetrics(metricsList: JsonObject[]): JsonObject {
  const merged: JsonObject = {};
  for (const metrics of metricsList) {
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === "number" && typeof merged[key] === "number") {
        merged[key] = (merged[key] as number) + value;
      } else if (merged[key] === undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}
