import { loadAcceptanceSnapshot } from "../queries/_acceptance_utils";
import type { JsonObject, JsonValue, ZentaoBug, ZentaoClient, ZentaoTask } from "../shared/zentao_client";
import type { DigestFocusItem, DigestLink, RoleDigestData, ScheduledDigestConfig, ScheduledDigestRole, ScheduledDigestTimeslot, ScheduledDigestUserConfig } from "./types";
import { asNumber, asString, buildWebLink, computeAgeDays, computeAgeHours, computeOverdueDays, dedupeFocusItems, extractObjects, isBugClosed, isHighPriorityBug, isJsonObject, isTaskDone, priorityNumber, toHtmlRoute, truncateText } from "./utils";

interface ExecutionContext {
  executionId: number;
  productId: number;
  testtaskId: number;
  executionName: string;
  projectId: number;
}

interface ExecutionQualitySummary {
  executionId: number;
  productId: number;
  executionName: string;
  testtaskId: number;
  failedCases: number;
  blockedCases: number;
  unrunCases: number;
  unresolvedBugs: number;
}

interface ExecutionClosureSummary {
  executionId: number;
  productId: number;
  executionName: string;
  openTasks: number;
  unresolvedBugs: number;
  activeStories: number;
}

export async function collectRoleDigests(
  client: ZentaoClient,
  config: ScheduledDigestConfig,
  user: ScheduledDigestUserConfig,
  timeslot: ScheduledDigestTimeslot,
): Promise<RoleDigestData[]> {
  const digests: RoleDigestData[] = [];
  for (const role of user.roles) {
    switch (role) {
      case "pm":
        digests.push(await collectPmDigest(client, config, user, timeslot));
        break;
      case "dev":
        digests.push(await collectDevDigest(client, config, user, timeslot));
        break;
      case "qa":
        digests.push(await collectQaDigest(client, config, user, timeslot));
        break;
      case "manager":
        digests.push(await collectManagerDigest(client, config, user, timeslot));
        break;
      default:
        break;
    }
  }
  return digests;
}

