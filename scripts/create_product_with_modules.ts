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

function normalizeList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      code: { type: "string" },
      program: { type: "string" },
      type: { type: "string", default: "normal" },
      "workflow-group": { type: "string", default: "1" },
      po: { type: "string" },
      qd: { type: "string" },
      rd: { type: "string" },
      reviewer: { type: "string" },
      desc: { type: "string", default: "" },
      acl: { type: "string", default: "open" },
      whitelist: { type: "string" },
      modules: { type: "string" },
      userid: { type: "string" },
    },
    allowPositionals: false,
  });

  const productPayload: JsonObject = {
    name: requiredString(values.name, "name"),
    type: values.type ?? "normal",
    workflowGroup: optionalNumber(values["workflow-group"], "workflow-group") ?? 1,
    desc: values.desc ?? "",
    acl: values.acl ?? "open",
  };

  if (values.code) productPayload.code = values.code;
  const program = optionalNumber(values.program, "program");
  if (program !== undefined) productPayload.program = program;
  if (values.po) productPayload.PO = values.po;
  if (values.qd) productPayload.QD = values.qd;
  if (values.rd) productPayload.RD = values.rd;
  const reviewers = normalizeList(values.reviewer);
  if (reviewers.length > 0) productPayload.reviewer = reviewers;
  const whitelist = normalizeList(values.whitelist);
  if (whitelist.length > 0) productPayload.whitelist = whitelist;

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);

  const productResult = await client.createProduct(productPayload);
  const productId = typeof productResult.product_id === "number" ? productResult.product_id : undefined;
  if (!productId) {
    throw new Error("Product was created but no product_id was returned, cannot continue with module creation");
  }

  const modules = normalizeList(values.modules);
  const moduleResult =
    modules.length > 0 ? await client.createProductModules(productId, { modules }) : null;

  printJson({
    ok: true,
    product: productResult,
    modules: moduleResult,
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
