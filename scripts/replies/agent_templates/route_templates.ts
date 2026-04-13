import type { JsonObject } from "../../shared/zentao_client";
import {
  WECOM_INTERACTIVE_ACTIONS,
  buildInteractiveActionKey,
} from "../../callbacks/wecom_interactive_registry";
import type { ReplyTemplate } from "../template_types";
import {
  createAgentActionTemplate,
  createAgentDetailTemplate,
  createAgentListTemplate,
  formatFieldSummary,
  getPathValue,
  getText,
} from "./_helpers";

function renderIdTitleLine(
  item: JsonObject,
  index: number,
  idPath: string,
  titlePath: string,
  fields: Array<{ label: string; path: string; hideIfMissing?: boolean }>,
): string {
  const summary = formatFieldSummary(item, fields);
  const suffix = summary && summary !== "-" ? ` | ${summary}` : "";
  return `${index + 1}. #${getText(getPathValue(item, idPath), String(index + 1))} ${getText(getPathValue(item, titlePath), "-")}${suffix}`;
}

export const routeAgentTemplates: Record<string, ReplyTemplate> = {
  "assign-bug": createAgentActionTemplate({
    name: "assign-bug",
    title: () => "Bug 指派结果",
    sections: [
      { label: "Bug", path: "bug" },
      { label: "指派给", path: "assigned_to" },
      { label: "结果", path: "message" },
    ],
    quoteText: () => "可继续发送“Bug 详情 ID”查看详情。",
  }),
  "create-bug": createAgentActionTemplate({
    name: "create-bug",
    title: () => "创建 Bug",
    sections: [
      { label: "Bug", formatter: (c) => `${getText(getPathValue(c.result, "title"))} (ID:${getText(getPathValue(c.result, "bug_id"))})` },
      { label: "归属", formatter: (c) => `产品:${getText(getPathValue(c.result, "product"))} | 版本:${getText(getPathValue(c.result, "builds"))}` },
      { label: "说明", path: "steps" },
    ],
  }),
  "create-product": createAgentActionTemplate({
    name: "create-product",
    title: () => "创建产品",
    sections: [
      { label: "产品", formatter: (c) => `${getText(getPathValue(c.result, "name"))} (ID:${getText(getPathValue(c.result, "product_id"))})` },
      { label: "关键参数", formatter: (c) => `类型:${getText(getPathValue(c.result, "type"))} | 项目集:${getText(getPathValue(c.result, "program"))} | 访问控制:${getText(getPathValue(c.result, "acl"))}` },
      { label: "结果", path: "message" },
    ],
  }),
  "create-product-modules": createAgentActionTemplate({
    name: "create-product-modules",
    title: () => "创建模块",
    sections: [
      { label: "产品", path: "product" },
      { label: "模块列表", path: "modules" },
      { label: "结果", path: "message" },
    ],
  }),
  "create-product-with-modules": createAgentActionTemplate({
    name: "create-product-with-modules",
    title: () => "产品初始化",
    sections: [
      { label: "产品", formatter: (c) => `${getText(getPathValue(c.result, "product.name"))} (ID:${getText(getPathValue(c.result, "product_id"))})` },
      { label: "模块创建", formatter: (c) => `成功 ${getText(getPathValue(c.result, "created_module_count"), "0")} 个` },
      { label: "模块列表", path: "module_names" },
    ],
  }),
  "create-release": createAgentActionTemplate({
    name: "create-release",
    title: () => "创建发布",
    sections: [
      { label: "发布", formatter: (c) => `${getText(getPathValue(c.result, "name"))} (ID:${getText(getPathValue(c.result, "release_id"))})` },
      { label: "产品", path: "product" },
      { label: "发布日期", path: "date" },
    ],
  }),
  "create-story": createAgentActionTemplate({
    name: "create-story",
    title: () => "创建需求",
    sections: [
      { label: "需求", formatter: (c) => `${getText(getPathValue(c.result, "title"))} (ID:${getText(getPathValue(c.result, "story_id"))})` },
      { label: "归属", formatter: (c) => `产品:${getText(getPathValue(c.result, "product"))} | 模块:${getText(getPathValue(c.result, "module"))}` },
      { label: "结果", path: "message" },
    ],
  }),
  "create-task": createAgentActionTemplate({
    name: "create-task",
    title: () => "创建任务",
    sections: [
      { label: "任务", formatter: (c) => `${getText(getPathValue(c.result, "name"))} (ID:${getText(getPathValue(c.result, "task_id"))})` },
      { label: "归属", formatter: (c) => `执行:${getText(getPathValue(c.result, "execution"))} | 负责人:${getText(getPathValue(c.result, "assigned_to"))}` },
      { label: "结果", path: "message" },
    ],
  }),
  "create-testcase": createAgentActionTemplate({
    name: "create-testcase",
    title: () => "创建测试用例",
    sections: [
      { label: "用例", formatter: (c) => `${getText(getPathValue(c.result, "title"))} (ID:${getText(getPathValue(c.result, "case_id"))})` },
      { label: "产品", path: "product" },
      { label: "结果", path: "message" },
    ],
  }),
  "create-testtask": createAgentActionTemplate({
    name: "create-testtask",
    title: () => "创建测试单",
    sections: [
      { label: "测试单", formatter: (c) => `${getText(getPathValue(c.result, "name"))} (ID:${getText(getPathValue(c.result, "testtask_id"))})` },
      { label: "周期", formatter: (c) => `${getText(getPathValue(c.result, "begin"))} -> ${getText(getPathValue(c.result, "end"))}` },
      { label: "结果", path: "message" },
    ],
  }),
  "link-release-items": createAgentActionTemplate({
    name: "link-release-items",
    title: () => "关联发布项",
    sections: [
      { label: "发布", path: "release" },
      { label: "需求", path: "stories" },
      { label: "Bug", path: "bugs" },
    ],
  }),
  "link-testtask-cases": createAgentActionTemplate({
    name: "link-testtask-cases",
    title: () => "关联测试用例",
    sections: [
      { label: "测试单", path: "testtask" },
      { label: "用例", path: "cases" },
      { label: "结果", path: "message" },
    ],
  }),
  "query-acceptance-overview": createAgentDetailTemplate({
    name: "query-acceptance-overview",
    title: () => "验收概览",
    sections: [
      { label: "结论", path: "summary" },
      { label: "验收状态", path: "status" },
      { label: "待确认项", path: "pending_items" },
      { label: "建议", path: "advice" },
    ],
  }),
  "query-bug-detail": createAgentDetailTemplate({
    name: "query-bug-detail",
    cardType: "button_interaction",
    actions: (c) => {
      const bugId = getText(getPathValue(c.result, "bug"), "");
      if (!bugId) {
        return [];
      }
        return [
          {
            label: "激活Bug",
            key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.bugActivate, { bug: bugId, status: "activate" }),
            style: 1,
          },
          {
            label: "解决Bug",
            key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.bugResolve, { bug: bugId, status: "resolve" }),
            style: 2,
          },
          {
            label: "关闭Bug",
            key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.bugClose, { bug: bugId, status: "close" }),
            style: 4,
          },
      ];
    },
    title: (c) => `Bug 详情 #${getText(getPathValue(c.result, "bug"))}`,
    sections: [
      { label: "基本信息", path: "detail", fields: [{ label: "状态", path: "status" }, { label: "解决方案", path: "resolution" }, { label: "严重程度", path: "severity" }, { label: "优先级", path: "pri" }] },
      { label: "归属信息", path: "detail", fields: [{ label: "产品", path: "product" }, { label: "项目", path: "project" }, { label: "执行", path: "execution" }, { label: "测试单", path: "testtask" }] },
      { label: "处理信息", path: "detail", fields: [{ label: "负责人", path: "assignedTo" }, { label: "提交人", path: "openedBy" }, { label: "解决人", path: "resolvedBy" }, { label: "关闭人", path: "closedBy" }] },
      { label: "复现/描述", path: "detail.steps" },
    ],
  }),
  "query-closure-items": createAgentDetailTemplate({
    name: "query-closure-items",
    title: () => "关闭阻塞项",
    sections: [
      { label: "结论", path: "summary" },
      { label: "阻塞项", path: "items" },
      { label: "建议", path: "advice" },
    ],
  }),
  "query-closure-readiness": createAgentDetailTemplate({
    name: "query-closure-readiness",
    title: () => "关闭准备度",
    sections: [
      { label: "准备度", path: "summary" },
      { label: "状态", path: "status" },
      { label: "未完成项", path: "pending_items" },
      { label: "建议", path: "advice" },
    ],
  }),
  "query-execution-stories": createAgentListTemplate({
    name: "query-execution-stories",
    title: () => "执行需求列表",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到执行需求。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "title", [
      { label: "状态", path: "status" },
      { label: "优先级", path: "pri" },
      { label: "负责人", path: "assignedTo", hideIfMissing: true },
    ]),
  }),
  "query-execution-tasks": createAgentListTemplate({
    name: "query-execution-tasks",
    title: () => "执行任务列表",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到执行任务。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "name", [
      { label: "状态", path: "status" },
      { label: "负责人", path: "assignedTo", hideIfMissing: true },
      { label: "剩余工时", path: "left", hideIfMissing: true },
    ]),
  }),
  "query-execution-team": createAgentListTemplate({
    name: "query-execution-team",
    title: () => "执行团队",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到执行团队成员。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "account", "realname", [
      { label: "角色", path: "role", hideIfMissing: true },
      { label: "加入日期", path: "join", hideIfMissing: true },
    ]),
  }),
  "query-executions": createAgentListTemplate({
    name: "query-executions",
    title: () => "执行列表",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到执行。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "name", [
      { label: "状态", path: "status" },
      { label: "开始", path: "begin", hideIfMissing: true },
      { label: "结束", path: "end", hideIfMissing: true },
      { label: "负责人", path: "PM", hideIfMissing: true },
    ]),
  }),
  "query-go-live-checklist": createAgentDetailTemplate({
    name: "query-go-live-checklist",
    title: () => "上线检查",
    sections: [
      { label: "结论", path: "summary" },
      { label: "检查项", path: "checklist" },
      { label: "风险", path: "risks" },
      { label: "建议", path: "advice" },
    ],
  }),
  "query-my-bugs": createAgentListTemplate({
    name: "query-my-bugs",
    cardType: "button_interaction",
    title: () => "我的 Bug",
    itemsPath: "items",
    emptyText: "当前没有查询到你的 Bug。",
    countPath: "count",
    actions: (c) => {
      const firstBugId = getText(getPathValue(c.result, "items.0.id"), "");
        return [
          ...(firstBugId
            ? [{
                label: "查看首条Bug",
                key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.bugOpenDetail, { bug: firstBugId }),
                style: 1 as const,
              }]
            : []),
          {
            label: "刷新Bug",
            key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.taskQueryMyBugs),
            style: 2,
          },
      ];
    },
    metrics: (c) => [
      { keyname: "总数", value: getText(getPathValue(c.result, "count"), "0") },
      { keyname: "待处理", value: getText(getPathValue(c.result, "todo_count"), "0") },
    ],
    quoteText: () => "继续发送“Bug 详情 ID”查看单条详情。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "title", [
      { label: "状态", path: "status" },
      { label: "严重程度", path: "severity" },
      { label: "优先级", path: "pri" },
      { label: "负责人", path: "assignedTo", hideIfMissing: true },
    ]),
  }),
  "query-product-modules": createAgentListTemplate({
    name: "query-product-modules",
    title: () => "产品模块",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到模块。",
    metrics: (c) => [
      { keyname: "产品", value: getText(getPathValue(c.result, "product"), "-") },
      { keyname: "模块数", value: getText(getPathValue(c.result, "count"), "0") },
    ],
    quoteText: () => "可继续发送“产品需求 产品ID”查看该产品下的需求。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "name", [
      { label: "路径", path: "path", hideIfMissing: true },
      { label: "负责人", path: "owner", hideIfMissing: true },
    ]),
  }),
  "query-product-stories": createAgentListTemplate({
    name: "query-product-stories",
    title: () => "产品需求",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到需求。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "title", [
      { label: "状态", path: "status" },
      { label: "优先级", path: "pri" },
      { label: "负责人", path: "assignedTo", hideIfMissing: true },
    ]),
  }),
  "query-products": createAgentListTemplate({
    name: "query-products",
    title: () => "产品列表",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到产品。",
    metrics: (c) => [
      { keyname: "数量", value: getText(getPathValue(c.result, "count"), "0") },
      { keyname: "总量", value: getText(getPathValue(c.result, "total"), "0") },
    ],
    quoteText: () => "可继续发送“产品模块 产品ID”或“产品需求 产品ID”查看详情。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "name", [
      { label: "状态", path: "status" },
      { label: "类型", path: "type" },
      { label: "PO", path: "PO", hideIfMissing: true },
      { label: "RD", path: "RD", hideIfMissing: true },
    ]),
  }),
  "query-project-team": createAgentListTemplate({
    name: "query-project-team",
    title: () => "项目团队",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到项目团队成员。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "account", "realname", [
      { label: "角色", path: "role", hideIfMissing: true },
      { label: "加入日期", path: "join", hideIfMissing: true },
    ]),
  }),
  "query-projects": createAgentListTemplate({
    name: "query-projects",
    title: () => "项目列表",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到项目。",
    metrics: (c) => [
      { keyname: "数量", value: getText(getPathValue(c.result, "count"), "0") },
      { keyname: "状态筛选", value: getText(getPathValue(c.result, "status"), "all") },
    ],
    quoteText: () => "可继续发送“执行列表 项目ID”或“项目团队 项目ID”查看项目详情。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "name", [
      { label: "状态", path: "status" },
      { label: "开始", path: "begin", hideIfMissing: true },
      { label: "结束", path: "end", hideIfMissing: true },
      { label: "PM", path: "PM", hideIfMissing: true },
    ]),
  }),
  "query-release-detail": createAgentDetailTemplate({
    name: "query-release-detail",
    title: (c) => getText(getPathValue(c.result, "title"), `发布详情 #${getText(getPathValue(c.result, "release"))}`),
    sections: [
      { label: "基本信息", path: "detail", fields: [{ label: "状态", path: "status" }, { label: "发布日期", path: "date" }, { label: "标记", path: "marker", hideIfMissing: true }] },
      { label: "归属信息", path: "detail", fields: [{ label: "产品", path: "product" }, { label: "版本", path: "build", hideIfMissing: true }] },
      { label: "内容摘要", formatter: (c) => `需求:${getText(getPathValue(c.result, "detail.stories.length"), "0")} | Bug:${getText(getPathValue(c.result, "detail.bugs.length"), "0")} | 遗留Bug:${getText(getPathValue(c.result, "detail.leftBugs.length"), "0")}` },
      { label: "发布说明", path: "detail.desc" },
    ],
  }),
  "query-releases": createAgentListTemplate({
    name: "query-releases",
    title: () => "发布列表",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到发布。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "name", [
      { label: "状态", path: "status" },
      { label: "日期", path: "date", hideIfMissing: true },
      { label: "版本", path: "build", hideIfMissing: true },
    ]),
  }),
  "query-story-detail": createAgentDetailTemplate({
    name: "query-story-detail",
    title: (c) => `需求详情 #${getText(getPathValue(c.result, "story"))}`,
    sections: [
      { label: "基本信息", path: "detail", fields: [{ label: "状态", path: "status" }, { label: "优先级", path: "pri" }, { label: "阶段", path: "stage", hideIfMissing: true }] },
      { label: "归属信息", path: "detail", fields: [{ label: "产品", path: "product" }, { label: "模块", path: "module", hideIfMissing: true }, { label: "负责人", path: "assignedTo", hideIfMissing: true }] },
      { label: "描述", path: "detail.spec" },
      { label: "验收标准", path: "detail.verify" },
    ],
  }),
  "query-task-detail": createAgentDetailTemplate({
    name: "query-task-detail",
    cardType: "button_interaction",
    actions: (c) => {
      const taskId = getText(getPathValue(c.result, "task"), "");
      if (!taskId) {
        return [];
      }
        return [
          {
            label: "开始任务",
            key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.taskStart, { task: taskId, status: "doing" }),
            style: 1,
          },
          {
            label: "完成任务",
            key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.taskFinish, { task: taskId, status: "done" }),
            style: 2,
          },
          {
            label: "阻塞任务",
            key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.taskBlock, { task: taskId, status: "pause" }),
            style: 4,
          },
      ];
    },
    title: (c) => `任务详情 #${getText(getPathValue(c.result, "task"))}`,
    sections: [
      { label: "基本信息", path: "detail", fields: [{ label: "状态", path: "status" }, { label: "负责人", path: "assignedTo" }, { label: "优先级", path: "pri", hideIfMissing: true }] },
      { label: "工时信息", path: "detail", fields: [{ label: "预计", path: "estimate" }, { label: "已消耗", path: "consumed" }, { label: "剩余", path: "left" }] },
      { label: "归属信息", path: "detail", fields: [{ label: "项目", path: "project", hideIfMissing: true }, { label: "执行", path: "execution", hideIfMissing: true }, { label: "关联需求", path: "story", hideIfMissing: true }] },
    ],
    quoteText: () => "可继续发送“更新任务状态 任务ID 状态”推进任务。",
  }),
  "query-test-exit-readiness": createAgentDetailTemplate({
    name: "query-test-exit-readiness",
    title: () => "测试准出",
    sections: [
      { label: "结论", path: "summary" },
      { label: "状态", path: "status" },
      { label: "阻塞项", path: "blocking_items" },
      { label: "建议", path: "advice" },
    ],
  }),
  "query-testcases": createAgentListTemplate({
    name: "query-testcases",
    title: () => "测试用例",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到测试用例。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "title", [
      { label: "阶段", path: "stage", hideIfMissing: true },
      { label: "优先级", path: "pri", hideIfMissing: true },
      { label: "模块", path: "module", hideIfMissing: true },
    ]),
  }),
  "query-testtask-cases": createAgentListTemplate({
    name: "query-testtask-cases",
    title: () => "测试单用例",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到测试单用例。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "title", [
      { label: "结果", path: "result", hideIfMissing: true },
      { label: "执行人", path: "assignedTo", hideIfMissing: true },
    ]),
  }),
  "query-testtask-detail": createAgentDetailTemplate({
    name: "query-testtask-detail",
    title: (c) => `测试单详情 #${getText(getPathValue(c.result, "testtask"))}`,
    sections: [
      { label: "基本信息", path: "detail", fields: [{ label: "状态", path: "status" }, { label: "负责人", path: "owner", hideIfMissing: true }, { label: "开始", path: "begin", hideIfMissing: true }, { label: "结束", path: "end", hideIfMissing: true }] },
      { label: "归属信息", path: "detail", fields: [{ label: "产品", path: "product", hideIfMissing: true }, { label: "项目", path: "project", hideIfMissing: true }, { label: "执行", path: "execution", hideIfMissing: true }] },
      { label: "说明", path: "detail.desc" },
    ],
  }),
  "query-testtasks": createAgentListTemplate({
    name: "query-testtasks",
    title: () => "测试单列表",
    itemsPath: "items",
    countPath: "count",
    emptyText: "当前没有查询到测试单。",
    metrics: (c) => [
      { keyname: "数量", value: getText(getPathValue(c.result, "count"), "0") },
      { keyname: "执行", value: getText(getPathValue(c.result, "execution"), "-") },
      { keyname: "项目", value: getText(getPathValue(c.result, "project"), "-") },
    ],
    quoteText: () => "可继续发送“测试单详情 ID”或“测试单用例 ID”查看测试进展。",
    itemRenderer: (item, index) => renderIdTitleLine(item, index, "id", "name", [
      { label: "状态", path: "status" },
      { label: "负责人", path: "owner", hideIfMissing: true },
      { label: "开始", path: "begin", hideIfMissing: true },
      { label: "结束", path: "end", hideIfMissing: true },
    ]),
  }),
  "review-story": createAgentActionTemplate({
    name: "review-story",
    cardType: "vote_interaction",
    vote: (c) => {
      const storyId = getText(getPathValue(c.result, "story"), "");
      return {
        questionKey: "review_result",
        mode: 1,
        options: [
          { id: "pass", text: "通过" },
          { id: "reject", text: "驳回" },
          { id: "clarify", text: "需补充" },
        ],
        submit: {
          text: "提交评审",
          key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.storyReviewSubmit, { story: storyId }),
        },
        replaceText: "评审结果已提交",
      };
    },
    title: () => "需求评审",
    sections: [
      { label: "需求", path: "story" },
      { label: "结果", path: "result" },
      { label: "说明", path: "message" },
    ],
  }),
  "run-testtask-case": createAgentActionTemplate({
    name: "run-testtask-case",
    title: () => "执行测试用例",
    sections: [
      { label: "运行记录", path: "run" },
      { label: "结果", path: "result" },
      { label: "说明", path: "message" },
    ],
  }),
  "update-bug-status": createAgentActionTemplate({
    name: "update-bug-status",
    cardType: "multiple_interaction",
    form: (c) => {
      const bugId = getText(getPathValue(c.result, "bug"), "");
      const currentStatus = getText(getPathValue(c.result, "status"), "");
      return {
        fields: [
          {
            questionKey: "status",
            title: "选择Bug状态",
            selectedId: currentStatus || undefined,
            options: [
              { id: "activate", text: "激活" },
              { id: "resolve", text: "已解决" },
              { id: "close", text: "已关闭" },
            ],
          },
          {
            questionKey: "comment_mode",
            title: "备注策略",
            selectedId: "default",
            options: [
              { id: "default", text: "使用默认备注" },
              { id: "silent", text: "不写备注" },
            ],
          },
        ],
        submit: {
          text: "提交更新",
          key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.bugStatusSubmit, { bug: bugId }),
        },
        replaceText: "Bug状态更新已提交",
      };
    },
    title: () => "Bug 状态更新",
    sections: [
      { label: "Bug", path: "bug" },
      { label: "状态变更", formatter: (c) => `-> ${getText(getPathValue(c.result, "status"))}` },
      { label: "备注", formatter: (c) => getText(getPathValue(c.result, "comment")) || getText(getPathValue(c.result, "message")) },
    ],
  }),
  "update-release-status": createAgentActionTemplate({
    name: "update-release-status",
    title: () => "发布状态更新",
    sections: [
      { label: "发布", path: "release" },
      { label: "状态变更", formatter: (c) => `-> ${getText(getPathValue(c.result, "status"))}` },
      { label: "备注", formatter: (c) => getText(getPathValue(c.result, "comment")) || getText(getPathValue(c.result, "message")) },
    ],
  }),
  "update-story-status": createAgentActionTemplate({
    name: "update-story-status",
    title: () => "需求状态更新",
    sections: [
      { label: "需求", path: "story" },
      { label: "状态变更", formatter: (c) => `-> ${getText(getPathValue(c.result, "status"))}` },
      { label: "备注", formatter: (c) => getText(getPathValue(c.result, "comment")) || getText(getPathValue(c.result, "message")) },
    ],
  }),
  "update-task-status": createAgentActionTemplate({
    name: "update-task-status",
    cardType: "multiple_interaction",
    form: (c) => {
      const taskId = getText(getPathValue(c.result, "task"), "");
      const currentStatus = getText(getPathValue(c.result, "status"), "");
      return {
        fields: [
          {
            questionKey: "status",
            title: "选择任务状态",
            selectedId: currentStatus || undefined,
            options: [
              { id: "wait", text: "待处理" },
              { id: "doing", text: "进行中" },
              { id: "done", text: "已完成" },
              { id: "pause", text: "已阻塞" },
            ],
          },
          {
            questionKey: "comment_mode",
            title: "备注策略",
            selectedId: "default",
            options: [
              { id: "default", text: "使用默认备注" },
              { id: "silent", text: "不写备注" },
            ],
          },
        ],
        submit: {
          text: "提交更新",
          key: buildInteractiveActionKey(WECOM_INTERACTIVE_ACTIONS.taskStatusSubmit, { task: taskId }),
        },
        replaceText: "任务状态更新已提交",
      };
    },
    title: () => "任务状态更新",
    sections: [
      { label: "任务", path: "task" },
      { label: "状态变更", formatter: (c) => `-> ${getText(getPathValue(c.result, "status"))}` },
      { label: "备注", formatter: (c) => getText(getPathValue(c.result, "comment")) || getText(getPathValue(c.result, "message")) },
    ],
  }),
};
