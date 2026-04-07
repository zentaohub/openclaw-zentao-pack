import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type JsonObject, type JsonValue } from "./zentao_client";

export interface NotificationAuditRecord extends JsonObject {
  id: string;
  created_at: string;
  object_type: string;
  event_type: string;
  entity_id?: number;
  rule_code?: string;
  template?: string;
  operator_userid?: string;
  next_dev?: string[];
  next_tester?: string[];
  receivers?: string[];
  skipped_reason?: string;
  ok: boolean;
  wecom_response?: JsonObject;
  extra?: JsonObject;
}

const REPO_ROOT = resolveRepoRoot();
const AUDIT_DIR = path.join(REPO_ROOT, "tmp/notification-audit");
const AUDIT_JSONL_PATH = path.join(AUDIT_DIR, "notification-audit.jsonl");
const AUDIT_LATEST_PATH = path.join(AUDIT_DIR, "notification-audit.latest.json");
const AUDIT_DOC_PATH = path.join(REPO_ROOT, "docs/overview/通知链路记录.md");

export function writeNotificationAudit(record: NotificationAuditRecord): void {
  ensureAuditDir();
  appendFileSync(AUDIT_JSONL_PATH, `${JSON.stringify(record)}\n`, "utf8");
  const latest = readLatestAudit();
  latest.unshift(record);
  writeFileSync(AUDIT_LATEST_PATH, JSON.stringify(latest.slice(0, 50), null, 2), "utf8");
  writeNotificationAuditDoc(record);
}

export function createNotificationAuditId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function toAuditArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item)).filter(Boolean);
}

function ensureAuditDir(): void {
  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
  }
}

function resolveRepoRoot(): string {
  const candidates = [
    process.env.OPENCLAW_ZENTAO_REPO_ROOT,
    process.cwd(),
    path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../.."),
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "package.json")) && existsSync(path.join(candidate, "docs"))) {
      return candidate;
    }
  }

  return process.cwd();
}

function readLatestAudit(): NotificationAuditRecord[] {
  if (!existsSync(AUDIT_LATEST_PATH)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(AUDIT_LATEST_PATH, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as NotificationAuditRecord[]) : [];
  } catch {
    return [];
  }
}

function writeNotificationAuditDoc(record: NotificationAuditRecord): void {
  const defaultText = [
    "# 通知链路记录",
    "",
    "本文件用于汇总查看禅道变更通知链路的实际执行结果。",
    "",
    "记录原则：",
    "- 只记录已经发生的通知执行结果。",
    "- 默认按倒序展示，最新记录在最前。",
    "- 详细机器日志以 `tmp/notification-audit/notification-audit.jsonl` 为准。",
    "",
  ].join("\n");
  const existing = existsSync(AUDIT_DOC_PATH) ? readFileSync(AUDIT_DOC_PATH, "utf8") : defaultText;
  const entry = buildDocEntry(record);
  const newText = insertDocEntry(existing, entry);
  writeFileSync(AUDIT_DOC_PATH, newText.endsWith("\n") ? newText : `${newText}\n`, "utf8");
}

function buildDocEntry(record: NotificationAuditRecord): string {
  const titleTime = toCstString(record.created_at);
  const receivers = formatList(record.receivers);
  const nextDev = formatList(record.next_dev);
  const nextTester = formatList(record.next_tester);
  const links = record.extra && typeof record.extra === "object" && !Array.isArray(record.extra)
    ? record.extra.links as JsonObject | undefined
    : undefined;
  const detailLink = links && typeof links === "object"
    ? firstStringValue(Object.values(links) as JsonValue[])
    : undefined;
  return [
    `## ${titleTime}`,
    "",
    `- 时间：${titleTime}`,
    `- 对象：${record.object_type}#${record.entity_id ?? "-"}`,
    `- 事件：${record.event_type}`,
    `- 规则：${record.rule_code ?? "-"}`,
    `- 模板：${record.template ?? "-"}`,
    `- 操作人：${record.operator_userid ?? "-"}`,
    `- 下一步研发：${nextDev}`,
    `- 下一步测试：${nextTester}`,
    `- 实际接收人：${receivers}`,
    `- 结果：${record.ok ? "成功" : "失败"}`,
    `- 原因/备注：${record.skipped_reason ?? "-"}`,
    `- 详情链接：${detailLink ?? "-"}`,
    "",
  ].join("\n");
}

function insertDocEntry(existing: string, entry: string): string {
  const firstRecordIndex = existing.search(/^##\s+/m);
  if (firstRecordIndex >= 0) {
    const prefix = existing.slice(0, firstRecordIndex).replace(/\s*$/, "\n\n");
    const suffix = existing.slice(firstRecordIndex).replace(/^\s*/, "");
    return `${prefix}${entry.trim()}\n\n${suffix}`;
  }
  return `${existing.replace(/\s*$/, "\n\n")}${entry.trim()}\n`;
}

function formatList(values: string[] | undefined): string {
  if (!values || values.length === 0) {
    return "-";
  }
  return values.map((item) => `\`${item}\``).join("、");
}

function toCstString(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())} CST`;
}

function firstStringValue(values: JsonValue[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}
