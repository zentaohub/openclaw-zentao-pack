import { type JsonObject, type JsonValue, ZentaoClient } from "../shared/zentao_client";

function asObject(value: JsonValue | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asObjectArray(value: JsonValue | undefined): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  return [];
}

function dedupeById(items: JsonObject[]): JsonObject[] {
  const merged = new Map<number, JsonObject>();
  for (const item of items) {
    const id = Number(item.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) continue;
    merged.set(id, { ...(merged.get(id) ?? {}), ...item });
  }
  return Array.from(merged.values()).sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));
}

async function mergeTaskDetails(client: ZentaoClient, tasks: JsonObject[]): Promise<JsonObject[]> {
  const details = await Promise.all(
    tasks.map(async (task) => {
      const taskId = Number(task.id ?? 0);
      if (!Number.isFinite(taskId) || taskId <= 0) return task;
      try {
        const detailData = await client.getWebJsonViewData(`/task-view-${taskId}.json`);
        const detailTask = asObject(detailData.task);
        return detailTask ? { ...task, ...detailTask } : task;
      } catch {
        return task;
      }
    }),
  );
  return dedupeById(details);
}

async function mergeStoryDetails(client: ZentaoClient, stories: JsonObject[]): Promise<JsonObject[]> {
  const details = await Promise.all(
    stories.map(async (story) => {
      const storyId = Number(story.id ?? 0);
      if (!Number.isFinite(storyId) || storyId <= 0) return story;
      try {
        const detailData = await client.getWebJsonViewData(`/story-view-${storyId}-0-0-story.json`);
        const detailStory = asObject(detailData.story);
        return detailStory ? { ...story, ...detailStory } : story;
      } catch {
        return story;
      }
    }),
  );
  return dedupeById(details);
}

export interface AcceptanceSnapshot {
  productId: number;
  executionId: number;
  productOverview: JsonObject;
  releases: JsonObject[];
  stories: JsonObject[];
  tasks: JsonObject[];
  testCases: JsonObject[];
  productBugs: JsonObject[];
  myTasksSummary: string | null;
  myBugCount: number;
}

export async function loadAcceptanceSnapshot(
  client: ZentaoClient,
  productId: number,
  executionId: number,
): Promise<AcceptanceSnapshot> {
  const [productView, releaseView, executionStoryView, productStoryView, closedStoryView, executionTaskView, testcaseView, allBugView, resolvedBugView, closedBugView, myTaskView, myBugView] = await Promise.all([
    client.getWebJsonViewData(`/product-view-${productId}.json`),
    client.getWebJsonViewData(`/release-browse-${productId}-all.json`),
    client.getWebJsonViewData(`/execution-story-${executionId}.json`),
    client.getWebJsonViewData(`/story-browse-${productId}-all-0-id_desc-0-100-1.json`),
    client.getWebJsonViewData(`/story-browse-${productId}-closed-0-id_desc-0-100-1.json`),
    client.getWebJsonViewData(`/execution-task-${executionId}.json`),
    client.getWebJsonViewData(`/testcase-browse-${productId}-all.json`),
    client.getWebJsonViewData(`/bug-browse-${productId}-all-0-id_desc-0-100-1.json`),
    client.getWebJsonViewData(`/bug-browse-${productId}-resolved-0-id_desc-0-100-1.json`),
    client.getWebJsonViewData(`/bug-browse-${productId}-closed-0-id_desc-0-100-1.json`),
    client.getWebJsonViewData('/my-work-task-assignedTo.json'),
    client.getWebJsonViewData('/my-work-bug-assignedTo.json'),
  ]);

  const productOverview = asObject(productView.product);
  if (!productOverview) throw new Error(`Product payload missing for product ${productId}`);

  const storyMap = asObject(executionStoryView.stories);
  const executionStories = storyMap ? Object.values(storyMap).filter((item): item is JsonObject => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
  const stories = await mergeStoryDetails(
    client,
    dedupeById([
      ...executionStories,
      ...asObjectArray(productStoryView.stories),
      ...asObjectArray(closedStoryView.stories),
    ]).filter((item) => executionStories.some((story) => Number(story.id ?? 0) === Number(item.id ?? 0))),
  );

  const tasks = await mergeTaskDetails(client, asObjectArray(executionTaskView.tasks));

  const productBugs = dedupeById([
    ...asObjectArray(allBugView.bugs),
    ...asObjectArray(resolvedBugView.bugs),
    ...asObjectArray(closedBugView.bugs),
  ]).filter((item) => Number(item.execution ?? 0) === executionId || Number(item.testtask ?? 0) > 0 || Number(item.story ?? 0) > 0);

  return {
    productId,
    executionId,
    productOverview,
    releases: asObjectArray(releaseView.releases),
    stories,
    tasks,
    testCases: asObjectArray(testcaseView.cases),
    productBugs,
    myTasksSummary: typeof myTaskView.summary === 'string' ? myTaskView.summary : null,
    myBugCount: asObjectArray(myBugView.bugs).length,
  };
}

export function countByField(items: JsonObject[], field: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const raw = item[field];
    const key = typeof raw === 'string' && raw.trim() ? raw.trim() : raw === null || raw === undefined ? 'unknown' : String(raw);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function normalizeNumber(value: JsonValue | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