async function collectDevDigest(
  client: ZentaoClient,
  config: ScheduledDigestConfig,
  user: ScheduledDigestUserConfig,
  timeslot: ScheduledDigestTimeslot,
): Promise<RoleDigestData> {
  const [taskResult, bugResult] = await Promise.all([
    client.getMyTasks({ status: "all", limit: 50, pageSize: 100 }),
    client.getMyBugs({ limit: 50 }),
  ]);

  const activeTasks = taskResult.tasks.filter((task) => !isTaskDone(asString(task.status)));
  const overdueTasks = activeTasks.filter((task) => computeOverdueDays(asString(task.deadline), config.timezone) > 0);
  const blockedTasks = activeTasks.filter((task) => new Set(["blocked"]).has((asString(task.status) ?? "").toLowerCase()));
  const openBugs = bugResult.bugs.filter((bug) => !isBugClosed(asString(bug.status)));
  const highOpenBugs = openBugs.filter((bug) => isHighPriorityBug(bug));
  const overdueOpenBugs = openBugs.filter((bug) => resolveBugOverdueDays(bug) >= config.riskRules.bug.overdueDays);

  const riskItems: DigestFocusItem[] = [];
  const todoItems: DigestFocusItem[] = [];

  for (const task of blockedTasks) {
    const overdueDays = computeOverdueDays(asString(task.deadline), config.timezone);
    riskItems.push({
      key: `task-blocked-${String(task.id ?? "")}`,
      bucket: "risk",
      severity: overdueDays > 0 && config.riskRules.task.blockedOverdueAsP0 ? "p0" : "p1",
      text: overdueDays > 0
        ? `任务#${String(task.id ?? "-")} ${truncateText(asString(task.name), config.strategy.titleMaxChars)}，超期 ${overdueDays} 天且 blocked`
        : `任务#${String(task.id ?? "-")} ${truncateText(asString(task.name), config.strategy.titleMaxChars)}，当前 blocked`,
      url: task.id ? buildTaskLink(client.baseUrl, Number(task.id)) : undefined,
    });
  }

  for (const task of sortTasks(overdueTasks).slice(0, 3)) {
    const overdueDays = computeOverdueDays(asString(task.deadline), config.timezone);
    riskItems.push({
      key: `task-overdue-${String(task.id ?? "")}`,
      bucket: "risk",
      severity: "p1",
      text: `任务#${String(task.id ?? "-")} ${truncateText(asString(task.name), config.strategy.titleMaxChars)}，超期 ${overdueDays} 天`,
      url: task.id ? buildTaskLink(client.baseUrl, Number(task.id)) : undefined,
    });
  }

  for (const bug of sortBugs(highOpenBugs).slice(0, 3)) {
    const ageHours = resolveBugAgeHours(bug);
    const threshold = priorityNumber(bug.pri) <= 1 || priorityNumber(bug.severity) <= 1
      ? config.riskRules.highBug.p1Hours
      : config.riskRules.highBug.p2Hours;
    const isOverdue = ageHours !== null && ageHours >= threshold;
    riskItems.push({
      key: `bug-high-${String(bug.id ?? "")}`,
      bucket: "risk",
      severity: isOverdue ? "p0" : "p1",
      text: isOverdue
        ? `Bug#${String(bug.id ?? "-")} ${truncateText(asString(bug.title), config.strategy.titleMaxChars)}，P${formatPriority(bug.pri)} 已超期`
        : `Bug#${String(bug.id ?? "-")} ${truncateText(asString(bug.title), config.strategy.titleMaxChars)}，P${formatPriority(bug.pri)} 未关闭`,
      url: bug.id ? buildBugLink(client.baseUrl, Number(bug.id)) : undefined,
    });
  }

  for (const bug of sortBugs(overdueOpenBugs).slice(0, 2)) {
    const overdueDays = resolveBugOverdueDays(bug);
    riskItems.push({
      key: `bug-overdue-${String(bug.id ?? "")}`,
      bucket: "risk",
      severity: overdueDays >= config.riskRules.bug.overdueDays + 3 ? "p0" : "p1",
      text: `Bug#${String(bug.id ?? "-")} ${truncateText(asString(bug.title), config.strategy.titleMaxChars)}，待处理 ${overdueDays} 天`,
      url: bug.id ? buildBugLink(client.baseUrl, Number(bug.id)) : undefined,
    });
  }

  for (const task of sortTasks(activeTasks).slice(0, 3)) {
    todoItems.push({
      key: `task-todo-${String(task.id ?? "")}`,
      bucket: "todo",
      severity: computeOverdueDays(asString(task.deadline), config.timezone) > 0 ? "p1" : "info",
      text: buildTaskTodoText(task, config),
      url: task.id ? buildTaskLink(client.baseUrl, Number(task.id)) : undefined,
    });
  }

  for (const bug of sortBugs(openBugs).slice(0, 2)) {
    const overdueDays = resolveBugOverdueDays(bug);
    todoItems.push({
      key: `bug-todo-${String(bug.id ?? "")}`,
      bucket: "todo",
      severity: isHighPriorityBug(bug) ? "p1" : "info",
      text: overdueDays > 0
        ? `Bug#${String(bug.id ?? "-")} ${truncateText(asString(bug.title), config.strategy.titleMaxChars)}，待处理 ${overdueDays} 天`
        : `Bug#${String(bug.id ?? "-")} ${truncateText(asString(bug.title), config.strategy.titleMaxChars)}，${asString(bug.status) ?? "未关闭"}`,
      url: bug.id ? buildBugLink(client.baseUrl, Number(bug.id)) : undefined,
    });
  }

  const riskCount = dedupeFocusItems(riskItems).length;

  return {
    role: "dev",
    title: timeslot === "morning" ? "早报｜研发" : "晚报｜研发",
    overviewParts: timeslot === "morning"
      ? [`待办 ${activeTasks.length}`, `超期 ${overdueTasks.length}`, `Bug ${openBugs.length}`, `阻塞 ${blockedTasks.length}`]
      : [`未收口 ${activeTasks.length}`, `超期 ${overdueTasks.length}`, `Bug ${openBugs.length}`, `风险 ${riskCount}`],
    riskItems: dedupeFocusItems(riskItems),
    todoItems: dedupeFocusItems(todoItems),
    links: [
      {
        label: "查看我的任务",
        url: buildWebLink(client.baseUrl, toHtmlRoute(client.webMyTaskAssignedRoute)),
      },
      {
        label: "查看我的Bug",
        url: buildWebLink(client.baseUrl, toHtmlRoute(client.webMyBugAssignedRoute)),
      },
    ],
    metrics: {
      active_tasks: activeTasks.length,
      overdue_tasks: overdueTasks.length,
      blocked_tasks: blockedTasks.length,
      open_bugs: openBugs.length,
      high_open_bugs: highOpenBugs.length,
    },
  };
}

