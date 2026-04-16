import { extractRouteArgs, loadIntentRoutes } from "../callbacks/wecom_route_resolver";
import { printJson } from "../shared/zentao_client";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function requireRoute(intent: string) {
  const route = loadIntentRoutes().find((item) => item.intent === intent);
  if (!route) {
    throw new Error(`${intent} route not found`);
  }
  return route;
}

async function main(): Promise<void> {
  const createStoryRoute = requireRoute("create-story");
  const productKeywordArgs = extractRouteArgs(
    "查需求 演示产品研发链路-20260320",
    createStoryRoute,
    "LengLeng",
  );
  assert(
    !productKeywordArgs.product,
    `expected keyword-like product text not to be reduced to numeric id, got ${productKeywordArgs.product ?? "<empty>"}`,
  );

  const explicitProductIdArgs = extractRouteArgs(
    "查看产品20的需求",
    requireRoute("query-product-stories"),
    "LengLeng",
  );
  assert(explicitProductIdArgs.product === "20", `expected explicit product id 20, got ${explicitProductIdArgs.product ?? "<empty>"}`);

  const explicitStoryIdArgs = extractRouteArgs(
    "关闭需求123",
    requireRoute("update-story-status"),
    "LengLeng",
  );
  assert(explicitStoryIdArgs.story === "123", `expected explicit story id 123, got ${explicitStoryIdArgs.story ?? "<empty>"}`);

  printJson({
    ok: true,
    checked: 3,
    message: "wecom route numeric guard checks passed",
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
