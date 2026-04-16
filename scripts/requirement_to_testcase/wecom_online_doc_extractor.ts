import type { JsonObject, JsonValue } from "../shared/zentao_client";
import type { WecomMessagePayload } from "../shared/wecom_payload";

export interface OnlineDocCandidate {
  url: string;
  title?: string;
  source: "text_url" | "payload_url";
  docType: "wecom_doc" | "wecom_sheet" | "qq_doc" | "unknown";
}

const ONLINE_DOC_HOST_PATTERNS = [
  /doc\.weixin\.qq\.com/i,
  /docs\.qq\.com/i,
  /doc\.qq\.com/i,
];

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/[)>}\]，。；;]+$/u, "");
}

function isOnlineDocUrl(url: string): boolean {
  return ONLINE_DOC_HOST_PATTERNS.some((pattern) => pattern.test(url));
}

function detectDocType(url: string): OnlineDocCandidate["docType"] {
  const normalized = url.toLowerCase();
  if (normalized.includes("doc.weixin.qq.com") && normalized.includes("sheet")) {
    return "wecom_sheet";
  }
  if (normalized.includes("doc.weixin.qq.com")) {
    return "wecom_doc";
  }
  if (normalized.includes("docs.qq.com") || normalized.includes("doc.qq.com")) {
    return "qq_doc";
  }
  return "unknown";
}

function extractUrlsFromText(text: string): string[] {
  return Array.from(text.matchAll(/https?:\/\/\S+/giu))
    .map((match) => normalizeUrl(match[0]))
    .filter(isOnlineDocUrl);
}

function collectUrlsFromPayload(value: JsonValue | undefined, output: Set<string>): void {
  if (typeof value === "string") {
    for (const url of extractUrlsFromText(value)) {
      output.add(url);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectUrlsFromPayload(item, output);
    }
    return;
  }

  if (!isObject(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && /url|link|href|jump/i.test(key)) {
      const normalized = normalizeUrl(entry);
      if (isOnlineDocUrl(normalized)) {
        output.add(normalized);
      }
    }
    collectUrlsFromPayload(entry, output);
  }
}

function extractTitleHint(payload: WecomMessagePayload): string | undefined {
  const queue: JsonValue[] = [payload];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!isObject(current)) {
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (typeof value === "string" && /title|name|desc/i.test(key) && value.trim()) {
        return value.trim();
      }
      if (value !== undefined) {
        queue.push(value);
      }
    }
  }
  return undefined;
}

export function extractOnlineDocCandidates(input: {
  text: string;
  payload: WecomMessagePayload;
}): OnlineDocCandidate[] {
  const title = extractTitleHint(input.payload);
  const result: OnlineDocCandidate[] = [];
  const seen = new Set<string>();

  for (const url of extractUrlsFromText(input.text)) {
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    result.push({
      url,
      title,
      source: "text_url",
      docType: detectDocType(url),
    });
  }

  const payloadUrls = new Set<string>();
  collectUrlsFromPayload(input.payload, payloadUrls);
  for (const url of payloadUrls) {
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    result.push({
      url,
      title,
      source: "payload_url",
      docType: detectDocType(url),
    });
  }

  return result;
}

export function looksLikeOnlineDocCard(payload: WecomMessagePayload): boolean {
  return /doc\.weixin\.qq\.com|docs\.qq\.com|在线文档|在线表格|腾讯文档/i.test(JSON.stringify(payload));
}
