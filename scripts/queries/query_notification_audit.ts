import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { printJson, type JsonObject } from "../shared/zentao_client";

interface NotificationAuditRecord extends JsonObject {
  id?: string;
  created_at?: string;
  object_type?: string;
  event_type?: string;
  entity_id?: number;
  rule_code?: string;
  template?: string;
  operator_userid?: string;
  next_dev?: string[];
  next_tester?: string[];
  receivers?: string[];
  skipped_reason?: string;
  ok?: boolean;
}

function resolveRepoRoot(): string {
  const candidates = [
    process.env.OPENCLAW_ZENTAO_REPO_ROOT,
    process.cwd(),
    path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../.."),
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "package.json")) && existsSync(path.join(candidate, "tmp"))) {
      return candidate;
    }
  }

  return process.cwd();
}

function readAuditJsonl(filePath: string): NotificationAuditRecord[] {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as NotificationAuditRecord)
    .reverse();
}

function normalizePositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      object: { type: "string" },
      event: { type: "string" },
      result: { type: "string" },
      latest: { type: "string" },
      entity: { type: "string" },
      rule: { type: "string" },
      operator: { type: "string" },
    },
    allowPositionals: false,
  });

  const repoRoot = resolveRepoRoot();
  const auditPath = path.join(repoRoot, "tmp/notification-audit/notification-audit.jsonl");
  let items = readAuditJsonl(auditPath);

  if (values.object) {
    items = items.filter((item) => item.object_type === values.object);
  }
  if (values.event) {
    items = items.filter((item) => item.event_type === values.event);
  }
  if (values.rule) {
    items = items.filter((item) => item.rule_code === values.rule);
  }
  if (values.operator) {
    items = items.filter((item) => item.operator_userid === values.operator);
  }
  const entityId = normalizePositiveInteger(values.entity);
  if (entityId) {
    items = items.filter((item) => Number(item.entity_id ?? 0) === entityId);
  }
  if (values.result === "success") {
    items = items.filter((item) => item.ok === true);
  } else if (values.result === "failed") {
    items = items.filter((item) => item.ok === false);
  }

  const latest = normalizePositiveInteger(values.latest) ?? 20;
  items = items.slice(0, latest);

  printJson({
    ok: true,
    type: "notification-audit",
    audit_path: auditPath,
    count: items.length,
    filters: {
      object: values.object ?? null,
      event: values.event ?? null,
      result: values.result ?? null,
      latest,
      entity: entityId ?? null,
      rule: values.rule ?? null,
      operator: values.operator ?? null,
    },
    items,
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
