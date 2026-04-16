import { URL } from "node:url";
import type { JsonObject, JsonValue } from "../shared/zentao_client";
import type { DigestFocusItem, DigestFocusSeverity, ScheduledDigestTimeslot } from "./types";

export function extractObjects(value: JsonValue | undefined): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter(isJsonObject);
  }
  if (isJsonObject(value)) {
    return Object.values(value).filter(isJsonObject);
  }
  return [];
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function asNumber(value: JsonValue | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function buildWebLink(baseUrl: string, route: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedRoute = route.replace(/^\/+/, "");
  return new URL(normalizedRoute, normalizedBase).toString();
}

export function toHtmlRoute(route: string): string {
  return route.replace(/\.json$/i, ".html");
}

export function truncateText(value: string | undefined, maxChars: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return "";
  }
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1)).trim()}…` : text;
}

export function priorityNumber(value: JsonValue | undefined): number {
  const parsed = asNumber(value);
  return parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
}

export function isTaskDone(status: string | undefined): boolean {
  return new Set(["done", "closed", "cancel", "canceled", "cancelled"]).has((status ?? "").toLowerCase());
}

export function isBugClosed(status: string | undefined): boolean {
  return new Set(["closed", "close"]).has((status ?? "").toLowerCase());
}

export function isHighPriorityBug(item: JsonObject): boolean {
  return priorityNumber(item.pri) <= 2 || priorityNumber(item.severity) <= 2;
}

export function getNowDateParts(timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  return { year, month, day };
}

export function parseDateToParts(value: string | undefined): { year: number; month: number; day: number } | null {
  if (!value) {
    return null;
  }
  const match = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function computeOverdueDays(value: string | undefined, timezone: string): number {
  const target = parseDateToParts(value);
  if (!target) {
    return 0;
  }
  const current = getNowDateParts(timezone);
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day);
  const currentUtc = Date.UTC(current.year, current.month - 1, current.day);
  if (currentUtc <= targetUtc) {
    return 0;
  }
  return Math.floor((currentUtc - targetUtc) / (24 * 60 * 60 * 1000));
}

export function computeAgeHours(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return Math.floor((Date.now() - parsed.getTime()) / (60 * 60 * 1000));
}

export function computeAgeDays(value: string | undefined): number {
  const ageHours = computeAgeHours(value);
  if (ageHours === null || ageHours <= 0) {
    return 0;
  }
  return Math.floor(ageHours / 24);
}

export function dedupeFocusItems(items: DigestFocusItem[]): DigestFocusItem[] {
  const merged = new Map<string, DigestFocusItem>();
  for (const item of items) {
    if (!merged.has(item.key) || compareSeverity(item.severity, merged.get(item.key)?.severity ?? "info") < 0) {
      merged.set(item.key, item);
    }
  }
  return Array.from(merged.values()).sort(compareFocusItems);
}

export function compareFocusItems(left: DigestFocusItem, right: DigestFocusItem): number {
  const severityDiff = compareSeverity(left.severity, right.severity);
  if (severityDiff !== 0) {
    return severityDiff;
  }
  return left.text.localeCompare(right.text, "zh-CN");
}

export function compareSeverity(left: DigestFocusSeverity, right: DigestFocusSeverity): number {
  return severityRank(left) - severityRank(right);
}

function severityRank(value: DigestFocusSeverity): number {
  switch (value) {
    case "p0":
      return 0;
    case "p1":
      return 1;
    default:
      return 2;
  }
}

export function summarizeTimeslotLabel(timeslot: ScheduledDigestTimeslot): string {
  return timeslot === "morning" ? "早报" : "晚报";
}
