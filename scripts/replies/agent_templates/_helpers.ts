import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { JsonObject } from "../../shared/zentao_client";
import type { ReplyRenderContext, ReplyTemplate } from "../template_types";
import {
  buildButtonInteractionCard,
  buildMultipleInteractionCard,
  buildTextNoticeCard,
  buildVoteInteractionCard,
  summarizeForInteractiveCard,
  type AgentCardType,
  type AgentTemplateActionDescriptor,
  type AgentTemplateButtonSelectionDescriptor,
  type AgentTemplateMultipleFormDescriptor,
  type AgentTemplateVoteDescriptor,
  type TextNoticeHorizontalContent,
  validateTemplateCard,
} from "./card_support";

function truncateText(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }
  return `${input.slice(0, Math.max(0, maxLength - 1))}...`;
}

function normalizeLine(line: string): string {
  return line
    .replace(/^[\s\u3010\[]+/, "")
    .replace(/[\u3011\]]+$/g, "")
    .trim();
}

function inferTitle(content: string, fallbackTitle: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .find(Boolean);

  return truncateText(firstLine || fallbackTitle, 36);
}

function humanizeTemplateName(templateName: string): string {
  return templateName
    .replace(/^agent-/, "")
    .split("-")
    .filter(Boolean)
    .join(" ");
}

function buildUniqueTaskId(base: string, userid?: string): string {
  const normalizedBase = base.replace(/[^A-Za-z0-9._:-]+/g, "-");
  const normalizedUser = (userid || "unknown").replace(/[^A-Za-z0-9._:-]+/g, "-");
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${normalizedBase}-${normalizedUser}-${uniqueSuffix}`;
}

export function validateAgentReplyPayload(replyText: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(replyText);
  } catch (error) {
    throw new Error(`agent reply must be valid JSON: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("agent reply root must be an object");
  }

  const templateCard = (parsed as JsonObject).template_card;
  if (!templateCard) {
    throw new Error("agent reply must contain template_card");
  }

  validateTemplateCard(templateCard, "template_card");
  return replyText;
}

export function wrapTextAsAgentTemplateCard(
  context: ReplyRenderContext,
  content: string,
  templateName: string,
): string {
  const fallbackTitle = `${humanizeTemplateName(templateName)} result`;
  const title = inferTitle(content, fallbackTitle);
  const userid = context.userid || "unknown";

  const card = buildTextNoticeCard({
    title,
    desc: `User: ${userid}`,
    body: content.trim(),
    taskId: buildUniqueTaskId(templateName, userid),
    horizontalContentList: [
      { keyname: "Intent", value: truncateText(context.intent, 64) },
      { keyname: "Script", value: truncateText(context.script, 64) },
      { keyname: "Source", value: context.sourceType },
    ],
  });

  return JSON.stringify({ template_card: card });
}

export function createWrappedAgentTemplate(
  templateName: string,
  renderText: (context: ReplyRenderContext) => string,
): ReplyTemplate {
  return {
    name: `agent-${templateName}`,
    render(context: ReplyRenderContext): string {
      return wrapTextAsAgentTemplateCard(context, renderText(context), templateName);
    },
  };
}

export interface AgentFieldConfig {
  label: string;
  path: string;
  fallback?: string;
  hideIfMissing?: boolean;
}

export interface AgentSectionConfig {
  label: string;
  path?: string;
  fields?: AgentFieldConfig[];
  formatter?: (context: ReplyRenderContext) => string;
}

interface AgentTemplateSharedConfig {
  cardType?: AgentCardType;
  actions?: (context: ReplyRenderContext) => AgentTemplateActionDescriptor[] | undefined;
  buttonSelection?: (context: ReplyRenderContext) => AgentTemplateButtonSelectionDescriptor | undefined;
  form?: (context: ReplyRenderContext) => AgentTemplateMultipleFormDescriptor | undefined;
  vote?: (context: ReplyRenderContext) => AgentTemplateVoteDescriptor | undefined;
}

