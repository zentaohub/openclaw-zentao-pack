import type { RequirementSource } from "../types";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeHtmlText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function extractTitle(html: string, fallback: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtmlEntities(titleMatch?.[1]?.trim() || fallback);
}

export async function readOnlineDoc(input: {
  url: string;
  titleHint?: string;
}): Promise<RequirementSource> {
  const response = await fetch(input.url, {
    redirect: "follow",
    headers: {
      "User-Agent": "OpenClaw-RequirementToTestcase/1.0",
    },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`在线文档读取失败：HTTP ${response.status}`);
  }

  const rawText = normalizeHtmlText(body);
  const title = input.titleHint?.trim() || extractTitle(body, input.url);
  const warnings: string[] = [];

  if (rawText.length < 80) {
    warnings.push("在线文档已识别，但提取到的正文较少，可能需要登录态或页面只返回预览内容。");
  }

  return {
    sourceType: "url",
    sourceName: title,
    rawText,
    titleCandidate: title,
    warnings,
  };
}
