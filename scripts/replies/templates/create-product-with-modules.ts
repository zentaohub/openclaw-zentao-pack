import { asText, createActionTemplate, getNestedValue } from "./_helpers";

export const createProductWithModulesTemplate = createActionTemplate(
  "create-product-with-modules",
  () => "【产品初始化结果】成功",
  [
    {
      label: "产品",
      formatter: (context) =>
        `${asText(getNestedValue(context.result, "product.name"))}（ID：${asText(context.result.product_id)}）`,
    },
    {
      label: "模块创建",
      formatter: (context) => `成功 ${asText(context.result.created_module_count, "0")} 个`,
    },
    {
      label: "模块列表",
      formatter: (context) =>
        Array.isArray(context.result.module_names)
          ? context.result.module_names.map((item: unknown) => asText(item, "")).filter(Boolean).join("、") || "-"
          : "-",
    },
  ],
);
