import type { ReplyTemplate } from "./template_types";
import { loadAgentTemplateNamesFromIntentRouting } from "./agent_templates/_helpers";
import { queryMyStoriesAgentTemplate } from "./agent_templates/query-my-stories";
import { queryMyTasksAgentTemplate } from "./agent_templates/query-my-tasks";
import { requirementToTestcaseAgentTemplate } from "./agent_templates/requirement-to-testcase";
import { genericAgentFallbackTemplate } from "./agent_templates/generic-fallback";
import { routeAgentTemplates } from "./agent_templates/route_templates";

const routeTemplateNames = loadAgentTemplateNamesFromIntentRouting();

const AGENT_TEMPLATE_REGISTRY: Record<string, ReplyTemplate> = {
  ...routeAgentTemplates,
  "query-my-stories": queryMyStoriesAgentTemplate,
  "query-my-tasks": queryMyTasksAgentTemplate,
  "requirement-to-testcase": requirementToTestcaseAgentTemplate,
};

const missingTemplateNames = routeTemplateNames.filter((name) => !AGENT_TEMPLATE_REGISTRY[name]);
if (missingTemplateNames.length > 0) {
  throw new Error(`Missing dedicated agent templates for: ${missingTemplateNames.join(", ")}`);
}

export function resolveAgentReplyTemplate(templateName: string | undefined): ReplyTemplate {
  if (templateName && AGENT_TEMPLATE_REGISTRY[templateName]) {
    return AGENT_TEMPLATE_REGISTRY[templateName];
  }
  return genericAgentFallbackTemplate;
}
