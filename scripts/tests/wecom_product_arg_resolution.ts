import { printJson } from "../shared/zentao_client";
import { isPositiveIntegerArg, resolveProductArg, type ProductMatchCandidate } from "../callbacks/product_arg_resolution";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  assert(isPositiveIntegerArg("12"), "expected numeric product id to be accepted");
  assert(!isPositiveIntegerArg("测试最小 SOP 流程产品"), "expected product name not to be treated as numeric id");

  const matcher = async (text: string): Promise<ProductMatchCandidate[]> => {
    if (text.includes("测试最小SOP流程产品") || text.includes("测试最小 SOP 流程产品")) {
      return [{ id: "18", name: "测试最小SOP流程产品" }];
    }
    return [];
  };

  const resolved = await resolveProductArg({
    routeNeedsProduct: true,
    text: "帮我在试最小SOP流程产品下面提个需求",
    args: {
      userid: "LengLeng",
      product: "测试最小 SOP 流程产品",
      title: "测试最小 SOP 流程-新增入口",
    },
    lookupMatches: matcher,
  });
  assert(resolved.status === "resolved", `expected resolution status resolved, got ${resolved.status}`);
  assert(resolved.args.product === "18", `expected resolved product id 18, got ${resolved.args.product ?? "<empty>"}`);

  const unmatched = await resolveProductArg({
    routeNeedsProduct: true,
    text: "帮我在未知产品下面提个需求",
    args: {
      userid: "LengLeng",
      product: "未知产品",
      title: "测试需求",
    },
    lookupMatches: async () => [],
  });
  assert(unmatched.status === "unmatched", `expected unmatched status, got ${unmatched.status}`);
  assert(!("product" in unmatched.args), "expected unmatched named product to be removed before script execution");

  printJson({
    ok: true,
    checked: 4,
    message: "wecom product arg resolution checks passed",
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
