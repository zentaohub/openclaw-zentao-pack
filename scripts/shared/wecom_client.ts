import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { URL } from "node:url";
import { type JsonObject, type JsonValue, loadConfig } from "./zentao_client";

const DEFAULT_WECOM_API_BASE_URL = "https://qyapi.weixin.qq.com";
const TOKEN_CACHE_PATH = join(tmpdir(), "openclaw-zentao-wecom-token.json");
const TOKEN_REFRESH_BUFFER_MS = 60_000;

interface WecomConfig {
  api_base_url?: string;
  corp_id?: string;
  corp_secret?: string;
  contact_secret?: string;
  agent_id?: string | number;
  auto_sync_user?: boolean;
  root_department_id?: string | number;
}

interface WecomTokenCache {
  accessToken: string;
  expiresAt: number;
}

export interface WecomDirectoryUser extends JsonObject {
  userid?: string;
  name?: string;
  alias?: string;
  email?: string;
  mobile?: string;
  telephone?: string;
  gender?: string | number;
  department?: JsonValue;
  position?: string;
  status?: string | number;
  enable?: number;
  is_leader_in_dept?: JsonValue;
  main_department?: number;
}

export interface WecomDepartment extends JsonObject {
  id?: number;
  name?: string;
  name_en?: string;
  parentid?: number;
  order?: number;
}

interface WecomApiResponse extends JsonObject {
  errcode?: number;
  errmsg?: string;
}

export type WecomMessageType = "text" | "markdown" | "template_card" | "file";

export type WecomTemplateCardPayload = JsonObject;

interface WecomSendMessageRequest extends JsonObject {
  touser?: string;
  toparty?: string;
  totag?: string;
  msgtype: WecomMessageType;
  agentid: number;
  text?: {
    content: string;
  };
  markdown?: {
    content: string;
  };
  file?: {
    media_id: string;
  };
  template_card?: WecomTemplateCardPayload;
  safe?: 0 | 1;
}

interface WecomUploadMediaResponse extends WecomApiResponse {
  type?: string;
  media_id?: string;
  created_at?: string;
}

interface WecomDepartmentListResponse extends WecomApiResponse {
  department?: JsonValue;
}

interface WecomUserListResponse extends WecomApiResponse {
  userlist?: JsonValue;
}

export interface WecomMediaFile {
  buffer: Buffer;
  filename: string;
  contentType: string | null;
  mediaId: string;
}

export interface WecomUploadedMedia extends JsonObject {
  type: string;
  media_id: string;
  created_at?: string;
}