async function collectPmDigest(
  client: ZentaoClient,
  config: ScheduledDigestConfig,
  user: ScheduledDigestUserConfig,
  timeslot: ScheduledDigestTimeslot,
): Promise<RoleDigestData> {
  const [storyViews, productViews] = await Promise.all([
    Promise.all([
      client.getWebJsonViewData("/my-work-story-assignedTo.json"),
      ...user.scope.products.map((productId) => client.getWebJsonViewData(`/story-browse-${productId}-all-0-id_desc-0-100-1.json`)),
    ]),
    Promise.all(user.scope.products.map((productId) => client.getWebJsonViewData(`/product-view-${productId}.json`))),
  ]);
  const stories = dedupeById(storyViews.flatMap((view) => extractObjects(view.stories)));
  const activeStories = stories.filter((story) => !isStoryClosed(asString(story.status)));
  const highStories = activeStories.filter((story) => priorityNumber(story.pri) <= 2);
  const overdueStories = activeStories.filter((story) => {
    return computeOverdueDays(
      asString(story.deadline) ?? asString(story.endDate) ?? asString(story.end),
      config.timezone,
    ) > 0;
  });

  const riskItems: DigestFocusItem[] = overdueStories.slice(0, 3).map((story) => {
    const overdueDays = computeOverdueDays(
      asString(story.deadline) ?? asString(story.endDate) ?? asString(story.end),
      config.timezone,
    );
    return {
      key: `story-overdue-${String(story.id ?? "")}`,
      bucket: "risk" as const,
      severity: "p1" as const,
      text: `需求#${String(story.id ?? "-")} ${truncateText(asString(story.title), config.strategy.titleMaxChars)}，已延期 ${overdueDays} 天`,
      url: story.id ? buildStoryLink(client.baseUrl, Number(story.id)) : undefined,
    };
  });

  const todoItems: DigestFocusItem[] = highStories.slice(0, 3).map((story) => {
    const severity: "p1" | "info" = priorityNumber(story.pri) <= 1 ? "p1" : "info";
    return {
      key: `story-high-${String(story.id ?? "")}`,
      bucket: "todo" as const,
      severity,
      text: `需求#${String(story.id ?? "-")} ${truncateText(asString(story.title), config.strategy.titleMaxChars)}，P${formatPriority(story.pri)} 待推进`,
      url: story.id ? buildStoryLink(client.baseUrl, Number(story.id)) : undefined,
    };
  });

  const defaultLinks: DigestLink[] = [
    {
      label: "查看我的需求",
      url: buildWebLink(client.baseUrl, "/my-work-story-assignedTo.html"),
    },
  ];
  if (user.scope.products.length === 1) {
    defaultLinks.push({
      label: "查看产品概况",
      url: buildWebLink(client.baseUrl, `/product-view-${user.scope.products[0]}.html`),
    });
  }

  if (activeStories.length === 0) {
    const productFallback = buildPmProductFallback(
      client,
      config,
      user.scope.products,
      productViews,
    );
    riskItems.push(...productFallback.riskItems);
    todoItems.push(...productFallback.todoItems);
    for (const link of productFallback.links) {
      if (!defaultLinks.some((item) => item.label === link.label)) {
        defaultLinks.push(link);
      }
    }
  }

  return {
    role: "pm",
    title: timeslot === "morning" ? "早报｜产品" : "晚报｜产品",
    overviewParts: timeslot === "morning"
      ? [`需求 ${activeStories.length}`, `高优 ${highStories.length}`, `延期 ${overdueStories.length}`]
      : [`需求 ${activeStories.length}`, `高优 ${highStories.length}`, `风险 ${riskItems.length}`],
    riskItems: dedupeFocusItems(riskItems),
    todoItems: dedupeFocusItems(todoItems),
    links: defaultLinks.slice(0, config.strategy.maxLinks),
    metrics: {
      active_stories: activeStories.length,
      high_stories: highStories.length,
      overdue_stories: overdueStories.length,
    },
  };
}

