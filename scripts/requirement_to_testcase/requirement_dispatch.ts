import { execFileSync } from "node:child_process";
import { existsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JsonObject } from "../shared/zentao_client";
import { parseJsonInput, type WecomMessagePayload, detectWecomMessageSource, extractAttachmentInfo } from "../shared/wecom_payload";
import { WecomClient } from "../shared/wecom_client";
import { extractOnlineDocCandidates } from "./wecom_online_doc_extractor";

export interface RequirementToTestcaseCommand {
  format: "excel" | "xmind" | "both";
}

export interface ResolvedAttachmentInfo {
  mediaId: string;
  filename?: string;
}

interface NpmRunner {
  command: string;
  baseArgs: string[];
}

const PACKAGE_ROOT = path.resolve(__dirname, "../../..");
const REQUIREMENT_TO_TESTCASE_TRIGGERS = [
  "生成测试用例",
  "根据需求写测试用例",
  "需求转测试用例",
  "导出测试用例",
  "根据文档生成测试用例",
  "测试案例",
];
const SHORT_REQUIREMENT_COMMAND_HINTS = [
  "生成测试用例",
  "分析此需求文档生成测试用例",
  "根据文档生成测试用例",
  "导出测试用例",
  "需求转测试用例",
  "测试案例",
];

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function resolveNpmRunner(): NpmRunner {
  const cliCandidates = [
    process.env.OPENCLAW_NPM_CLI_PATH,
    process.env.npm_execpath,
    path.resolve(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    path.resolve(path.dirname(process.execPath), "../node_modules/npm/bin/npm-cli.js"),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  for (const candidate of cliCandidates) {
    if (existsSync(candidate)) {
      return {
        command: process.execPath,
        baseArgs: [candidate],
      };
    }
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    baseArgs: [],
  };
}

function execNpmScript(scriptName: string, scriptArgs: string[]): string {
  const runner = resolveNpmRunner();
  return execFileSync(runner.command, [...runner.baseArgs, "run", "--silent", scriptName, "--", ...scriptArgs], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
  }).trim();
}

function getRouteAttachment(payload: WecomMessagePayload): ResolvedAttachmentInfo | null {
  const routeArgs = payload.route_args && typeof payload.route_args === "object" && !Array.isArray(payload.route_args)
    ? payload.route_args as Record<string, unknown>
    : undefined;
  if (!routeArgs || typeof routeArgs.mediaId !== "string" || !routeArgs.mediaId.trim()) {
    return null;
  }
  return {
    mediaId: routeArgs.mediaId.trim(),
    filename: typeof routeArgs.filename === "string" ? routeArgs.filename.trim() : undefined,
  };
}

export function isRequirementIntentText(text: string): boolean {
  return REQUIREMENT_TO_TESTCASE_TRIGGERS.some((trigger) => text.includes(trigger));
}

export function isRequirementToTestcaseRequest(text: string, payload: WecomMessagePayload): boolean {
  if (isRequirementIntentText(text)) {
    return true;
  }

  const attachment = extractAttachmentInfo(payload);
  return Boolean(attachment?.filename?.trim().toLowerCase().endsWith(".docx") && text.trim().length > 0);
}

export function extractRequirementToTestcaseCommand(text: string): RequirementToTestcaseCommand {
  const normalized = text.toLowerCase();
  const wantsXmind = normalized.includes("xmind") || text.includes("脑图");
  const wantsExcel = normalized.includes("excel") || normalized.includes("xlsx") || text.includes("表格");
  return {
    format: wantsXmind && wantsExcel ? "both" : wantsXmind ? "xmind" : "excel",
  };
}

export function isShortRequirementCommandWithoutDocument(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[，。！？,.!?:：；;（）()【】\[\]{}<>《》"'“”‘’]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!normalized || normalized.length > 30) {
    return false;
  }

  return SHORT_REQUIREMENT_COMMAND_HINTS.some((hint) => {
    const normalizedHint = hint
      .trim()
      .toLowerCase()
      .replace(/[，。！？,.!?:：；;（）()【】\[\]{}<>《》"'“”‘’]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
    return normalized === normalizedHint;
  });
}

export async function dispatchRequirementToTestcase(text: string, userid: string, payload: WecomMessagePayload): Promise<JsonObject> {
  const command = extractRequirementToTestcaseCommand(text);
  const attachment = extractAttachmentInfo(payload) ?? getRouteAttachment(payload);
  const routeArgs = payload.route_args && typeof payload.route_args === "object" && !Array.isArray(payload.route_args)
    ? payload.route_args as Record<string, unknown>
    : undefined;
  const onlineDocUrlFromRoute = typeof routeArgs?.onlineDocUrl === "string" ? routeArgs.onlineDocUrl.trim() : "";
  const onlineDocCandidates = onlineDocUrlFromRoute
    ? []
    : extractOnlineDocCandidates({ text, payload });
  const onlineDocUrl = onlineDocUrlFromRoute || onlineDocCandidates[0]?.url || "";
  const trimmedText = text.trim();

  if (!attachment && !trimmedText && !onlineDocUrl) {
    return {
      ok: true,
      userid,
      intent: "requirement-to-testcase",
      missing_args: [".docx 附件、在线文档链接或需求文本"],
      reply_text: [
        "已识别为需求转测试用例请求。",
        "请发送 .docx 需求文档、在线文档链接，或直接粘贴需求文本后重试。",
        "示例：上传 .docx 后发送“生成测试用例并导出excel”",
      ].join("\n"),
    };
  }

  if (!attachment && !onlineDocUrl && isShortRequirementCommandWithoutDocument(trimmedText)) {
    return {
      ok: true,
      userid,
      intent: "requirement-to-testcase",
      missing_args: [".docx 附件、在线文档链接或需求正文"],
      reply_text: [
        "已识别为需求转测试用例请求，但当前未检测到可读取的 .docx 附件或在线文档链接。",
        "请重新上传需求文档、发送在线文档链接后重试，或直接粘贴需求正文。",
        "仅发送“生成测试用例”这类短指令时，系统不会再把指令本身当成需求正文处理。",
      ].join("\n"),
    };
  }

  let tempFilePath: string | null = null;
  try {
    const cliArgs = [
      "--callback-mode",
      "--source-type",
      detectWecomMessageSource(payload),
      "--format",
      command.format,
    ];

    if (attachment) {
      if (!attachment.filename || !attachment.filename.trim().toLowerCase().endsWith(".docx")) {
        return {
          ok: true,
          userid,
          intent: "requirement-to-testcase",
          reply_text: "当前仅支持通过企业微信自建应用上传 .docx 需求文档。",
        };
      }

      const wecomClient = new WecomClient();
      const mediaFile = await wecomClient.downloadMedia(attachment.mediaId, attachment.filename);
      const filename = sanitizeFilename(mediaFile.filename || `${attachment.mediaId}.docx`);
      tempFilePath = path.join(tmpdir(), `openclaw-zentao-requirement-${Date.now()}-${filename}`);
      writeFileSync(tempFilePath, mediaFile.buffer);

      if (!existsSync(tempFilePath)) {
        throw new Error(`临时文件创建失败：${tempFilePath}`);
      }
      const tempStats = statSync(tempFilePath);
      if (tempStats.size === 0) {
        throw new Error(`临时文件为空：${tempFilePath}`);
      }

      cliArgs.push("--input-file", tempFilePath);
    } else if (onlineDocUrl) {
      cliArgs.push("--input-url", onlineDocUrl);
    } else {
      cliArgs.push("--input-text", trimmedText);
    }

    const output = execNpmScript("requirement-to-testcase", cliArgs);
    const result = parseJsonInput(output, "npm run requirement-to-testcase") as JsonObject;
    const outputFiles = Array.isArray(result.output_files)
      ? result.output_files.map((item) => String(item)).filter(Boolean)
      : [];

    if (outputFiles.length > 0) {
      const wecomClient = new WecomClient();
      for (const filePath of outputFiles) {
        const uploaded = await wecomClient.uploadTemporaryMedia(filePath);
        await wecomClient.sendFileToUsers([userid], uploaded.media_id);
      }
    }

    return {
      ...result,
      ok: result.ok === undefined ? true : result.ok,
      userid,
      intent: "requirement-to-testcase",
      route_script: "requirement-to-testcase",
      route_args: {
        format: command.format,
        mediaId: attachment?.mediaId,
        filename: attachment?.filename,
        onlineDocUrl: onlineDocUrl || undefined,
      },
      reply_text:
        typeof result.reply_text === "string" && result.reply_text.trim()
          ? result.reply_text
          : "需求转测试用例执行完成。",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      userid,
      intent: "requirement-to-testcase",
      route_script: "requirement-to-testcase",
      error: message,
      reply_text: `已识别为需求转测试用例请求，但执行失败：${message}`,
    };
  } finally {
    if (tempFilePath) {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // ignore cleanup failure for temp requirement file
      }
    }
  }
}
