import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";
import { extractArrayObjects, summarizeList } from "./_query_utils";

function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[，。！？,.!?:：；;（）()【】\[\]{}<>《》"'“”‘’`~\-_/\\|]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function compactSearchText(value: unknown): string {
  return normalizeSearchText(value).replace(/\s+/gu, "");
}

function matchesKeywords(item: JsonObject, keywords: string): boolean {
  const normalizedKeywords = normalizeSearchText(keywords);
  const compactKeywords = compactSearchText(keywords);
  const tokens = normalizedKeywords.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = normalizeSearchText([
    item.id,
    item.name,
    item.program,
    item.status,
    item.PO,
    item.QD,
    item.RD,
    item.type,
  ].join(" "));
  const compactHaystack = compactSearchText(haystack);

  if (compactKeywords && compactHaystack.includes(compactKeywords)) {
    return true;
  }

  return tokens.every((token) => haystack.includes(token) || compactHaystack.includes(compactSearchText(token)));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      keywords: { type: "string" },
    },
    allowPositionals: false,
  });
  const client = new ZentaoClient({ userid: values.userid });
  const data = await client.getWebJsonViewData("/product-all.json");
  const allItems = extractArrayObjects(data.productStats);
  const keywords = typeof values.keywords === "string" ? values.keywords.trim() : "";
  const items = keywords ? allItems.filter((item) => matchesKeywords(item, keywords)) : allItems;

  printJson({
    ok: true,
    type: "products",
    title: data.title ?? null,
    total: data.recTotal ?? allItems.length,
    count: items.length,
    keywords: keywords || undefined,
    items: summarizeList(items, ["id", "name", "program", "status", "PO", "QD", "RD", "type"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