function buildPmProductFallback(
  client: ZentaoClient,
  config: ScheduledDigestConfig,
  productIds: number[],
  productViews: JsonObject[],
): {
  riskItems: DigestFocusItem[];
  todoItems: DigestFocusItem[];
  links: DigestLink[];
} {
  const riskItems: DigestFocusItem[] = [];
  const todoItems: DigestFocusItem[] = [];
  const links: DigestLink[] = [];

  for (let index = 0; index < productViews.length; index += 1) {
    const productId = productIds[index];
    const view = productViews[index];
    const product = isJsonObject(view.product) ? view.product : null;
    if (!product || productId <= 0) {
      continue;
    }

    const productName = truncateText(asString(product.name) ?? `产品#${productId}`, config.strategy.titleMaxChars);
    const reviewingStories = asNumber(product.reviewingStories ?? (isJsonObject(product.stories) ? product.stories.reviewing : 0));
    const activeStories = asNumber(product.activeStories ?? (isJsonObject(product.stories) ? product.stories.active : 0));
    const unresolvedBugs = asNumber(product.unresolvedBugs ?? product.bugs);
    const totalReleases = asNumber(product.releases);

    if (reviewingStories > 0) {
      riskItems.push({
        key: `pm-product-reviewing-${productId}`,
        bucket: "risk",
        severity: "p1",
        text: `产品「${productName}」有 ${reviewingStories} 条需求待评审`,
        url: buildWebLink(client.baseUrl, `/product-view-${productId}.html`),
      });
    }

    if (unresolvedBugs > 0) {
      riskItems.push({
        key: `pm-product-bug-${productId}`,
        bucket: "risk",
        severity: unresolvedBugs >= 3 ? "p0" : "p1",
        text: `产品「${productName}」未解决 Bug ${unresolvedBugs} 个`,
        url: buildWebLink(client.baseUrl, `/bug-browse-${productId}-all-0-id_desc-0-100-1.html`),
      });
    }

    if (activeStories > 0 || reviewingStories > 0) {
      todoItems.push({
        key: `pm-product-story-follow-${productId}`,
        bucket: "todo",
        severity: reviewingStories > 0 ? "p1" : "info",
        text: `产品「${productName}」需求待推进 ${activeStories + reviewingStories} 条`,
        url: buildWebLink(client.baseUrl, `/product-view-${productId}.html`),
      });
    } else if (totalReleases > 0) {
      todoItems.push({
        key: `pm-product-release-follow-${productId}`,
        bucket: "todo",
        severity: "info",
        text: `产品「${productName}」已有发布 ${totalReleases} 次，建议关注交付节奏`,
        url: buildWebLink(client.baseUrl, `/product-view-${productId}.html`),
      });
    }

    links.push({
      label: `查看产品${productId}`,
      url: buildWebLink(client.baseUrl, `/product-view-${productId}.html`),
    });
  }

  return {
    riskItems,
    todoItems,
    links,
  };
}

