import type { JsonObject } from "../../shared/zentao_client";

type WecomActionType = 0 | 1 | 2;
type WecomButtonStyle = 1 | 2 | 3 | 4;

export type AgentCardType =
  | "text_notice"
  | "button_interaction"
  | "multiple_interaction"
  | "vote_interaction";

interface CommonCardSource extends JsonObject {
  desc?: string;
  desc_color?: number;
}

interface CommonCardAction extends JsonObject {
  type: number;
  url?: string;
  appid?: string;
  pagepath?: string;
}

interface CommonMainTitle extends JsonObject {
  title: string;
  desc?: string;
}

export interface TextNoticeHorizontalContent extends JsonObject {
  keyname: string;
  value?: string;
  url?: string;
  media_id?: string;
  userid?: string;
}

interface CommonQuoteArea extends JsonObject {
  type: number;
  url?: string;
  appid?: string;
  pagepath?: string;
  title?: string;
  quote_text?: string;
}

interface InteractiveOption extends JsonObject {
  id: string;
  text: string;
  is_checked?: boolean;
}

interface InteractiveSubmitButton extends JsonObject {
  text: string;
  key: string;
}

interface ButtonInteractionItem extends JsonObject {
  text: string;
  style?: WecomButtonStyle;
  type?: WecomActionType;
  key?: string;
  url?: string;
  appid?: string;
  pagepath?: string;
}

interface ButtonSelection extends JsonObject {
  question_key: string;
  title?: string;
  option_list: InteractiveOption[];
  selected_id?: string;
}

interface MultipleSelectionItem extends JsonObject {
  question_key: string;
  title: string;
  selected_id?: string;
  option_list: InteractiveOption[];
}

interface VoteCheckbox extends JsonObject {
  question_key: string;
  mode?: 0 | 1;
  option_list: InteractiveOption[];
}

export interface TextNoticeTemplateCard extends JsonObject {
  card_type: "text_notice";
  source?: CommonCardSource;
  main_title: CommonMainTitle;
  sub_title_text?: string;
  horizontal_content_list?: TextNoticeHorizontalContent[];
  quote_area?: CommonQuoteArea;
  card_action: CommonCardAction;
  task_id?: string;
}

export interface ButtonInteractionTemplateCard extends JsonObject {
  card_type: "button_interaction";
  source?: CommonCardSource;
  main_title: CommonMainTitle;
  sub_title_text?: string;
  horizontal_content_list?: TextNoticeHorizontalContent[];
  quote_area?: CommonQuoteArea;
  button_selection?: ButtonSelection;
  button_list: ButtonInteractionItem[];
  task_id: string;
}

export interface MultipleInteractionTemplateCard extends JsonObject {
  card_type: "multiple_interaction";
  source?: CommonCardSource;
  main_title: CommonMainTitle;
  select_list: MultipleSelectionItem[];
  submit_button: InteractiveSubmitButton;
  task_id: string;
  replace_text?: string;
}

export interface VoteInteractionTemplateCard extends JsonObject {
  card_type: "vote_interaction";
  source?: CommonCardSource;
  main_title: CommonMainTitle;
  checkbox: VoteCheckbox;
  submit_button: InteractiveSubmitButton;
  task_id: string;
  replace_text?: string;
}

export type AgentTemplateCard =
  | TextNoticeTemplateCard
  | ButtonInteractionTemplateCard
  | MultipleInteractionTemplateCard
  | VoteInteractionTemplateCard;

export interface AgentTemplateActionDescriptor {
  key: string;
  label: string;
  style?: WecomButtonStyle;
  type?: WecomActionType;
  url?: string;
  appid?: string;
  pagepath?: string;
}

export interface AgentTemplateOptionDescriptor {
  id: string;
  text: string;
  selected?: boolean;
}

export interface AgentTemplateButtonSelectionDescriptor {
  questionKey: string;
  title?: string;
  selectedId?: string;
  options: AgentTemplateOptionDescriptor[];
}

export interface AgentTemplateSelectFieldDescriptor {
  questionKey: string;
  title: string;
  selectedId?: string;
  options: AgentTemplateOptionDescriptor[];
}

export interface AgentTemplateSubmitDescriptor {
  text: string;
  key: string;
}

