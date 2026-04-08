import type { ReplyTemplate } from "../template_types";

export const genericAgentFallbackTemplate: ReplyTemplate = {
  name: "agent-generic-fallback",
  render(context) {
    return `已执行禅道脚本：${context.script}，但当前未配置自建应用专属回复模板。`;
  },
};