async function collectQaDigest(
  client: ZentaoClient,
  config: ScheduledDigestConfig,
  user: ScheduledDigestUserConfig,
  timeslot: ScheduledDigestTimeslot,
): Promise<RoleDigestData> {
  const myBugResult = await client.getMyBugs({ limit: 50 });
  const openBugs = myBugResult.bugs.filter((bug) => !isBugClosed(asString(bug.status)));
  const executionContexts = await resolveExecutionContexts(client, user.scope.executions);
  const qualitySummaries = await Promise.all(executionContexts.map((context) => loadExecutionQualitySummary(client, context)));
  const overdueOpenBugs = openBugs.filter((bug) => resolveBugOverdueDays(bug) >= config.riskRules.bug.overdueDays);

  const riskItems: DigestFocusItem[] = [];
  const todoItems: DigestFocusItem[] = [];

  for (const summary of qualitySummaries) {
    if (summary.failedCases === 0 && summary.blockedCases === 0 && summary.unrunCases === 0 && summary.unresolvedBugs === 0) {
      continue;
    }
    const severity = summary.failedCases > 0 || summary.blockedCases > 0 || summary.unresolvedBugs > 0 ? "p0" : "p1";
    riskItems.push({
      key: `qa-quality-${summary.executionId}`,
      bucket: "risk",
      severity,
      text: `执行「${truncateText(summary.executionName, config.strategy.titleMaxChars)}」准出未通过：失败 ${summary.failedCases}，阻塞 ${summary.blockedCases}，Bug ${summary.unresolvedBugs}`,
      url: buildExecutionLink(client.baseUrl, summary.executionId),
    });
  }

  for (const bug of sortBugs(overdueOpenBugs).slice(0, 2)) {
    const overdueDays = resolveBugOverdueDays(bug);
    riskItems.push({
      key: `qa-bug-overdue-${String(bug.id ?? "")}`,
      bucket: "risk",
      severity: overdueDays >= config.riskRules.bug.overdueDays + 3 ? "p0" : "p1",
      text: `Bug#${String(bug.id ?? "-")} ${truncateText(asString(bug.title), config.strategy.titleMaxChars)}，待验证 ${overdueDays} 天`,
      url: bug.id ? buildBugLink(client.baseUrl, Number(bug.id)) : undefined,
    });
  }

  for (const bug of sortBugs(openBugs).slice(0, 3)) {
    const overdueDays = resolveBugOverdueDays(bug);
    todoItems.push({
      key: `qa-bug-${String(bug.id ?? "")}`,
      bucket: "todo",
      severity: isHighPriorityBug(bug) ? "p1" : "info",
      text: overdueDays > 0
        ? `Bug#${String(bug.id ?? "-")} ${truncateText(asString(bug.title), config.strategy.titleMaxChars)}，待验证 ${overdueDays} 天`
        : `Bug#${String(bug.id ?? "-")} ${truncateText(asString(bug.title), config.strategy.titleMaxChars)}，待验证`,
      url: bug.id ? buildBugLink(client.baseUrl, Number(bug.id)) : undefined,
    });
  }

  const totalUnresolvedBugs = qualitySummaries.reduce((sum, item) => sum + item.unresolvedBugs, 0);

  return {
    role: "qa",
    title: timeslot === "morning" ? "早报｜测试" : "晚报｜测试",
    overviewParts: timeslot === "morning"
      ? [`待验证Bug ${openBugs.length}`, `执行 ${qualitySummaries.length}`, `未关闭 ${totalUnresolvedBugs}`, `风险 ${riskItems.length}`]
      : [`待验证Bug ${openBugs.length}`, `执行 ${qualitySummaries.length}`, `风险 ${riskItems.length}`],
    riskItems: dedupeFocusItems(riskItems),
    todoItems: dedupeFocusItems(todoItems),
    links: [
      {
        label: "查看测试详情",
        url: buildWebLink(client.baseUrl, "/testtask-browse-0-0-all-id_desc-0-100-1.html"),
      },
      {
        label: "查看Bug",
        url: buildWebLink(client.baseUrl, toHtmlRoute(client.webMyBugAssignedRoute)),
      },
    ],
    metrics: {
      verify_bugs: openBugs.length,
      scoped_executions: qualitySummaries.length,
      unresolved_bugs: totalUnresolvedBugs,
    },
  };
}

