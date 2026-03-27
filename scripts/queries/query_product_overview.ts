import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type JsonObject } from "../shared/zentao_client";

function summarizeProduct(product: JsonObject): JsonObject {
  return {
    id: product.id,
    name: product.name,
    status: product.status,
    PO: product.PO,
    QD: product.QD,
    RD: product.RD,
    totalStories: product.totalStories,
    activeStories: product.activeStories,
    reviewingStories: product.reviewingStories,
    totalBugs: product.totalBugs,
    unresolvedBugs: product.unresolvedBugs,
    releases: product.releases,
    raw: product,
  };
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
  const data = await client.getWebJsonViewData(`/product-view-${productId}.json`);
  const product = (typeof data.product === "object" && data.product !== null && !Array.isArray(data.product)) ? data.product as JsonObject : null;
  if (!product) {
    throw new Error(`Product payload missing for product ${productId}`);
  }

  printJson({
    ok: true,
    type: "product-overview",
    product: productId,
    title: data.title ?? null,
    overview: summarizeProduct(product),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