export interface AgentTemplateMultipleFormDescriptor {
  fields: AgentTemplateSelectFieldDescriptor[];
  submit: AgentTemplateSubmitDescriptor;
  replaceText?: string;
}

export interface AgentTemplateVoteDescriptor {
  questionKey: string;
  mode?: 0 | 1;
  options: AgentTemplateOptionDescriptor[];
  submit: AgentTemplateSubmitDescriptor;
  replaceText?: string;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function ensureObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function truncateText(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }
  return `${input.slice(0, Math.max(0, maxLength - 1))}...`;
}

function defaultSource(sourceDesc?: string): CommonCardSource {
  return {
    desc: sourceDesc ?? "OpenClaw Zentao Assistant",
    desc_color: 0,
  };
}

function sanitizeTaskId(taskId: string | undefined, fallback: string): string {
  const raw = asNonEmptyString(taskId) ?? fallback;
  return truncateText(raw.replace(/[^A-Za-z0-9._:-]+/g, "-"), 120);
}

function buildQuoteArea(quoteText: string | undefined): CommonQuoteArea | undefined {
  return quoteText
    ? {
        type: 0,
        quote_text: truncateText(quoteText, 128),
      }
    : undefined;
}

function ensureMainTitle(value: unknown, label: string): void {
  const record = ensureObject(value, `${label}.main_title`);
  if (!asNonEmptyString(record.title)) {
    throw new Error(`${label}.main_title.title is required`);
  }
}

function ensureTaskId(value: unknown, label: string, required = false): void {
  if (!asNonEmptyString(value) && required) {
    throw new Error(`${label} is required`);
  }
}

function ensureHorizontalContentList(list: unknown, label: string): void {
  if (list === undefined) {
    return;
  }
  if (!Array.isArray(list)) {
    throw new Error(`${label}.horizontal_content_list must be an array`);
  }
  list.forEach((item, index) => {
    const record = ensureObject(item, `${label}.horizontal_content_list[${index}]`);
    if (!asNonEmptyString(record.keyname)) {
      throw new Error(`${label}.horizontal_content_list[${index}].keyname is required`);
    }
  });
}

function ensureInteractiveOptions(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  value.forEach((item, index) => {
    const record = ensureObject(item, `${label}[${index}]`);
    if (!asNonEmptyString(record.id)) {
      throw new Error(`${label}[${index}].id is required`);
    }
    if (!asNonEmptyString(record.text)) {
      throw new Error(`${label}[${index}].text is required`);
    }
  });
}

