import { type JsonObject, type JsonValue } from "./zentao_client";

export interface WecomMessagePayload extends JsonObject {
  userid?: string;
  userId?: string;
  FromUserName?: string;
  fromUser?: string;
  from_user?: string;
  content?: string;
  text?: string;
  msgtype?: string;
  MsgType?: string;
  media_id?: string;
  fileName?: string;
  filename?: string;
  body?: JsonValue;
  sender?: JsonValue;
  session?: JsonValue;
}

export interface WecomAttachmentInfo {
  mediaId: string;
  filename?: string;
  msgType?: string;
}

export type WecomMessageSource = "bot" | "agent" | "unknown";

export interface WecomInteractiveSelectedItem {
  questionKey: string;
  optionIds: string[];
}

export interface WecomInteractiveEvent {
  cardType?: string;
  eventKey: string;
  taskId: string;
  responseCode?: string;
  selectedItems: WecomInteractiveSelectedItem[];
}

function getNestedString(record: JsonObject | undefined, keys: string[]): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function toObject(value: JsonValue | undefined): JsonObject | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return undefined;
}

function toArray(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function getNestedObject(record: JsonObject | undefined, keys: string[]): JsonObject | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = toObject(record[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getNestedArray(record: JsonObject | undefined, keys: string[]): JsonValue[] {
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const value = toArray(record[key]);
    if (value.length > 0) {
      return value;
    }
  }

  return [];
}

function normalizeOptionIds(value: JsonValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  const objectValue = toObject(value);
  if (!objectValue) {
    return [];
  }

  return getNestedArray(objectValue, ["option_id", "option_ids"])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function extractInteractiveSelectedItems(...candidates: Array<JsonObject | undefined>): WecomInteractiveSelectedItem[] {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const selectedItemsObject = getNestedObject(candidate, ["selected_items", "selectedItems"]);
    const selectedItemNodes = getNestedArray(selectedItemsObject, ["selected_item", "selectedItem"]);
    const parsedItems = selectedItemNodes
      .map((item) => toObject(item))
      .filter((item): item is JsonObject => Boolean(item))
      .map((item) => {
        const questionKey = getNestedString(item, ["question_key", "questionKey"]);
        const optionIds = normalizeOptionIds(item.option_ids ?? item.optionIds);
        return questionKey
          ? {
              questionKey,
              optionIds,
            } satisfies WecomInteractiveSelectedItem
          : null;
      })
      .filter((item): item is WecomInteractiveSelectedItem => Boolean(item));

    if (parsedItems.length > 0) {
      return parsedItems;
    }

    const singleQuestionKey = getNestedString(selectedItemsObject, ["question_key", "questionKey"]);
    if (singleQuestionKey) {
      return [{
        questionKey: singleQuestionKey,
        optionIds: normalizeOptionIds(selectedItemsObject?.option_ids ?? selectedItemsObject?.optionIds),
      }];
    }
  }

  return [];
}

export function parseJsonInput(raw: string, source: string): WecomMessagePayload {
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("payload must be a JSON object");
    }
    return parsed as WecomMessagePayload;
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${source}: ${(error as Error).message}`);
  }
}

export function extractUserid(payload: WecomMessagePayload): string | undefined {
  return (
    getNestedString(payload, ["userid", "userId", "FromUserName", "fromUser", "from_user"]) ??
    getNestedString(toObject(payload.sender), ["userid", "userId", "from_user_id", "id"]) ??
    getNestedString(toObject(payload.session), ["userid", "userId", "fromUser"])
  );
}

export function extractText(payload: WecomMessagePayload): string {
  return (
    getNestedString(payload, ["content", "text"]) ??
    getNestedString(toObject(payload.body), ["content", "text"]) ??
    getNestedString(toObject(payload.sender), ["content"]) ??
    ""
  );
}

export function extractAttachmentInfo(payload: WecomMessagePayload): WecomAttachmentInfo | null {
  const body = toObject(payload.body);
  const sender = toObject(payload.sender);
  const file = toObject(body?.file) ?? toObject(sender?.file);

  const mediaId = (
    getNestedString(payload, ["media_id"]) ??
    getNestedString(body, ["media_id", "mediaId"]) ??
    getNestedString(file, ["media_id", "mediaId"]) ??
    getNestedString(sender, ["media_id", "mediaId"])
  );

  if (!mediaId) {
    return null;
  }

  return {
    mediaId,
    filename: (
      getNestedString(payload, ["fileName", "filename"]) ??
      getNestedString(body, ["fileName", "filename"]) ??
      getNestedString(file, ["file_name", "fileName", "filename", "name"]) ??
      getNestedString(sender, ["fileName", "filename"])
    ),
    msgType: (
      getNestedString(payload, ["msgtype", "MsgType"]) ??
      getNestedString(body, ["msgtype", "MsgType", "type"]) ??
      getNestedString(file, ["msgtype", "MsgType", "type"])
    ),
  };
}

export function isDocxAttachmentPayload(payload: WecomMessagePayload): boolean {
  const attachment = extractAttachmentInfo(payload);
  if (!attachment?.filename) {
    return false;
  }
  return attachment.filename.trim().toLowerCase().endsWith(".docx");
}

export function detectWecomMessageSource(payload: WecomMessagePayload): WecomMessageSource {
  const body = toObject(payload.body);
  const sender = toObject(payload.sender);

  if (
    getNestedString(payload, ["msgtype", "userid", "userId", "response_url"]) ||
    getNestedString(body, ["msgtype"]) ||
    getNestedString(sender, ["userid", "userId", "from_user_id"])
  ) {
    return "bot";
  }

  if (
    getNestedString(payload, ["MsgType", "FromUserName", "ToUserName", "AgentID"]) ||
    getNestedString(body, ["MsgType", "FromUserName", "ToUserName", "AgentID"])
  ) {
    return "agent";
  }

  return "unknown";
}

export function extractInteractiveEvent(payload: WecomMessagePayload): WecomInteractiveEvent | null {
  const body = toObject(payload.body);
  const event = getNestedObject(payload, ["event"]) ?? getNestedObject(body, ["event"]);
  const templateCardEvent =
    getNestedObject(event, ["template_card_event", "templateCardEvent"]) ??
    getNestedObject(payload, ["template_card_event", "templateCardEvent", "TemplateCardEvent"]) ??
    getNestedObject(body, ["template_card_event", "templateCardEvent", "TemplateCardEvent"]);

  const candidates = [templateCardEvent, event, body, payload];
  const eventKey = candidates
    .map((candidate) => getNestedString(candidate, ["event_key", "eventKey", "EventKey"]))
    .find((value): value is string => Boolean(value));

  const selectedItems = extractInteractiveSelectedItems(templateCardEvent, event, body, payload);
  const taskId = candidates
    .map((candidate) => getNestedString(candidate, ["task_id", "taskId", "TaskId"]))
    .find((value): value is string => Boolean(value))
    ?? "";

  if (!eventKey && selectedItems.length === 0) {
    return null;
  }

  return {
    cardType: candidates
      .map((candidate) => getNestedString(candidate, ["card_type", "cardType"]))
      .find((value): value is string => Boolean(value)),
    eventKey: eventKey ?? "",
    taskId,
    responseCode: candidates
      .map((candidate) => getNestedString(candidate, ["response_code", "responseCode", "ResponseCode"]))
      .find((value): value is string => Boolean(value)),
    selectedItems,
  };
}

export function isInteractiveCardCallback(payload: WecomMessagePayload): boolean {
  return extractInteractiveEvent(payload) !== null;
}