async function collectManagerDigest(
  client: ZentaoClient,
  config: ScheduledDigestConfig,
  user: ScheduledDigestUserConfig,
  timeslot: ScheduledDigestTimeslot,
): Promise<RoleDigestData> {
  const [projectView, executionView] = await Promise.all([
    client.getWebJsonViewData("/project-browse-all-all-0.json"),
    client.getWebJsonViewData("/execution-all.json"),
  ]);

  const allProjects = extractObjects(projectView.projectStats);
  const allExecutions = extractObjects(executionView.executionStats);
  const scopedExecutions = filterExecutions(allExecutions, user.scope);
  const inferredProjectIds = new Set<number>(scopedExecutions.map((item) => asNumber(item.project ?? item.parent)).filter((item) => item > 0));
  const scopedProjects = filterProjects(allProjects, user.scope, inferredProjectIds);

  const delayedProjects = scopedProjects.filter((project) => isDateDelayed(project, config.timezone));
  const delayedExecutions = scopedExecutions.filter((execution) => isDateDelayed(execution, config.timezone));
  const executionContexts = await resolveExecutionContexts(
    client,
    Array.from(new Set(scopedExecutions.map((execution) => asNumber(execution.id)).filter((id) => id > 0))),
  );
  const qualitySummaries = await Promise.all(executionContexts.map((context) => loadExecutionQualitySummary(client, context)));
  const closureSummaries = timeslot === "evening"
    ? await Promise.all(executionContexts.map((context) => loadExecutionClosureSummary(client, context)))
    : [];

  const riskItems: DigestFocusItem[] = [];
  const todoItems: DigestFocusItem[] = [];

  for (const project of delayedProjects.slice(0, 2)) {
    const delayDays = resolveDelayDays(project, config.timezone);
    riskItems.push({
      key: `project-delay-${String(project.id ?? "")}`,
      bucket: "risk",
      severity: "p0",
      text: `项目「${truncateText(asString(project.name), config.strategy.titleMaxChars)}」已延期 ${delayDays} 天`,
      url: project.id ? buildProjectLink(client.baseUrl, Number(project.id)) : undefined,
    });
  }

  for (const execution of delayedExecutions.slice(0, 2)) {
    const delayDays = resolveDelayDays(execution, config.timezone);
    riskItems.push({
      key: `execution-delay-${String(execution.id ?? "")}`,
      bucket: "risk",
      severity: "p0",
      text: `执行「${truncateText(asString(execution.name), config.strategy.titleMaxChars)}」已延期 ${delayDays} 天`,
      url: execution.id ? buildExecutionLink(client.baseUrl, Number(execution.id)) : undefined,
    });
  }

  for (const summary of qualitySummaries) {
    if (summary.failedCases === 0 && summary.blockedCases === 0 && summary.unresolvedBugs === 0) {
      continue;
    }
    riskItems.push({
      key: `manager-quality-${summary.executionId}`,
      bucket: "risk",
      severity: "p0",
      text: `执行「${truncateText(summary.executionName, config.strategy.titleMaxChars)}」准出未通过：失败 ${summary.failedCases}，Bug ${summary.unresolvedBugs}`,
      url: buildExecutionLink(client.baseUrl, summary.executionId),
    });
  }

  for (const summary of closureSummaries) {
    if (summary.openTasks === 0 && summary.unresolvedBugs === 0 && summary.activeStories === 0) {
      continue;
    }
    todoItems.push({
      key: `manager-closure-${summary.executionId}`,
      bucket: "todo",
      severity: summary.unresolvedBugs > 0 ? "p1" : "info",
      text: `执行「${truncateText(summary.executionName, config.strategy.titleMaxChars)}」关闭准备不足：任务 ${summary.openTasks}，Bug ${summary.unresolvedBugs}`,
      url: buildExecutionLink(client.baseUrl, summary.executionId),
    });
  }

  const highRiskCount = dedupeFocusItems(riskItems).length;

  return {
    role: "manager",
    title: timeslot === "morning" ? "早报｜管理" : "晚报｜管理",
    overviewParts: [
      `项目 ${scopedProjects.length}`,
      `延期 ${delayedProjects.length + delayedExecutions.length}`,
      `高风险 ${highRiskCount}`,
    ],
    riskItems: dedupeFocusItems(riskItems),
    todoItems: dedupeFocusItems(todoItems),
    links: [
      {
        label: "查看项目进度",
        url: buildWebLink(client.baseUrl, "/project-browse-all-all-0.html"),
      },
      {
        label: "查看执行列表",
        url: buildWebLink(client.baseUrl, "/execution-all.html"),
      },
    ],
    metrics: {
      scoped_projects: scopedProjects.length,
      scoped_executions: scopedExecutions.length,
      delayed_projects: delayedProjects.length,
      delayed_executions: delayedExecutions.length,
      high_risk_items: highRiskCount,
    },
  };
}