function ensureButtonList(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label}.button_list must be a non-empty array`);
  }
  value.forEach((item, index) => {
    const record = ensureObject(item, `${label}.button_list[${index}]`);
    const type = record.type ?? 0;
    if (!asNonEmptyString(record.text)) {
      throw new Error(`${label}.button_list[${index}].text is required`);
    }
    if (type === 0 && !asNonEmptyString(record.key)) {
      throw new Error(`${label}.button_list[${index}].key is required when type=0`);
    }
    if (type === 1 && !asNonEmptyString(record.url)) {
      throw new Error(`${label}.button_list[${index}].url is required when type=1`);
    }
    if (type === 2 && (!asNonEmptyString(record.appid) || !asNonEmptyString(record.pagepath))) {
      throw new Error(`${label}.button_list[${index}].appid and pagepath are required when type=2`);
    }
  });
}

function ensureCardAction(value: unknown, label: string): void {
  const record = ensureObject(value, `${label}.card_action`);
  const type = record.type;
  if (type === 1 && !asNonEmptyString(record.url)) {
    throw new Error(`${label}.card_action.url is required when type=1`);
  }
  if (type === 2 && (!asNonEmptyString(record.appid) || !asNonEmptyString(record.pagepath))) {
    throw new Error(`${label}.card_action.appid and pagepath are required when type=2`);
  }
}

function mapActionDescriptor(action: AgentTemplateActionDescriptor): ButtonInteractionItem {
  const type = action.type ?? (action.url ? 1 : action.appid ? 2 : 0);
  return {
    text: action.label,
    style: action.style,
    type,
    key: type === 0 ? action.key : undefined,
    url: type === 1 ? action.url : undefined,
    appid: type === 2 ? action.appid : undefined,
    pagepath: type === 2 ? action.pagepath : undefined,
  };
}

function mapOption(item: AgentTemplateOptionDescriptor, selected = false): InteractiveOption {
  return {
    id: item.id,
    text: item.text,
    is_checked: selected || item.selected || undefined,
  };
}

export function buildTextNoticeCard(input: {
  title: string;
  desc?: string;
  body: string;
  sourceDesc?: string;
  actionUrl?: string;
  taskId?: string;
  horizontalContentList?: TextNoticeHorizontalContent[];
  quoteText?: string;
}): TextNoticeTemplateCard {
  const title = asNonEmptyString(input.title);
  const body = asNonEmptyString(input.body);
  if (!title) throw new Error("text_notice.main_title.title is required");
  if (!body) throw new Error("text_notice.sub_title_text is required");

  return {
    card_type: "text_notice",
    source: defaultSource(input.sourceDesc),
    main_title: { title, desc: input.desc },
    sub_title_text: truncateText(body, 1200),
    horizontal_content_list: input.horizontalContentList,
    quote_area: buildQuoteArea(input.quoteText),
    card_action: { type: 1, url: input.actionUrl ?? "https://work.weixin.qq.com/" },
    task_id: input.taskId ? sanitizeTaskId(input.taskId, input.taskId) : undefined,
  };
}

export function buildButtonInteractionCard(input: {
  title: string;
  desc?: string;
  body?: string;
  sourceDesc?: string;
  taskId?: string;
  horizontalContentList?: TextNoticeHorizontalContent[];
  quoteText?: string;
  buttonList: AgentTemplateActionDescriptor[];
  buttonSelection?: AgentTemplateButtonSelectionDescriptor;
}): ButtonInteractionTemplateCard {
  const title = asNonEmptyString(input.title);
  const body = asNonEmptyString(input.body);
  if (!title) throw new Error("button_interaction.main_title.title is required");
  if (input.buttonList.length === 0) throw new Error("button_interaction.button_list must be non-empty");

  return {
    card_type: "button_interaction",
    source: defaultSource(input.sourceDesc),
    main_title: { title, desc: input.desc },
    sub_title_text: body ? truncateText(body, 1200) : undefined,
    horizontal_content_list: input.horizontalContentList,
    quote_area: buildQuoteArea(input.quoteText),
    button_selection: input.buttonSelection ? {
      question_key: input.buttonSelection.questionKey,
      title: input.buttonSelection.title,
      selected_id: input.buttonSelection.selectedId,
      option_list: input.buttonSelection.options.map((item) => mapOption(item, input.buttonSelection?.selectedId === item.id)),
    } : undefined,
    button_list: input.buttonList.map(mapActionDescriptor),
    task_id: sanitizeTaskId(input.taskId, `agent-button-${Date.now()}`),
  };
}

export function buildMultipleInteractionCard(input: {
  title: string;
  desc?: string;
  sourceDesc?: string;
  taskId: string;
  form: AgentTemplateMultipleFormDescriptor;
}): MultipleInteractionTemplateCard {
  const title = asNonEmptyString(input.title);
  if (!title) throw new Error("multiple_interaction.main_title.title is required");
  if (input.form.fields.length === 0) throw new Error("multiple_interaction.select_list must be non-empty");

  return {
    card_type: "multiple_interaction",
    source: defaultSource(input.sourceDesc),
    main_title: { title, desc: input.desc },
    select_list: input.form.fields.map((field) => ({
      question_key: field.questionKey,
      title: field.title,
      selected_id: field.selectedId,
      option_list: field.options.map((item) => mapOption(item, field.selectedId === item.id)),
    })),
    submit_button: {
      text: input.form.submit.text,
      key: input.form.submit.key,
    },
    task_id: sanitizeTaskId(input.taskId, `agent-multiple-${Date.now()}`),
    replace_text: input.form.replaceText,
  };
}

export function buildVoteInteractionCard(input: {
  title: string;
  desc?: string;
  sourceDesc?: string;
  taskId: string;
  vote: AgentTemplateVoteDescriptor;
}): VoteInteractionTemplateCard {
  const title = asNonEmptyString(input.title);
  if (!title) throw new Error("vote_interaction.main_title.title is required");
  if (input.vote.options.length === 0) throw new Error("vote_interaction.checkbox.option_list must be non-empty");

  return {
    card_type: "vote_interaction",
    source: defaultSource(input.sourceDesc),
    main_title: { title, desc: input.desc },
    checkbox: {
      question_key: input.vote.questionKey,
      mode: input.vote.mode,
      option_list: input.vote.options.map((item) => mapOption(item)),
    },
    submit_button: {
      text: input.vote.submit.text,
      key: input.vote.submit.key,
    },
    task_id: sanitizeTaskId(input.taskId, `agent-vote-${Date.now()}`),
    replace_text: input.vote.replaceText,
  };
}

export function validateTemplateCard(card: unknown, label = "template_card"): AgentTemplateCard {
  const record = ensureObject(card, label);
  if (record.card_type === "text_notice") {
    ensureMainTitle(record.main_title, label);
    if (!asNonEmptyString(record.sub_title_text)) throw new Error(`${label}.sub_title_text is required`);
    ensureHorizontalContentList(record.horizontal_content_list, label);
    ensureCardAction(record.card_action, label);
    ensureTaskId(record.task_id, `${label}.task_id`);
    return record as TextNoticeTemplateCard;
  }
  if (record.card_type === "button_interaction") {
    ensureMainTitle(record.main_title, label);
    ensureHorizontalContentList(record.horizontal_content_list, label);
    ensureButtonList(record.button_list, label);
    if (record.button_selection) {
      const buttonSelection = ensureObject(record.button_selection, `${label}.button_selection`);
      if (!asNonEmptyString(buttonSelection.question_key)) {
        throw new Error(`${label}.button_selection.question_key is required`);
      }
      ensureInteractiveOptions(buttonSelection.option_list, `${label}.button_selection.option_list`);
    }
    ensureTaskId(record.task_id, `${label}.task_id`, true);
    return record as ButtonInteractionTemplateCard;
  }
  if (record.card_type === "multiple_interaction") {
    ensureMainTitle(record.main_title, label);
    if (!Array.isArray(record.select_list) || record.select_list.length === 0) {
      throw new Error(`${label}.select_list must be a non-empty array`);
    }
    record.select_list.forEach((item, index) => {
      const selectItem = ensureObject(item, `${label}.select_list[${index}]`);
      if (!asNonEmptyString(selectItem.question_key)) {
        throw new Error(`${label}.select_list[${index}].question_key is required`);
      }
      if (!asNonEmptyString(selectItem.title)) {
        throw new Error(`${label}.select_list[${index}].title is required`);
      }
      ensureInteractiveOptions(selectItem.option_list, `${label}.select_list[${index}].option_list`);
    });
    const submit = ensureObject(record.submit_button, `${label}.submit_button`);
    if (!asNonEmptyString(submit.text) || !asNonEmptyString(submit.key)) {
      throw new Error(`${label}.submit_button.text and key are required`);
    }
    ensureTaskId(record.task_id, `${label}.task_id`, true);
    return record as MultipleInteractionTemplateCard;
  }
  if (record.card_type === "vote_interaction") {
    ensureMainTitle(record.main_title, label);
    const checkbox = ensureObject(record.checkbox, `${label}.checkbox`);
    if (!asNonEmptyString(checkbox.question_key)) {
      throw new Error(`${label}.checkbox.question_key is required`);
    }
    ensureInteractiveOptions(checkbox.option_list, `${label}.checkbox.option_list`);
    const submit = ensureObject(record.submit_button, `${label}.submit_button`);
    if (!asNonEmptyString(submit.text) || !asNonEmptyString(submit.key)) {
      throw new Error(`${label}.submit_button.text and key are required`);
    }
    ensureTaskId(record.task_id, `${label}.task_id`, true);
    return record as VoteInteractionTemplateCard;
  }
  throw new Error(`${label}.card_type ${String(record.card_type)} is not supported by current validator`);
}

export function summarizeForInteractiveCard(desc: string | undefined, body: string): string | undefined {
  const text = [desc, body]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(" | ");
  const normalized = asNonEmptyString(text);
  return normalized ? truncateText(normalized, 160) : undefined;
}
