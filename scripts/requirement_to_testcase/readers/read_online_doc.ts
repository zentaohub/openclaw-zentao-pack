import type { RequirementSource } from "../types";
import { fetchWecomDocMarkdown } from "./wecom_doc_mcp_client";

const MIN_ONLINE_DOC_TEXT_LENGTH = 80;
const GENERIC_ONLINE_DOC_TITLES = new Set([
  "企业微信文档",
  "腾讯文档",
  "在线文档",
  "在线表格",
]);

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

function normalizeComparableText(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

function looksLikePlaceholderDocContent(rawText: string, title: string): boolean {
  const normalizedText = normalizeComparableText(rawText);
  if (!normalizedText) {
    return true;
  }

  const normalizedTitle = normalizeComparableText(title);
  if (normalizedTitle && normalizedText === normalizedTitle) {
    return true;
  }

  return GENERIC_ONLINE_DOC_TITLES.has(normalizedText);
}

function isWecomDocUrl(url: string): boolean {
  return /https?:\/\/doc\.weixin\.qq\.com\//i.test(url);
}

function parseMarkdownTitle(content: string, fallback: string): string {
  const heading = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line));
  return heading?.replace(/^#\s+/, "").trim() || fallback;
}

export async function readOnlineDoc(input: {
  url: string;
  titleHint?: string;
}): Promise<RequirementSource> {
  const warnings: string[] = [];
  const blockingWarnings: string[] = [];

  if (isWecomDocUrl(input.url)) {
    try {
      const mcpResult = await fetchWecomDocMarkdown({ url: input.url });
      return {
        sourceType: "url",
        sourceName: input.titleHint?.trim() || mcpResult.title,
        rawText: mcpResult.content,
        titleCandidate: parseMarkdownTitle(mcpResult.content, mcpResult.title),
        warnings,
        blockingWarnings,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`企业微信文档 MCP 正文提取失败：${message}`);
    }
  }

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

  if (rawText.length < MIN_ONLINE_DOC_TEXT_LENGTH) {
    warnings.push("在线文档已识别，但提取到的正文较少，可能需要登录态或页面只返回预览内容。");
  }

  if (rawText.length < MIN_ONLINE_DOC_TEXT_LENGTH && looksLikePlaceholderDocContent(rawText, title)) {
    blockingWarnings.push(
      "在线文档只提取到标题或预览占位内容，未获取到可用的需求正文。请确认文档是否可直接访问，或改为粘贴需求正文 / 上传可解析附件后重试。",
    );
  }

  return {
    sourceType: "url",
    sourceName: title,
    rawText,
    titleCandidate: title,
    warnings,
    blockingWarnings,
  };
}