function sortTasks(tasks: ZentaoTask[]): ZentaoTask[] {
  return [...tasks].sort((left, right) => {
    const leftPriority = priorityNumber(left.pri);
    const rightPriority = priorityNumber(right.pri);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return Number(right.id ?? 0) - Number(left.id ?? 0);
  });
}

function sortBugs(bugs: ZentaoBug[]): ZentaoBug[] {
  return [...bugs].sort((left, right) => {
    const leftPriority = Math.min(priorityNumber(left.pri), priorityNumber(left.severity));
    const rightPriority = Math.min(priorityNumber(right.pri), priorityNumber(right.severity));
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return Number(right.id ?? 0) - Number(left.id ?? 0);
  });
}

function buildTaskTodoText(task: ZentaoTask, config: ScheduledDigestConfig): string {
  const overdueDays = computeOverdueDays(asString(task.deadline), config.timezone);
  const title = truncateText(asString(task.name), config.strategy.titleMaxChars);
  if (overdueDays > 0) {
    return `任务#${String(task.id ?? "-")} ${title}，超期 ${overdueDays} 天`;
  }
  if ((asString(task.status) ?? "").toLowerCase() === "blocked") {
    return `任务#${String(task.id ?? "-")} ${title}，当前 blocked`;
  }
  return `任务#${String(task.id ?? "-")} ${title}，${asString(task.status) ?? "待处理"}`;
}

function resolveBugAgeHours(bug: ZentaoBug): number | null {
  return (
    computeAgeHours(asString(bug.openedDate)) ??
    computeAgeHours(asString((bug as JsonObject).activatedDate)) ??
    computeAgeHours(asString((bug as JsonObject).assignedDate))
  );
}

function resolveBugOverdueDays(bug: ZentaoBug): number {
  return (
    computeAgeDays(asString(bug.openedDate)) ||
    computeAgeDays(asString((bug as JsonObject).activatedDate)) ||
    computeAgeDays(asString((bug as JsonObject).assignedDate))
  );
}

function formatPriority(value: JsonValue | undefined): string {
  const parsed = asNumber(value);
  return parsed > 0 ? String(parsed) : "-";
}

function dedupeById(items: JsonObject[]): JsonObject[] {
  const map = new Map<number, JsonObject>();
  for (const item of items) {
    const id = asNumber(item.id);
    if (id <= 0) {
      continue;
    }
    map.set(id, { ...(map.get(id) ?? {}), ...item });
  }
  return Array.from(map.values()).sort((left, right) => asNumber(right.id) - asNumber(left.id));
}

function isStoryClosed(status: string | undefined): boolean {
  return new Set(["closed", "rejected", "suspended"]).has((status ?? "").toLowerCase());
}

async function resolveExecutionContexts(client: ZentaoClient, executionIds: number[]): Promise<ExecutionContext[]> {
  if (executionIds.length === 0) {
    return [];
  }
  const browse = await client.getWebJsonViewData("/testtask-browse-0-0-all-id_desc-0-100-1.json");
  const tasks = extractObjects(browse.tasks).sort((left, right) => asNumber(right.id) - asNumber(left.id));
  const contexts = new Map<number, ExecutionContext>();
  for (const task of tasks) {
    const executionId = asNumber(task.execution);
    const productId = asNumber(task.product);
    if (!executionIds.includes(executionId) || productId <= 0 || contexts.has(executionId)) {
      continue;
    }
    contexts.set(executionId, {
      executionId,
      productId,
      testtaskId: asNumber(task.id),
      executionName: asString(task.executionName) ?? asString(task.name) ?? `执行#${executionId}`,
      projectId: asNumber(task.project),
    });
  }
  return executionIds.map((executionId) => contexts.get(executionId)).filter((item): item is ExecutionContext => Boolean(item));
}

