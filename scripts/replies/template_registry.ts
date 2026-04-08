import type { ReplyTemplate } from "./template_types";
import { assignBugTemplate } from "./templates/assign-bug";
import { createBugTemplate } from "./templates/create-bug";
import { createProductTemplate } from "./templates/create-product";
import { createProductModulesTemplate } from "./templates/create-product-modules";
import { createProductWithModulesTemplate } from "./templates/create-product-with-modules";
import { createReleaseTemplate } from "./templates/create-release";
import { createStoryTemplate } from "./templates/create-story";
import { createTaskTemplate } from "./templates/create-task";
import { createTestcaseTemplate } from "./templates/create-testcase";
import { createTesttaskTemplate } from "./templates/create-testtask";
import { genericFallbackTemplate } from "./templates/generic-fallback";
import { linkReleaseItemsTemplate } from "./templates/link-release-items";
import { linkTesttaskCasesTemplate } from "./templates/link-testtask-cases";
import { queryAcceptanceOverviewTemplate } from "./templates/query-acceptance-overview";
import { queryBugDetailTemplate } from "./templates/query-bug-detail";
import { queryClosureItemsTemplate } from "./templates/query-closure-items";
import { queryClosureReadinessTemplate } from "./templates/query-closure-readiness";
import { queryExecutionStoriesTemplate } from "./templates/query-execution-stories";
import { queryExecutionTasksTemplate } from "./templates/query-execution-tasks";
import { queryExecutionTeamTemplate } from "./templates/query-execution-team";
import { queryExecutionsTemplate } from "./templates/query-executions";
import { queryGoLiveChecklistTemplate } from "./templates/query-go-live-checklist";
import { queryMyBugsTemplate } from "./templates/query-my-bugs";
import { queryMyTasksTemplate } from "./templates/query-my-tasks";
import { queryProductModulesTemplate } from "./templates/query-product-modules";
import { queryProductStoriesTemplate } from "./templates/query-product-stories";
import { queryProductsTemplate } from "./templates/query-products";
import { queryProjectTeamTemplate } from "./templates/query-project-team";
import { queryProjectsTemplate } from "./templates/query-projects";
import { queryReleaseDetailTemplate } from "./templates/query-release-detail";
import { queryReleasesTemplate } from "./templates/query-releases";
import { queryStoryDetailTemplate } from "./templates/query-story-detail";
import { queryTaskDetailTemplate } from "./templates/query-task-detail";
import { queryTestExitReadinessTemplate } from "./templates/query-test-exit-readiness";
import { queryTestcasesTemplate } from "./templates/query-testcases";
import { queryTesttaskCasesTemplate } from "./templates/query-testtask-cases";
import { queryTesttaskDetailTemplate } from "./templates/query-testtask-detail";
import { queryTesttasksTemplate } from "./templates/query-testtasks";
import { reviewStoryTemplate } from "./templates/review-story";
import { runTesttaskCaseTemplate } from "./templates/run-testtask-case";
import { updateBugStatusTemplate } from "./templates/update-bug-status";
import { updateReleaseStatusTemplate } from "./templates/update-release-status";
import { updateStoryStatusTemplate } from "./templates/update-story-status";
import { updateTaskStatusTemplate } from "./templates/update-task-status";
const TEMPLATE_REGISTRY: Record<string, ReplyTemplate> = {
  "assign-bug": assignBugTemplate,
  "create-bug": createBugTemplate,
  "create-product": createProductTemplate,
  "create-product-modules": createProductModulesTemplate,
  "create-product-with-modules": createProductWithModulesTemplate,
  "create-release": createReleaseTemplate,
  "create-story": createStoryTemplate,
  "create-task": createTaskTemplate,
  "create-testcase": createTestcaseTemplate,
  "create-testtask": createTesttaskTemplate,
  "link-release-items": linkReleaseItemsTemplate,
  "link-testtask-cases": linkTesttaskCasesTemplate,
  "query-acceptance-overview": queryAcceptanceOverviewTemplate,
  "query-bug-detail": queryBugDetailTemplate,
  "query-closure-items": queryClosureItemsTemplate,
  "query-closure-readiness": queryClosureReadinessTemplate,
  "query-execution-stories": queryExecutionStoriesTemplate,
  "query-execution-tasks": queryExecutionTasksTemplate,
  "query-execution-team": queryExecutionTeamTemplate,
  "query-executions": queryExecutionsTemplate,
  "query-go-live-checklist": queryGoLiveChecklistTemplate,
  "query-my-bugs": queryMyBugsTemplate,
  "query-my-tasks": queryMyTasksTemplate,
  "query-product-modules": queryProductModulesTemplate,
  "query-product-stories": queryProductStoriesTemplate,
  "query-products": queryProductsTemplate,
  "query-project-team": queryProjectTeamTemplate,
  "query-projects": queryProjectsTemplate,
  "query-release-detail": queryReleaseDetailTemplate,
  "query-releases": queryReleasesTemplate,
  "query-story-detail": queryStoryDetailTemplate,
  "query-task-detail": queryTaskDetailTemplate,
  "query-test-exit-readiness": queryTestExitReadinessTemplate,
  "query-testcases": queryTestcasesTemplate,
  "query-testtask-cases": queryTesttaskCasesTemplate,
  "query-testtask-detail": queryTesttaskDetailTemplate,
  "query-testtasks": queryTesttasksTemplate,
  "review-story": reviewStoryTemplate,
  "run-testtask-case": runTesttaskCaseTemplate,
  "update-bug-status": updateBugStatusTemplate,
  "update-release-status": updateReleaseStatusTemplate,
  "update-story-status": updateStoryStatusTemplate,
  "update-task-status": updateTaskStatusTemplate,
};

export function resolveReplyTemplate(templateName: string | undefined): ReplyTemplate {
  if (templateName && TEMPLATE_REGISTRY[templateName]) {
    return TEMPLATE_REGISTRY[templateName];
  }
  return genericFallbackTemplate;
}