export interface AgentListTemplateConfig extends AgentTemplateSharedConfig {
  name: string;
  title: (context: ReplyRenderContext) => string;
  desc?: (context: ReplyRenderContext) => string | undefined;
  itemsPath: string;
  emptyText: string;
  countPath?: string;
  metrics?: (context: ReplyRenderContext) => TextNoticeHorizontalContent[];
  itemRenderer: (item: JsonObject, index: number, context: ReplyRenderContext) => string;
  maxItems?: number;
  quoteText?: (context: ReplyRenderContext) => string | undefined;
}

export interface AgentDetailTemplateConfig extends AgentTemplateSharedConfig {
  name: string;
  title: (context: ReplyRenderContext) => string;
  desc?: (context: ReplyRenderContext) => string | undefined;
  sections: AgentSectionConfig[];
  metrics?: (context: ReplyRenderContext) => TextNoticeHorizontalContent[];
  quoteText?: (context: ReplyRenderContext) => string | undefined;
}

export interface AgentActionTemplateConfig extends AgentDetailTemplateConfig {}

export function getPathValue(record: unknown, path: string): unknown {
  if (!path) return record;

  const parts = path.split(".");
  let current: unknown = record;

  for (const part of parts) {
    if (Array.isArray(current)) {
      if (part === "length") {
        current = current.length;
        continue;
      }
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as JsonObject)[part];
  }

  return current;
}

export function getText(value: unknown, fallback = "-"): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return fallback;
    return value.map((item) => getText(item, "")).filter(Boolean).join(", ") || fallback;
  }
  if (typeof value === "object") {
    const pairs = Object.entries(value as JsonObject)
      .slice(0, 4)
      .map(([key, item]) => `${key}:${getText(item, "")}`)
      .filter((line) => !line.endsWith(":"));
    return pairs.join(" | ") || fallback;
  }
  return fallback;
}

export function getObjectArray(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value as JsonObject).filter(
      (item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item),
    );
  }
  return [];
}

export function formatFieldSummary(record: unknown, fields: AgentFieldConfig[], separator = " | "): string {
  const parts = fields
    .map((field) => {
      const text = getText(getPathValue(record, field.path), field.fallback ?? "-");
      if (field.hideIfMissing && text === (field.fallback ?? "-")) {
        return "";
      }
      return `${field.label}:${text}`;
    })
    .filter(Boolean);

  return parts.join(separator) || "-";
}

function renderSections(context: ReplyRenderContext, sections: AgentSectionConfig[]): string {
  return sections
    .map((section) => {
      let body = "-";
      if (section.formatter) {
        body = section.formatter(context) || "-";
      } else if (section.fields) {
        const base = section.path ? getPathValue(context.result, section.path) : context.result;
        body = formatFieldSummary(base, section.fields);
      } else if (section.path) {
        body = getText(getPathValue(context.result, section.path));
      }
      return `${section.label}\n${body}`;
    })
    .join("\n\n");
}

function renderTemplateCardPayload(input: {
  cardType: AgentCardType;
  name: string;
  context: ReplyRenderContext;
  title: string;
  desc?: string;
  body: string;
  metrics?: TextNoticeHorizontalContent[];
  quoteText?: string;
  actions?: AgentTemplateActionDescriptor[];
  buttonSelection?: AgentTemplateButtonSelectionDescriptor;
  form?: AgentTemplateMultipleFormDescriptor;
  vote?: AgentTemplateVoteDescriptor;
}): string {
  const taskId = buildUniqueTaskId(input.name, input.context.userid);

  if (input.cardType === "text_notice") {
    return JSON.stringify({
      template_card: buildTextNoticeCard({
        title: input.title,
        desc: input.desc,
        body: input.body,
        taskId,
        horizontalContentList: input.metrics,
        quoteText: input.quoteText,
      }),
    });
  }

  if (input.cardType === "button_interaction") {
    return JSON.stringify({
      template_card: buildButtonInteractionCard({
        title: input.title,
        desc: input.desc,
        body: input.body,
        taskId,
        horizontalContentList: input.metrics,
        quoteText: input.quoteText,
        buttonList: input.actions ?? [],
        buttonSelection: input.buttonSelection,
      }),
    });
  }

  if (input.cardType === "multiple_interaction") {
    if (!input.form) {
      throw new Error(`multiple_interaction template '${input.name}' requires form()`);
    }

    return JSON.stringify({
      template_card: buildMultipleInteractionCard({
        title: input.title,
        desc: summarizeForInteractiveCard(input.desc, input.body),
        taskId,
        form: input.form,
      }),
    });
  }

  if (!input.vote) {
    throw new Error(`vote_interaction template '${input.name}' requires vote()`);
  }

  return JSON.stringify({
    template_card: buildVoteInteractionCard({
      title: input.title,
      desc: summarizeForInteractiveCard(input.desc, input.body),
      taskId,
      vote: input.vote,
    }),
  });
}

