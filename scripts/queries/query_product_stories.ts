import { parseArgs } from "node:util";
import { printJson, type JsonObject, type JsonValue, ZentaoClient } from "../shared/zentao_client";
import { summarizeList } from "./_query_utils";

function extractItems(value: JsonValue | undefined): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  return [];
}

function toPositiveNumber(value: JsonValue | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function matchesProduct(story: JsonObject, productId: number): boolean {
  return toPositiveNumber(story.product) === productId;
}

function extractOverviewStoryCount(product: JsonObject | null): number {
  if (!product) {
    return 0;
  }

  const directCount = toPositiveNumber(product.totalStories);
  if (directCount !== null) {
    return directCount;
  }

  const groupedStories = typeof product.stories === "object" && product.stories !== null && !Array.isArray(product.stories)
    ? product.stories
    : null;
  if (!groupedStories) {
    return 0;
  }

  return Object.values(groupedStories).reduce<number>((sum, value) => {
    const current = Number(value);
    return sum + (Number.isFinite(current) && current > 0 ? current : 0);
  }, 0);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      product: { type: "string" },
      browse: { type: "string", default: "all" },
    },
    allowPositionals: false,
  });

  if (!values.product) throw new Error("Missing required option --product");
  const productId = Number(values.product);
  if (!Number.isFinite(productId) || productId <= 0) throw new Error(`Invalid --product value: ${values.product}`);

  const client = new ZentaoClient({ userid: values.userid });
  const [browseData, productViewData] = await Promise.all([
    client.getWebJsonViewData(`/story-browse-${productId}-${values.browse}-0-id_desc-0-100-1.json`),
    client.getWebJsonViewData(`/product-view-${productId}.json`),
  ]);
  const product = typeof productViewData.product === "object" && productViewData.product !== null && !Array.isArray(productViewData.product)
    ? productViewData.product as JsonObject
    : null;

  const browseProductId = toPositiveNumber(browseData.productID) ?? toPositiveNumber(browseData.product);
  const browseItems = extractItems(browseData.stories).filter((story) => matchesProduct(story, productId));
  const overviewStoryCount = extractOverviewStoryCount(product);
  const shouldFallbackToAllStories = (browseProductId !== null && browseProductId !== productId)
    || (browseItems.length === 0 && overviewStoryCount > 0);

  let items = browseItems;
  let source = "product-browse";

  if (shouldFallbackToAllStories) {
    const allStoriesData = await client.getWebJsonViewData("/my-work-story-all.json");
    const fallbackItems = extractItems(allStoriesData.stories).filter((story) => matchesProduct(story, productId));
    if (fallbackItems.length > 0 || browseItems.length === 0) {
      items = fallbackItems;
      source = "my-work-story-all";
    }
  }

  items = items.sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));

  printJson({
    ok: true,
    type: "product-stories",
    product: productId,
    browse: values.browse,
    title: productViewData.title ?? browseData.title ?? null,
    source,
    fallback_used: source !== "product-browse",
    overview_story_count: overviewStoryCount,
    count: items.length,
    items: summarizeList(items, ["id", "title", "status", "stage", "category", "pri", "estimate", "assignedTo", "openedBy", "reviewedBy"]),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});
