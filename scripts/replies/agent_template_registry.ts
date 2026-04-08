import type { ReplyTemplate } from "./template_types";
import { queryMyTasksAgentTemplate } from "./agent_templates/query-my-tasks";
import { genericAgentFallbackTemplate } from "./agent_templates/generic-fallback";

const AGENT_TEMPLATE_REGISTRY: Record<string, ReplyTemplate> = {
  "query-my-tasks": queryMyTasksAgentTemplate,
};

export function resolveAgentReplyTemplate(templateName: string | undefined): ReplyTemplate {
  if (templateName && AGENT_TEMPLATE_REGISTRY[templateName]) {
    return AGENT_TEMPLATE_REGISTRY[templateName];
  }
  return genericAgentFallbackTemplate;
}