export function createAgentListTemplate(config: AgentListTemplateConfig): ReplyTemplate {
  return {
    name: `agent-${config.name}`,
    render(context: ReplyRenderContext): string {
      const items = getObjectArray(getPathValue(context.result, config.itemsPath));
      const body = items.length > 0
        ? items.slice(0, config.maxItems ?? 3).map((item, index) => config.itemRenderer(item, index, context)).join("\n")
        : config.emptyText;

      return renderTemplateCardPayload({
        cardType: config.cardType ?? "text_notice",
        name: config.name,
        context,
        title: config.title(context),
        desc: config.desc?.(context),
        body,
        metrics: config.metrics?.(context) ?? (
          config.countPath
            ? [{ keyname: "Count", value: getText(getPathValue(context.result, config.countPath), "0") }]
            : undefined
        ),
        quoteText: config.quoteText?.(context),
        actions: config.actions?.(context),
        buttonSelection: config.buttonSelection?.(context),
        form: config.form?.(context),
        vote: config.vote?.(context),
      });
    },
  };
}

export function createAgentDetailTemplate(config: AgentDetailTemplateConfig): ReplyTemplate {
  return {
    name: `agent-${config.name}`,
    render(context: ReplyRenderContext): string {
      return renderTemplateCardPayload({
        cardType: config.cardType ?? "text_notice",
        name: config.name,
        context,
        title: config.title(context),
        desc: config.desc?.(context),
        body: renderSections(context, config.sections),
        metrics: config.metrics?.(context),
        quoteText: config.quoteText?.(context),
        actions: config.actions?.(context),
        buttonSelection: config.buttonSelection?.(context),
        form: config.form?.(context),
        vote: config.vote?.(context),
      });
    },
  };
}

export const createAgentActionTemplate = createAgentDetailTemplate;

function summarizeJsonObject(record: JsonObject, maxEntries: number): string[] {
  return Object.entries(record)
    .filter(([, value]) => value !== undefined && value !== null)
    .slice(0, maxEntries)
    .map(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return `${key}: ${String(value)}`;
      }
      if (Array.isArray(value)) {
        return `${key}: ${value.length} item(s)`;
      }
      if (typeof value === "object") {
        return `${key}: object`;
      }
      return `${key}: ${String(value)}`;
    });
}

function buildGenericAgentBody(context: ReplyRenderContext): string {
  const lines: string[] = [
    `intent: ${context.intent}`,
    `script: ${context.script}`,
  ];

  const summary = summarizeJsonObject(context.result, 6);
  if (summary.length > 0) {
    lines.push(...summary);
  } else {
    lines.push("no structured summary available");
  }

  return lines.join("\n");
}

export function createRouteDrivenAgentTemplate(templateName: string): ReplyTemplate {
  return createWrappedAgentTemplate(templateName, (context) => buildGenericAgentBody(context));
}

interface IntentRoutingRoute {
  reply_template?: unknown;
}

interface IntentRoutingConfig {
  routes?: unknown;
}

export function loadAgentTemplateNamesFromIntentRouting(): string[] {
  const routingPath = path.resolve(__dirname, "../../../../agents/modules/intent-routing.yaml");
  const raw = readFileSync(routingPath, "utf8");
  const parsed = YAML.parse(raw) as IntentRoutingConfig;
  const routes = Array.isArray(parsed.routes) ? parsed.routes : [];

  return Array.from(
    new Set(
      routes
        .filter((item): item is IntentRoutingRoute => typeof item === "object" && item !== null && !Array.isArray(item))
        .map((route) => route.reply_template)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  );
}
