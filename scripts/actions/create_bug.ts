import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";

function requiredNumber(value: string | undefined, optionName: string): number {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Option --${optionName} must be a valid positive number`);
  return parsed;
}

function optionalNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Option --${optionName} must be a valid number`);
  return parsed;
}

function requiredString(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  return value;
}

function parseBuilds(value: string | undefined): string[] {
  if (!value) throw new Error("Missing required option --builds");
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFlexibleList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/(?:\|\||,|\n)/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildStructuredSteps(values: Record<string, string | undefined>): string {
  if (values.steps?.trim()) {
    return values.steps.trim();
  }

  const sections: string[] = [];
  if (values["repro-steps"]?.trim()) {
    sections.push(`[步骤]\n${values["repro-steps"].trim()}`);
  }
  if (values["actual-result"]?.trim()) {
    sections.push(`[实际结果]\n${values["actual-result"].trim()}`);
  }
  if (values["expected-result"]?.trim()) {
    sections.push(`[期望结果]\n${values["expected-result"].trim()}`);
  }

  const environmentLines: string[] = [];
  if (values.environment?.trim()) {
    environmentLines.push(values.environment.trim());
  }
  if (values.browser?.trim()) {
    environmentLines.push(`浏览器：${values.browser.trim()}`);
  }
  if (values.os?.trim()) {
    environmentLines.push(`操作系统：${values.os.trim()}`);
  }
  if (environmentLines.length > 0) {
    sections.push(`[环境]\n${environmentLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      product: { type: "string" },
      branch: { type: "string" },
      module: { type: "string" },
      project: { type: "string" },
      execution: { type: "string" },
      story: { type: "string" },
      task: { type: "string" },
      case: { type: "string" },
      "case-version": { type: "string" },
      run: { type: "string" },
      testtask: { type: "string" },
      title: { type: "string" },
      builds: { type: "string" },
      "assigned-to": { type: "string" },
      severity: { type: "string" },
      pri: { type: "string" },
      type: { type: "string", default: "codeerror" },
      steps: { type: "string", default: "" },
      "repro-steps": { type: "string" },
      "actual-result": { type: "string" },
      "expected-result": { type: "string" },
      environment: { type: "string" },
      browser: { type: "string" },
      os: { type: "string" },
      keywords: { type: "string" },
      deadline: { type: "string" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const structuredSteps = buildStructuredSteps(values as Record<string, string | undefined>);
  const payload: JsonObject = {
    product: requiredNumber(values.product, "product"),
    title: requiredString(values.title, "title"),
    openedBuild: parseBuilds(values.builds),
    type: values.type ?? "codeerror",
    assignedTo: values["assigned-to"] ?? "admin",
    steps: structuredSteps,
  };

  if (values.branch !== undefined) payload.branch = values.branch;
  const module = optionalNumber(values.module, "module");
  if (module !== undefined) payload.module = module;
  const project = optionalNumber(values.project, "project");
  if (project !== undefined) payload.project = project;
  const execution = optionalNumber(values.execution, "execution");
  if (execution !== undefined) payload.execution = execution;
  const story = optionalNumber(values.story, "story");
  if (story !== undefined) payload.story = story;
  const task = optionalNumber(values.task, "task");
  if (task !== undefined) payload.task = task;
  const caseId = optionalNumber(values.case, "case");
  if (caseId !== undefined) payload.case = caseId;
  const caseVersion = optionalNumber(values["case-version"], "case-version");
  if (caseVersion !== undefined) payload.caseVersion = caseVersion;
  const run = optionalNumber(values.run, "run");
  if (run !== undefined) payload.run = run;
  const testtask = optionalNumber(values.testtask, "testtask");
  if (testtask !== undefined) payload.testtask = testtask;
  const severity = optionalNumber(values.severity, "severity");
  if (severity !== undefined) payload.severity = severity;
  const pri = optionalNumber(values.pri, "pri");
  if (pri !== undefined) payload.pri = pri;
  if (values.keywords !== undefined) payload.keywords = values.keywords;
  if (values.deadline !== undefined) payload.deadline = values.deadline;

  const browserList = parseFlexibleList(values.browser);
  if (browserList.length > 0) payload.browser = browserList;
  const osList = parseFlexibleList(values.os);
  if (osList.length > 0) payload.os = osList;

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.createBug(payload);
  const bugId = result.bug_id ?? result.id ?? null;
  const baseUrl = String(
    process.env.OPENCLAW_ZENTAO_BASE_URL ?? process.env.ZENTAO_BASE_URL ?? "http://1.14.73.166",
  ).replace(/\/+$/u, "");

  printJson({
    ok: true,
    action: "create-bug",
    bug_id: bugId,
    title: payload.title,
    product: payload.product,
    builds: payload.openedBuild,
    steps: payload.steps,
    severity: payload.severity ?? null,
    pri: payload.pri ?? null,
    assigned_to: payload.assignedTo ?? null,
    bug_link: bugId ? `${baseUrl}/bug-view-${bugId}.html` : null,
    message: result.message ?? result.msg ?? "Bug 已创建",
    raw: result,
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