function readWecomConfig(): WecomConfig {
  const config = loadConfig() as JsonObject;
  const rawWecom = config.wecom;
  if (!rawWecom || typeof rawWecom !== "object" || Array.isArray(rawWecom)) {
    return {};
  }
  return rawWecom as WecomConfig;
}

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${label}: ${(error as Error).message}`);
  }
}

function normalizeBaseUrl(url: string | undefined): string {
  return (url ?? DEFAULT_WECOM_API_BASE_URL).replace(/\/+$/, "");
}

function createHttpsGetJson(requestUrl: string): Promise<WecomApiResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      requestUrl,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            reject(
              new Error(
                `WeCom request failed with status ${response.statusCode ?? 500}: ${bodyText}`,
              ),
            );
            return;
          }
          try {
            resolve(parseJson<WecomApiResponse>(bodyText, requestUrl));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}

function createHttpsPostJson(requestUrl: string, payload: JsonObject): Promise<WecomApiResponse> {
  return new Promise((resolve, reject) => {
    const bodyText = JSON.stringify(payload);
    const request = httpsRequest(
      requestUrl,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyText),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const responseText = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            reject(
              new Error(
                `WeCom request failed with status ${response.statusCode ?? 500}: ${responseText}`,
              ),
            );
            return;
          }
          try {
            resolve(parseJson<WecomApiResponse>(responseText, requestUrl));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("error", reject);
    request.write(bodyText);
    request.end();
  });
}

function createHttpsPostBuffer(
  requestUrl: string,
  body: Buffer,
  headers: Record<string, string | number>,
): Promise<WecomApiResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      requestUrl,
      {
        method: "POST",
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const responseText = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            reject(
              new Error(
                `WeCom request failed with status ${response.statusCode ?? 500}: ${responseText}`,
              ),
            );
            return;
          }
          try {
            resolve(parseJson<WecomApiResponse>(responseText, requestUrl));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function createHttpsGetBuffer(requestUrl: string): Promise<{
  body: Buffer;
  headers: Record<string, string | string[] | undefined>;
  statusCode: number;
}> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      requestUrl,
      {
        method: "GET",
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            headers: response.headers,
            statusCode: response.statusCode ?? 500,
          });
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}

function headerToString(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const joined = value.join("; ").trim();
    return joined || null;
  }
  return null;
}

function inferFilenameFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  fallbackMediaId: string,
): string {
  const disposition = headerToString(headers["content-disposition"]);
  if (disposition) {
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]);
    }

    const basicMatch = disposition.match(/filename="?([^"]+)"?/i);
    if (basicMatch?.[1]) {
      return basicMatch[1];
    }
  }

  const contentType = headerToString(headers["content-type"]) ?? "";
  if (contentType.includes("csv")) {
    return `${fallbackMediaId}.csv`;
  }
  if (contentType.includes("sheet") || contentType.includes("excel")) {
    return `${fallbackMediaId}.xlsx`;
  }
  return `${fallbackMediaId}.bin`;
}

function inferMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".txt") return "text/plain";
  return "application/octet-stream";
}

function encodeMultipartFormData(boundary: string, filename: string, buffer: Buffer): Buffer {
  const header = Buffer.from(
    `--${boundary}\r\n`
    + `Content-Disposition: form-data; name="media"; filename="${filename}"\r\n`
    + `Content-Type: ${inferMimeType(filename)}\r\n\r\n`,
    "utf8",
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return Buffer.concat([header, buffer, footer]);
}
function ensureOk<T extends WecomApiResponse>(response: T, action: string): T {
  if ((response.errcode ?? 0) !== 0) {
    throw new Error(
      `WeCom ${action} failed: ${response.errcode ?? "unknown"} ${response.errmsg ?? ""}`.trim(),
    );
  }
  return response;
}

export class WecomClient {
  private readonly apiBaseUrl: string;

  private readonly corpId?: string;

  private readonly corpSecret?: string;

  private readonly contactSecret?: string;

  private readonly agentId?: number;

  readonly rootDepartmentId: number;

  readonly autoSyncUser: boolean;

  constructor(options?: WecomConfig) {
    const config = readWecomConfig();
    this.apiBaseUrl = normalizeBaseUrl(
      options?.api_base_url ??
        process.env.WECOM_API_BASE_URL ??
        process.env.WXWORK_API_BASE_URL ??
        config.api_base_url,
    );
    this.corpId =
      options?.corp_id ??
      process.env.WECOM_CORP_ID ??
      process.env.WXWORK_CORP_ID ??
      config.corp_id;
    this.contactSecret =
      options?.contact_secret ??
      process.env.WECOM_CONTACT_SECRET ??
      process.env.WXWORK_CONTACT_SECRET ??
      config.contact_secret;
    this.corpSecret =
      options?.corp_secret ??
      process.env.WECOM_CORP_SECRET ??
      process.env.WXWORK_CORP_SECRET ??
      config.corp_secret;
    this.rootDepartmentId = normalizePositiveInteger(
      options?.root_department_id ??
        process.env.WECOM_ROOT_DEPARTMENT_ID ??
        process.env.WXWORK_ROOT_DEPARTMENT_ID ??
        config.root_department_id,
      1,
    );
    this.autoSyncUser = normalizeBoolean(
      options?.auto_sync_user ??
        process.env.WECOM_AUTO_SYNC_USER ??
        process.env.WXWORK_AUTO_SYNC_USER ??
        config.auto_sync_user,
      true,
    );
    this.agentId = normalizeOptionalPositiveInteger(
      options?.agent_id ??
        process.env.WECOM_AGENT_ID ??
        process.env.WXWORK_AGENT_ID ??
        config.agent_id,
    );
  }

  isConfigured(): boolean {
    return Boolean(this.corpId && this.getEffectiveSecret());
  }

  async getUser(userid: string): Promise<WecomDirectoryUser> {
    const normalizedUserid = userid.trim();
    if (!normalizedUserid) {
      throw new Error("WeCom userid cannot be empty");
    }
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.apiBaseUrl}/cgi-bin/user/get`);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("userid", normalizedUserid);
    const response = ensureOk(await createHttpsGetJson(url.toString()), "user.get");
    return response as WecomDirectoryUser;
  }

  async listDepartments(departmentId?: number): Promise<WecomDepartment[]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.apiBaseUrl}/cgi-bin/department/list`);
    url.searchParams.set("access_token", accessToken);
    if (departmentId !== undefined) {
      url.searchParams.set("id", String(departmentId));
    }
    const response = ensureOk(
      await createHttpsGetJson(url.toString()),
      "department.list",
    ) as WecomDepartmentListResponse;
    return extractDepartmentList(response.department);
  }

  async listDepartmentUsers(
    departmentId: number,
    options?: {
      fetchChild?: boolean;
      includeInactive?: boolean;
    },
  ): Promise<WecomDirectoryUser[]> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.apiBaseUrl}/cgi-bin/user/list`);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("department_id", String(departmentId));
    url.searchParams.set("fetch_child", options?.fetchChild === false ? "0" : "1");
    const response = ensureOk(
      await createHttpsGetJson(url.toString()),
      "user.list",
    ) as WecomUserListResponse;
    const users = extractUserList(response.userlist);
    if (options?.includeInactive) {
      return users;
    }
    return users.filter(isActiveWecomUser);
  }

  async listUsersByDepartments(
    departmentIds: number[],
    options?: {
      fetchChild?: boolean;
      includeInactive?: boolean;
    },
  ): Promise<WecomDirectoryUser[]> {
    const uniqueIds = Array.from(
      new Set(
        departmentIds
          .map((item) => normalizePositiveInteger(item, 0))
          .filter((item) => item > 0),
      ),
    );
    const userMap = new Map<string, WecomDirectoryUser>();

    for (const departmentId of uniqueIds) {
      const users = await this.listDepartmentUsers(departmentId, options);
      for (const user of users) {
        const userid = typeof user.userid === "string" ? user.userid.trim() : "";
        if (!userid) {
          continue;
        }
        if (!userMap.has(userid)) {
          userMap.set(userid, user);
        }
      }
    }

    return Array.from(userMap.values());
  }

  async sendAppMessage(payload: Omit<WecomSendMessageRequest, "agentid"> & { agentid?: number }): Promise<WecomApiResponse> {
    const accessToken = await this.getAccessToken();
    const agentid = payload.agentid ?? this.agentId;
    if (!agentid || !Number.isFinite(agentid) || agentid <= 0) {
      throw new Error("Missing WeCom agent_id. Fill wecom.agent_id in config.json.");
    }
    const url = new URL(`${this.apiBaseUrl}/cgi-bin/message/send`);
    url.searchParams.set("access_token", accessToken);
    return ensureOk(
      await createHttpsPostJson(url.toString(), {
        ...payload,
        agentid,
      }),
      "message.send",
    );
  }

  async sendMarkdownToUsers(userids: string[], content: string): Promise<WecomApiResponse> {
    const normalizedUsers = Array.from(
      new Set(
        userids
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
    if (normalizedUsers.length === 0) {
      throw new Error("WeCom markdown message requires at least one userid");
    }
    return this.sendAppMessage({
      touser: normalizedUsers.join("|"),
      msgtype: "markdown",
      markdown: { content },
      safe: 0,
    });
  }

  async sendFileToUsers(userids: string[], mediaId: string): Promise<WecomApiResponse> {
    const normalizedUsers = Array.from(
      new Set(
        userids
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
    if (normalizedUsers.length === 0) {
      throw new Error("WeCom file message requires at least one userid");
    }
    if (!mediaId.trim()) {
      throw new Error("WeCom file message requires a media_id");
    }
    return this.sendAppMessage({
      touser: normalizedUsers.join("|"),
      msgtype: "file",
      file: { media_id: mediaId.trim() },
      safe: 0,
    });
  }

  async uploadTemporaryMedia(filePath: string): Promise<WecomUploadedMedia> {
    const normalizedPath = path.resolve(filePath);
    if (!existsSync(normalizedPath)) {
      throw new Error(`WeCom upload file not found: ${normalizedPath}`);
    }

    const stats = statSync(normalizedPath);
    if (!stats.isFile()) {
      throw new Error(`WeCom upload path is not a file: ${normalizedPath}`);
    }

    const buffer = readFileSync(normalizedPath);
    const filename = path.basename(normalizedPath);
    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.apiBaseUrl}/cgi-bin/media/upload`);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("type", "file");

    const boundary = `----OpenClaw${Date.now()}${Math.random().toString(16).slice(2)}`;
    const body = encodeMultipartFormData(boundary, filename, buffer);
    const response = ensureOk(
      await createHttpsPostBuffer(url.toString(), body, {
        Accept: "application/json",
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.byteLength,
      }),
      "media.upload",
    ) as WecomUploadMediaResponse;

    const mediaId = typeof response.media_id === "string" ? response.media_id.trim() : "";
    if (!mediaId) {
      throw new Error("WeCom media.upload succeeded but media_id is empty");
    }

    return {
      type: typeof response.type === "string" && response.type.trim() ? response.type.trim() : "file",
      media_id: mediaId,
      created_at: typeof response.created_at === "string" ? response.created_at : undefined,
    };
  }

  async downloadMedia(mediaId: string, preferredFilename?: string): Promise<WecomMediaFile> {
    const normalizedMediaId = mediaId.trim();
    if (!normalizedMediaId) {
      throw new Error("WeCom media_id cannot be empty");
    }

    const accessToken = await this.getAccessToken();
    const url = new URL(`${this.apiBaseUrl}/cgi-bin/media/get`);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("media_id", normalizedMediaId);

    const response = await createHttpsGetBuffer(url.toString());
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`WeCom media.get failed with status ${response.statusCode}`);
    }

    const contentType = headerToString(response.headers["content-type"]);
    if (contentType?.includes("application/json")) {
      const payload = parseJson<WecomApiResponse>(response.body.toString("utf8"), url.toString());
      ensureOk(payload, "media.get");
      throw new Error("WeCom media.get returned JSON but no file content");
    }

    if (response.body.length === 0) {
      throw new Error("WeCom media.get returned empty file content");
    }

    return {
      buffer: response.body,
      filename: preferredFilename?.trim() || inferFilenameFromHeaders(response.headers, normalizedMediaId),
      contentType,
      mediaId: normalizedMediaId,
    };
  }

  private async getAccessToken(): Promise<string> {
    const cached = this.readTokenCache();
    if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
      return cached.accessToken;
    }

    const effectiveSecret = this.getEffectiveSecret();
    if (!this.corpId || !effectiveSecret) {
      throw new Error(
        "Missing WeCom credentials. Fill wecom.corp_id and wecom.contact_secret (or wecom.corp_secret) in config.json.",
      );
    }

    const url = new URL(`${this.apiBaseUrl}/cgi-bin/gettoken`);
    url.searchParams.set("corpid", this.corpId);
    url.searchParams.set("corpsecret", effectiveSecret);

    const response = ensureOk(await createHttpsGetJson(url.toString()), "gettoken");
    const accessToken =
      typeof response.access_token === "string" ? response.access_token.trim() : "";
    const expiresIn =
      typeof response.expires_in === "number" && Number.isFinite(response.expires_in)
        ? response.expires_in
        : 7200;

    if (!accessToken) {
      throw new Error("WeCom gettoken succeeded but access_token is empty");
    }

    const cache: WecomTokenCache = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
    return accessToken;
  }

  private getEffectiveSecret(): string | undefined {
    return this.contactSecret ?? this.corpSecret;
  }

  private readTokenCache(): WecomTokenCache | null {
    if (!existsSync(TOKEN_CACHE_PATH)) {
      return null;
    }

    try {
      const raw = readFileSync(TOKEN_CACHE_PATH, "utf8");
      const parsed = parseJson<WecomTokenCache>(raw, TOKEN_CACHE_PATH);
      if (!parsed.accessToken || !parsed.expiresAt) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}

function normalizeBoolean(value: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizePositiveInteger(
  value: number | string | undefined,
  fallback: number,
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeOptionalPositiveInteger(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function extractDepartmentList(value: JsonValue | undefined): WecomDepartment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isJsonObject) as WecomDepartment[];
}

function extractUserList(value: JsonValue | undefined): WecomDirectoryUser[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isJsonObject) as WecomDirectoryUser[];
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActiveWecomUser(user: WecomDirectoryUser): boolean {
  if (typeof user.enable === "number" && user.enable !== 1) {
    return false;
  }

  if (typeof user.status === "number") {
    return user.status === 1;
  }

  if (typeof user.status === "string" && user.status.trim()) {
    return user.status.trim() === "1";
  }

  return true;
}
