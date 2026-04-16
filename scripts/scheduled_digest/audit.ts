import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ScheduledDigestAuditRecord } from "./types";

const AUDIT_DIR = path.join(resolveRepoRoot(), "tmp/scheduled-digest-audit");
const AUDIT_JSONL_PATH = path.join(AUDIT_DIR, "scheduled-digest-audit.jsonl");
const AUDIT_LATEST_PATH = path.join(AUDIT_DIR, "scheduled-digest-audit.latest.json");
const AUDIT_DOC_PATH = path.join(AUDIT_DIR, "定时摘要推送记录.md");

export function writeScheduledDigestAudit(record: ScheduledDigestAuditRecord): void {
  ensureAuditDir();
  appendFileSync(AUDIT_JSONL_PATH, `${JSON.stringify(record)}\n`, "utf8");
  const latest = readLatestAudit();
  latest.unshift(record);
  writeFileSync(AUDIT_LATEST_PATH, JSON.stringify(latest.slice(0, 100), null, 2), "utf8");
  writeAuditDoc(record);
}

export function createScheduledDigestAuditId(): string {
  return `scheduled_digest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function hasSuccessfulScheduledDigestAudit(input: {
  userid: string;
  timeslot: ScheduledDigestAuditRecord["timeslot"];
  timezone: string;
  date?: Date;
}): boolean {
  const dateKey = toDateKey(input.date ?? new Date(), input.timezone);
  return readAllAuditRecords().some((record) => {
    return record.ok
      && record.sent
      && record.userid === input.userid
      && record.timeslot === input.timeslot
      && toDateKey(new Date(record.created_at), input.timezone) === dateKey;
  });
}

function ensureAuditDir(): void {
  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
  }
}

function resolveRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../.."),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "package.json")) && existsSync(path.join(candidate, "scripts"))) {
      return candidate;
    }
  }
  return process.cwd();
}

function readLatestAudit(): ScheduledDigestAuditRecord[] {
  if (!existsSync(AUDIT_LATEST_PATH)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(AUDIT_LATEST_PATH, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as ScheduledDigestAuditRecord[]) : [];
  } catch {
    return [];
  }
}

function readAllAuditRecords(): ScheduledDigestAuditRecord[] {
  if (!existsSync(AUDIT_JSONL_PATH)) {
    return [];
  }
  try {
    return readFileSync(AUDIT_JSONL_PATH, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ScheduledDigestAuditRecord)
      .filter((record) => typeof record === "object" && record !== null);
  } catch {
    return readLatestAudit();
  }
}

function toDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function writeAuditDoc(record: ScheduledDigestAuditRecord): void {
  const defaultText = [
    "# 定时摘要推送记录",
    "",
    "本文件用于汇总查看定时摘要推送的实际执行结果。",
    "",
  ].join("\n");
  const existing = existsSync(AUDIT_DOC_PATH) ? readFileSync(AUDIT_DOC_PATH, "utf8") : defaultText;
  const entry = [
    `## ${record.created_at}`,
    "",
    `- 时间槽：${record.timeslot}`,
    `- 用户：${record.userid}`,
    `- 禅道账号：${record.zentao_account}`,
    `- 角色：${record.roles.join("、")}`,
    `- 标题：${record.title ?? "-"}`,
    `- 总览：${(record.overview ?? []).join("｜") || "-"}`,
    `- 风险条数：${record.risk_count ?? 0}`,
    `- 待办条数：${record.todo_count ?? 0}`,
    `- 结果：${record.ok ? "成功" : "失败"}`,
    `- 发送：${record.sent ? "是" : "否"}`,
    `- Dry Run：${record.dry_run ? "是" : "否"}`,
    `- 跳过原因：${record.skipped_reason ?? "-"}`,
    `- 错误：${record.error ?? "-"}`,
    "",
  ].join("\n");
  const nextText = existing.endsWith("\n") ? existing : `${existing}\n`;
  writeFileSync(AUDIT_DOC_PATH, `${entry}${nextText}`, "utf8");
}
