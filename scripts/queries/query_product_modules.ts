import { parseArgs } from "node:util";
import { printJson, ZentaoClient } from "../shared/zentao_client";

function extractNamesFromHtml(html: string): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/name="modules\[(?:id\d+)?\]"\s+value="([^"]*)"/g)) {
    const value = match[1]?.trim();
    if (!value) continue;
    names.add(value);
  }
  return Array.from(names);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      product: { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.product) {
    throw new Error("Missing required option --product");
  }

  const productId = Number(values.product);
  if (!Number.isFinite(productId) || productId <= 0) {
    throw new Error(`Invalid --product value: ${values.product}`);
  }

  const client = new ZentaoClient({ userid: values.userid });
  const html = await client.getWebPage(`/tree-browse-${productId}-${productId}-0-all.html`);
  const names = extractNamesFromHtml(html);

  printJson({
    ok: true,
    type: "product-modules",
    product: productId,
    count: names.length,
    items: names.map((name, index) => ({
      index: index + 1,
      name,
    })),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