async function loadExecutionQualitySummary(
  client: ZentaoClient,
  context: ExecutionContext,
): Promise<ExecutionQualitySummary> {
  const [testtaskDetail, caseView, bugView] = await Promise.all([
    client.getWebJsonViewData(`/testtask-view-${context.testtaskId}.json`),
    client.getWebJsonViewData(`/testtask-cases-${context.testtaskId}-all-0-id_desc-0-100-1.json`),
    client.getWebJsonViewData(`/bug-browse-${context.productId}-all-0-id_desc-0-100-1.json`),
  ]);

  const detailTask = isJsonObject(testtaskDetail.task)
    ? testtaskDetail.task
    : isJsonObject(testtaskDetail)
      ? testtaskDetail
      : {};
  const runs = extractObjects(caseView.runs);
  const relatedBugs = extractObjects(bugView.bugs).filter((bug) => asNumber(bug.testtask) === context.testtaskId);

  return {
    executionId: context.executionId,
    productId: context.productId,
    executionName: asString(detailTask.name) ?? context.executionName,
    testtaskId: context.testtaskId,
    failedCases: runs.filter((run) => asString(run.lastRunResult) === "fail").length,
    blockedCases: runs.filter((run) => asString(run.lastRunResult) === "blocked").length,
    unrunCases: runs.filter((run) => !asString(run.lastRunResult)).length,
    unresolvedBugs: relatedBugs.filter((bug) => !new Set(["closed", "resolved", "resolve"]).has((asString(bug.status) ?? "").toLowerCase())).length,
  };
}

async function loadExecutionClosureSummary(
  client: ZentaoClient,
  context: ExecutionContext,
): Promise<ExecutionClosureSummary> {
  const snapshot = await loadAcceptanceSnapshot(client, context.productId, context.executionId);
  return {
    executionId: context.executionId,
    productId: context.productId,
    executionName: context.executionName,
    openTasks: snapshot.tasks.filter((task) => !isTaskDone(asString(task.status))).length,
    unresolvedBugs: snapshot.productBugs.filter((bug) => !new Set(["closed", "resolved", "resolve"]).has((asString(bug.status) ?? "").toLowerCase())).length,
    activeStories: snapshot.stories.filter((story) => !isStoryClosed(asString(story.status))).length,
  };
}

function filterProjects(items: JsonObject[], scope: ScheduledDigestUserConfig["scope"], inferredProjectIds: Set<number>): JsonObject[] {
  if (scope.projects.length > 0) {
    return items.filter((item) => scope.projects.includes(asNumber(item.id)));
  }
  if (inferredProjectIds.size > 0) {
    return items.filter((item) => inferredProjectIds.has(asNumber(item.id)));
  }
  return items;
}

function filterExecutions(items: JsonObject[], scope: ScheduledDigestUserConfig["scope"]): JsonObject[] {
  if (scope.executions.length > 0) {
    return items.filter((item) => scope.executions.includes(asNumber(item.id)));
  }
  if (scope.projects.length > 0) {
    return items.filter((item) => scope.projects.includes(asNumber(item.project ?? item.parent)));
  }
  return items;
}

function isDateDelayed(item: JsonObject, timezone: string): boolean {
  const status = (asString(item.status) ?? "").toLowerCase();
  if (new Set(["done", "closed", "cancel", "canceled", "wait", "suspended"]).has(status)) {
    return false;
  }
  return resolveDelayDays(item, timezone) > 0;
}

function resolveDelayDays(item: JsonObject, timezone: string): number {
  return computeOverdueDays(asString(item.end) ?? asString(item.endDate), timezone);
}

function buildTaskLink(baseUrl: string, taskId: number): string {
  return buildWebLink(baseUrl, `/task-view-${taskId}.html`);
}

function buildBugLink(baseUrl: string, bugId: number): string {
  return buildWebLink(baseUrl, `/bug-view-${bugId}.html`);
}

function buildStoryLink(baseUrl: string, storyId: number): string {
  return buildWebLink(baseUrl, `/story-view-${storyId}.html`);
}

function buildProjectLink(baseUrl: string, projectId: number): string {
  return buildWebLink(baseUrl, `/project-execution-${projectId}.html`);
}

function buildExecutionLink(baseUrl: string, executionId: number): string {
  return buildWebLink(baseUrl, `/execution-task-${executionId}.html`);
}
