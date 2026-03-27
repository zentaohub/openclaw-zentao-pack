import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "./shared/zentao_client";

function requiredString(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  return value;
}

function optionalNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Option --${optionName} must be a valid number`);
  return parsed;
}

function normalizeList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      code: { type: "string" },
      program: { type: "string" },
      line: { type: "string" },
      "line-name": { type: "string" },
      "new-line": { type: "boolean", default: false },
      type: { type: "string", default: "normal" },
      "workflow-group": { type: "string", default: "1" },
      po: { type: "string" },
      qd: { type: "string" },
      rd: { type: "string" },
      reviewer: { type: "string" },
      desc: { type: "string", default: "" },
      acl: { type: "string", default: "open" },
      whitelist: { type: "string" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const payload: JsonObject = {
    name: requiredString(values.name, "name"),
    type: values.type ?? "normal",
    workflowGroup: optionalNumber(values["workflow-group"], "workflow-group") ?? 1,
    desc: values.desc ?? "",
    acl: values.acl ?? "open",
  };

  if (values.code) payload.code = values.code;
  const program = optionalNumber(values.program, "program");
  if (program !== undefined) payload.program = program;
  const line = optionalNumber(values.line, "line");
  if (line !== undefined) payload.line = line;
  if (values["line-name"]) payload.lineName = values["line-name"];
  if (values["new-line"]) payload.newLine = 1;
  if (values.po) payload.PO = values.po;
  if (values.qd) payload.QD = values.qd;
  if (values.rd) payload.RD = values.rd;
  const reviewers = normalizeList(values.reviewer);
  if (reviewers) payload.reviewer = reviewers;
  const whitelist = normalizeList(values.whitelist);
  if (whitelist) payload.whitelist = whitelist;

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.createProduct(payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
