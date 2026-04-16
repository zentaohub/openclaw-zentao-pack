import assert from "node:assert/strict";

import { shouldBypassZentaoLlm, shouldPreferFastGeneralAi } from "../callbacks/wecom_callback";
import { findContextualSemanticRoute, type SemanticRouteResolution } from "../callbacks/wecom_context_semantic_resolver";
import { findRouteMatch, loadIntentRoutes } from "../callbacks/wecom_route_resolver";
import { saveWecomSessionContextFromResult } from "../shared/wecom_session_context_store";

function assertIntent(
  resolution: SemanticRouteResolution | null,
  expectedIntent: string,
  label: string,
): void {
  assert.ok(resolution, `${label}: expected semantic resolution`);
  assert.equal(resolution.match.route.intent, expectedIntent, `${label}: unexpected intent`);
}

function main(): void {
  const userid = "regression-wecom-module-route";
  const routes = loadIntentRoutes();

  saveWecomSessionContextFromResult({
    userid,
    text: "看产品 智能客服平台-codex-20260323-01",
    intent: "query-products",
    args: {},
    result: {
      count: 1,
      items: [
        {
          id: "123",
          name: "智能客服平台-codex-20260323-01",
        },
      ],
    },
  });

  const semanticResolution = findContextualSemanticRoute("有哪些模块", userid, routes);
  assertIntent(semanticResolution, "query-product-modules", "semantic route");

  const directMatch = findRouteMatch("有哪些模块", routes);
  assert.ok(directMatch, "yaml trigger: expected direct route match");
  assert.equal(directMatch.route.intent, "query-product-modules", "yaml trigger: unexpected intent");

  assert.equal(shouldPreferFastGeneralAi("有哪些模块"), false, "should not prefer fast general ai");
  assert.equal(shouldBypassZentaoLlm("有哪些模块"), false, "should not bypass zentao llm");

  process.stdout.write("wecom module route regression passed\n");
}

main();
