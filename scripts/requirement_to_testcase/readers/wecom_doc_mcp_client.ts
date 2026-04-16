import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

interface McpSession {
  sessionId: string | null;
  stateless: boolean;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface WecomMcpConfigEntry {
  type?: string;
  url?: string;
}

interface WecomMcpConfigFile {
  mcpConfig?: Record<string, WecomMcpConfigEntry>;
}

interface GetDocContentResult {
  errcode?: number;
  errmsg?: string;
  content?: string;
  task_id?: string;
  task_done?: boolean;
}

const MCP_PROTOCOL_VERSION = "2025-03-26";
const DEFAULT_POLL_ATTEMPTS = 8;
const DEFAULT_POLL_INTERVAL_MS = 1200;
const HTTP_TIMEOUT_MS = 30000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildReqId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getConfigPathCandidates(): string[] {
  const explicitPath = process.env.OPENCLAW_WECOM_MCP_CONFIG_PATH?.trim();
  return [
    explicitPath,
    path.join(os.homedir(), ".openclaw", "wecomConfig", "config.json"),
    path.join(os.homedir(), ".wecomConfig", "config.json"),
  ].filter((value): value is string => Boolean(value));
}

function loadMcpConfigUrl(): string | null {
  for (const configPath of getConfigPathCandidates()) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, "utf8")) as WecomMcpConfigFile;
      const docConfig = parsed.mcpConfig?.doc;
      if (typeof docConfig?.url === "string" && docConfig.url.trim()) {
        return docConfig.url.trim();
      }
    } catch {
      // continue
    }
  }
  return null;
}

async function parseSseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  const lines = text.split("\n");
  const events: string[] = [];
  let currentDataParts: string[] = [];

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      currentDataParts.push(line.slice(6));
      continue;
    }
    if (line.startsWith("data:")) {
      currentDataParts.push(line.slice(5));
      continue;
    }
    if (!line.trim() && currentDataParts.length > 0) {
      events.push(currentDataParts.join("\n").trim());
      currentDataParts = [];
    }
  }

  if (currentDataParts.length > 0) {
    events.push(currentDataParts.join("\n").trim());
  }

  const payload = events.reverse().find(Boolean);
  if (!payload) {
    throw new Error("企微文档 MCP 返回了空的 SSE 响应");
  }

  const rpc = JSON.parse(payload) as JsonRpcResponse;
  if (rpc.error) {
    throw new Error(`企微文档 MCP 调用失败 [${rpc.error.code}] ${rpc.error.message}`);
  }
  return rpc.result;
}

async function sendJsonRpc(url: string, session: McpSession, body: Record<string, unknown>): Promise<{
  result: unknown;
  sessionId: string | null;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (session.sessionId) {
      headers["Mcp-Session-Id"] = session.sessionId;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const nextSessionId = response.headers.get("mcp-session-id");
    if (!response.ok) {
      throw new Error(`企微文档 MCP HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return {
        result: undefined,
        sessionId: nextSessionId,
      };
    }

    if (contentType.includes("text/event-stream")) {
      return {
        result: await parseSseResponse(response),
        sessionId: nextSessionId,
      };
    }

    const text = await response.text();
    if (!text.trim()) {
      return {
        result: undefined,
        sessionId: nextSessionId,
      };
    }

    const rpc = JSON.parse(text) as JsonRpcResponse;
    if (rpc.error) {
      throw new Error(`企微文档 MCP 调用失败 [${rpc.error.code}] ${rpc.error.message}`);
    }

    return {
      result: rpc.result,
      sessionId: nextSessionId,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`企微文档 MCP 请求超时（${HTTP_TIMEOUT_MS}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function initializeSession(url: string): Promise<McpSession> {
  const session: McpSession = {
    sessionId: null,
    stateless: false,
  };

  const initResponse = await sendJsonRpc(url, session, {
    jsonrpc: "2.0",
    id: buildReqId("mcp_init"),
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "openclaw-requirement-to-testcase",
        version: "1.0.0",
      },
    },
  });
  session.sessionId = initResponse.sessionId;

  if (!session.sessionId) {
    session.stateless = true;
    return session;
  }

  const initializedResponse = await sendJsonRpc(url, session, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  if (initializedResponse.sessionId) {
    session.sessionId = initializedResponse.sessionId;
  }

  return session;
}

function parseMarkdownTitle(content: string, fallback: string): string {
  const heading = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line));
  return heading?.replace(/^#\s+/, "").trim() || fallback;
}

export async function fetchWecomDocMarkdown(input: {
  url: string;
  pollAttempts?: number;
  pollIntervalMs?: number;
}): Promise<{
  content: string;
  title: string;
}> {
  const mcpUrl = loadMcpConfigUrl();
  if (!mcpUrl) {
    throw new Error("未找到企业微信文档 MCP 配置，无法通过 get_doc_content 拉取正文");
  }

  const session = await initializeSession(mcpUrl);
  const pollAttempts = input.pollAttempts ?? DEFAULT_POLL_ATTEMPTS;
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  let taskId: string | undefined;
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    const response = await sendJsonRpc(mcpUrl, session, {
      jsonrpc: "2.0",
      id: buildReqId("mcp_call"),
      method: "tools/call",
      params: {
        name: "get_doc_content",
        arguments: {
          url: input.url,
          type: 2,
          ...(taskId ? { task_id: taskId } : {}),
        },
      },
    });

    if (response.sessionId) {
      session.sessionId = response.sessionId;
    }

    const result = response.result as {
      content?: Array<{ type?: string; text?: string }>;
      structuredContent?: GetDocContentResult;
    } | undefined;

    const structuredContent = result?.structuredContent;
    let parsedResult: GetDocContentResult | null = structuredContent ?? null;

    if (!parsedResult && Array.isArray(result?.content)) {
      const textBlock = result.content.find((item) => item.type === "text" && typeof item.text === "string");
      if (textBlock?.text) {
        try {
          parsedResult = JSON.parse(textBlock.text) as GetDocContentResult;
        } catch {
          parsedResult = { content: textBlock.text, task_done: true, errcode: 0 };
        }
      }
    }

    if (!parsedResult) {
      throw new Error("企业微信文档 MCP 返回了无法识别的结果结构");
    }

    if (parsedResult.errcode && parsedResult.errcode !== 0) {
      throw new Error(`企业微信文档 MCP 返回错误：${parsedResult.errmsg ?? parsedResult.errcode}`);
    }

    if (parsedResult.task_done && typeof parsedResult.content === "string" && parsedResult.content.trim()) {
      return {
        content: parsedResult.content.trim(),
        title: parseMarkdownTitle(parsedResult.content, "企业微信文档"),
      };
    }

    if (parsedResult.task_id) {
      taskId = parsedResult.task_id;
    }

    if (attempt < pollAttempts - 1) {
      await sleep(pollIntervalMs);
    }
  }

  throw new Error("企业微信文档正文导出仍在处理中，请稍后重试");
}
