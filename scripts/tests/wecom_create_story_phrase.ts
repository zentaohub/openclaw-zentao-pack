import { extractRouteArgs, loadIntentRoutes } from "../callbacks/wecom_route_resolver";
import { printJson } from "../shared/zentao_client";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const text = "帮我在测试最小 SOP 流程产品下面提个需求，标题叫测试最小 SOP 流程-新增入口，需求描述是支持从首页进入最小 SOP 流程测试入口，验收标准是首页能进入测试入口并且主流程能正常走通，评审人先填鲜敏创建需求";
  const route = loadIntentRoutes().find((item) => item.intent === "create-story");
  if (!route) {
    throw new Error("create-story route not found");
  }

  const args = extractRouteArgs(text, route, "LengLeng");
  assert(args.title === "测试最小 SOP 流程-新增入口", `unexpected title: ${args.title ?? "<empty>"}`);
  assert(args.spec === "支持从首页进入最小 SOP 流程测试入口", `unexpected spec: ${args.spec ?? "<empty>"}`);
  assert(args.verify === "首页能进入测试入口并且主流程能正常走通", `unexpected verify: ${args.verify ?? "<empty>"}`);
  assert(args.reviewer === "鲜敏", `unexpected reviewer: ${args.reviewer ?? "<empty>"}`);

  printJson({
    ok: true,
    checked: 4,
    args,
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
