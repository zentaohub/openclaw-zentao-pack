import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { URL } from "node:url";

export const DEFAULT_BASE_URL = "http://zentao.lsym.cn/";
export const DEFAULT_TIMEOUT = 30_000;
export const SESSION_CACHE = join(tmpdir(), "openclaw-zentao-session.json");
export const ACTOR_AUTH_CACHE_PATH = join(homedir(), ".openclaw", "private", "zentao.actor-auth-cache.json");
export const MAX_REDIRECTS = 5;
export const OPENCLAW_ZENTAO_CONFIG_PATH = join(
  homedir(),
  ".openclaw",
  "private",
  "zentao.config.json",
);
export const ZBOX_ENV_PATH = "/opt/zbox/.env";
export const ZBOX_SECRETS_ENV_PATH = "/opt/zbox/.secrets.env";
export const ZBOX_MYSQL_BIN = "/opt/zbox/bin/mysql";
export const ZBOX_MYSQL_SOCKET = "/opt/zbox/tmp/mysql/mysql.sock";
export const DEFAULT_MYSQL_USER = "root";
export const DEFAULT_MYSQL_PASSWORD = "123456";
export const DEFAULT_ZENTAO_DATABASE = "zentao";
export const DEFAULT_ACTOR_AUTH_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
export const BOT_EXECUTION_NOTE = "通过禅道机器人或者AI-PMO自建应用执行";

type HttpMethod = "GET" | "POST" | "PUT";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

type FormValue = string | string[];

interface Config {
  base_url?: string;
  api_base_url?: string;
  account?: string;
  password?: string;
  userid?: string;
  verify_ssl?: boolean;
  wecom?: {
    api_base_url?: string;
    corp_id?: string;
    corp_secret?: string;
    contact_secret?: string;
    agent_id?: string | number;
    auto_sync_user?: boolean;
    root_department_id?: string | number;
  };
  user_match?: {
    fields?: string[];
    browse?: string;
    limit?: number;
  };
  user_sync?: {
    default_password?: string;
    default_role?: string;
    default_group?: number | string;
    default_visions?: string[] | string;
    default_dept?: number | string;
  };
  user_aliases?: Record<string, string>;
  web_routes?: {
    my_task_assigned?: string;
    my_bug_assigned?: string;
    user_list?: string;
  };
  debug?: {
    stop_on_failure?: boolean;
    tests?: DebugTest[];
  };
}

export type DebugAction =
  | "login"
  | "create_bug"
  | "update_task_status"
  | "get_progress"
  | "get_my_tasks"
  | "get_users";

export interface DebugTest {
  name: string;
  action: DebugAction;
  enabled?: boolean;
  force?: boolean;
  payload?: JsonObject;
  task_id?: number;
  entity_type?: "project" | "execution" | "task";
  entity_id?: number;
  include_children?: boolean;
}

interface SessionCookie {
  name: string;
  value: string;
}

interface SessionCache {
  token: string | null;
  cookies: SessionCookie[];
}

interface ActorCredential {
  account: string;
  passwordHash: string;
  realname?: string;
  source: string;
}

interface ActorAuthCacheEntry extends ActorCredential {
  cacheKey: string;
  cachedAt: string;
  userid?: string;
}

interface ActorAuthCacheFile {
  version: number;
  entries: Record<string, ActorAuthCacheEntry>;
}

interface MysqlRuntimeConfig {
  mysqlBin: string;
  socket: string;
  user: string;
  password: string;
  database: string;
}

interface HttpResponse {
  statusCode: number;
  bodyText: string;
  headers: Record<string, string | string[] | undefined>;
}

interface JsonPageEnvelope extends JsonObject {
  status?: string;
  data?: JsonValue;
  md5?: string;
}

export interface ZentaoUser extends JsonObject {
  id?: number;
  dept?: number;
  account?: string;
  realname?: string;
  role?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  gender?: string;
}

export interface ZentaoTask extends JsonObject {
  id?: number;
  name?: string;
  status?: string;
  assignedTo?: string;
  execution?: number | JsonObject;
  project?: number | JsonObject;
  estimate?: number;
  consumed?: number;
  left?: number;
  deadline?: string;
  pri?: number;
}

export interface WecomOrgUser extends JsonObject {
  userid?: string;
  userId?: string;
  account?: string;
  name?: string;
  realname?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  telephone?: string;
  gender?: string | number;
  department?: JsonValue;
  dept?: JsonValue;
  position?: string;
  role?: string;
  group?: string | number;
  password?: string;
  visions?: string[] | string;
}

export interface SyncUserResult extends JsonObject {
  ok: boolean;
  action: "created" | "updated" | "noop";
  matched_by?: string;
  account: string;
  userid: string | null;
  created_payload?: JsonObject;
  update_payload?: JsonObject;
  user: ZentaoUser;
}

const DEFAULT_USER_MATCH_FIELDS = [
  "userid",
  "userId",
  "wecomUserId",
  "wecom_userid",
  "weixin",
  "wechat",
  "account",
];
const DEFAULT_USER_LIST_LIMIT = 100;

export class HttpError extends Error {
  statusCode: number;

  responseText: string;

  headers: Record<string, string | string[] | undefined>;

  constructor(
    statusCode: number,
    responseText: string,
    headers: Record<string, string | string[] | undefined> = {},
    message?: string,
  ) {
    super(message ?? `Request failed with status ${statusCode}`);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.responseText = responseText;
    this.headers = headers;
  }
}

function findRepoRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (existsSync(join(current, "config.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

export const REPO_ROOT = findRepoRoot(__dirname);
export const CONFIG_PATH = join(REPO_ROOT, "config.json");
export const OPENCLAW_CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");

function parseJson<T>(rawText: string, context: string): T {
  try {
    return JSON.parse(rawText) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${context}: ${(error as Error).message}`);
  }
}

function normalizeSetCookie(rawHeader: string): SessionCookie | null {
  const firstSegment = rawHeader.split(";")[0]?.trim();
  if (!firstSegment) {
    return null;
  }
  const separatorIndex = firstSegment.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }
  return {
    name: firstSegment.slice(0, separatorIndex),
    value: firstSegment.slice(separatorIndex + 1),
  };
}

function encodeQuery(params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) {
    return "";
  }
  const searchParams = new URLSearchParams(params);
  return `?${searchParams.toString()}`;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class ZentaoClient {
  baseUrl: string;

  apiBaseUrl: string;

  account?: string;

  password?: string;

  passwordHash?: string;

  userid?: string;

  timeout: number;

  verifySsl: boolean;

  token: string | null = null;

  cookies = new Map<string, string>();

  matchedUser: ZentaoUser | null = null;

  userMatchFields: string[];

  userBrowse: string;

  userListLimit: number;

  userAliases: Record<string, string>;

  syncDefaultPassword?: string;

  syncDefaultRole?: string;

  syncDefaultGroup?: number;

  syncDefaultVisions: string[];

  syncDefaultDept?: number;

  webMyTaskAssignedRoute: string;

  webMyBugAssignedRoute: string;

  webUserListRoute: string;

  sessionCachePath: string;

  explicitCredentialMode: boolean;

  constructor(options?: {
    baseUrl?: string;
    apiBaseUrl?: string;
    account?: string;
    password?: string;
    passwordHash?: string;
    userid?: string;
    timeout?: number;
    verifySsl?: boolean;
    userMatchFields?: string[];
    userBrowse?: string;
    userListLimit?: number;
    syncDefaultPassword?: string;
    syncDefaultRole?: string;
    syncDefaultGroup?: number | string;
    syncDefaultVisions?: string[] | string;
    syncDefaultDept?: number | string;
    userAliases?: Record<string, string>;
  }) {
    const config = loadConfig();
    this.baseUrl = (
      options?.baseUrl ??
      process.env.ZENTAO_BASE_URL ??
      config.base_url ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
    this.apiBaseUrl = (
      options?.apiBaseUrl ??
      process.env.ZENTAO_API_BASE_URL ??
      config.api_base_url ??
      this.baseUrl
    ).replace(/\/+$/, "");
    this.account = options?.account ?? process.env.ZENTAO_ACCOUNT ?? config.account;
    this.password = options?.password ?? process.env.ZENTAO_PASSWORD ?? config.password;
    this.passwordHash = options?.passwordHash ?? process.env.ZENTAO_PASSWORD_HASH;
    this.userid = options?.userid ?? process.env.ZENTAO_USERID ?? config.userid;
    this.explicitCredentialMode = Boolean(
      options?.account ??
        options?.password ??
        options?.passwordHash ??
        process.env.ZENTAO_ACCOUNT ??
        process.env.ZENTAO_PASSWORD ??
        process.env.ZENTAO_PASSWORD_HASH,
    );
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    this.verifySsl = options?.verifySsl ?? config.verify_ssl ?? true;
    this.userMatchFields = normalizeUserMatchFields(
      options?.userMatchFields ?? config.user_match?.fields,
    );
    this.userBrowse = options?.userBrowse ?? config.user_match?.browse ?? "";
    this.userListLimit = normalizeUserListLimit(
      options?.userListLimit ?? config.user_match?.limit,
    );
    this.userAliases = normalizeUserAliasMap(options?.userAliases ?? config.user_aliases);
    this.syncDefaultPassword =
      options?.syncDefaultPassword ??
      process.env.ZENTAO_SYNC_DEFAULT_PASSWORD ??
      config.user_sync?.default_password;
    this.syncDefaultRole =
      options?.syncDefaultRole ??
      process.env.ZENTAO_SYNC_DEFAULT_ROLE ??
      config.user_sync?.default_role;
    this.syncDefaultGroup = normalizeOptionalInteger(
      options?.syncDefaultGroup ??
        process.env.ZENTAO_SYNC_DEFAULT_GROUP ??
        config.user_sync?.default_group,
    );
    this.syncDefaultVisions = normalizeVisions(
      options?.syncDefaultVisions ??
        process.env.ZENTAO_SYNC_DEFAULT_VISIONS ??
        config.user_sync?.default_visions,
    );
    this.syncDefaultDept = normalizeOptionalInteger(
      options?.syncDefaultDept ??
        process.env.ZENTAO_SYNC_DEFAULT_DEPT ??
        config.user_sync?.default_dept,
    );
    this.webMyTaskAssignedRoute =
      process.env.ZENTAO_WEB_MY_TASK_ASSIGNED ??
      config.web_routes?.my_task_assigned ??
      "/my-work-task-assignedTo.html";
    this.webMyBugAssignedRoute =
      process.env.ZENTAO_WEB_MY_BUG_ASSIGNED ??
      config.web_routes?.my_bug_assigned ??
      "/my-work-bug-assignedTo.html";
    this.webUserListRoute =
      process.env.ZENTAO_WEB_USER_LIST ??
      config.web_routes?.user_list ??
      "/user-ajax-getList-json-0-all-0-0-0-0-0-0-1-1.html";
    this.sessionCachePath = buildSessionCachePath(this.account ?? this.userid ?? "default");
    this.loadCachedSession();
  }

  async login(force = false): Promise<JsonObject> {
    await this.ensureActorCredentialsResolved(force);

    if (!force && (this.token || this.cookies.size > 0)) {
      if (!this.token && this.cookies.size > 0) {
        const validSession = await this.hasValidJsonSession();
        if (!validSession) {
          this.clearCachedSession();
        } else {
          return {
            ok: true,
            message: "session already loaded",
            token_loaded: false,
          };
        }
      } else {
        return {
          ok: true,
          message: "session already loaded",
          token_loaded: Boolean(this.token),
        };
      }
    }

    this.requireCredentials();

    let loginMode: "rest" | "web-ajax" = "rest";
    let endpoint = `${this.apiBaseUrl}/api.php/v1/tokens`;
    let data: JsonObject;

    try {
      data = await this.sendJsonRequest("POST", endpoint, {
        account: this.account as string,
        password: this.passwordHash ?? (this.password as string),
      });

      const token = typeof data.token === "string" ? data.token : null;
      if (token) {
        this.token = token;
      }
    } catch (error) {
      loginMode = "web-ajax";
      endpoint = `${this.baseUrl}/user-login.html`;
      data = await this.loginWithWebAjax(this.webMyTaskAssignedRoute);
    }

    let matchedUser: ZentaoUser | null = null;
    if (this.userid) {
      try {
        matchedUser = await this.findUserByUserid(this.userid);
      } catch {
        matchedUser = null;
      }
    }
    this.matchedUser = matchedUser;
    this.saveCachedSession();
    return {
      ok: true,
      endpoint,
      login_mode: loginMode,
      token_loaded: Boolean(this.token),
      userid: this.userid ?? null,
      matched_user: matchedUser,
      data,
    };
  }

  async request(
    method: HttpMethod,
    endpoint: string,
    options?: {
      jsonBody?: JsonObject;
      params?: Record<string, string>;
      retryOnAuth?: boolean;
    },
  ): Promise<JsonObject> {
    const url = `${this.apiBaseUrl}/${endpoint.replace(/^\/+/, "")}${encodeQuery(options?.params)}`;
    const retryOnAuth = options?.retryOnAuth ?? true;

    if (!this.token && retryOnAuth) {
      await this.login(false);
    }

    try {
      const data = await this.sendJsonRequest(method, url, options?.jsonBody);
      this.saveCachedSession();
      return data;
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 401 && retryOnAuth) {
        this.clearCachedSession();
        await this.login(true);
        return this.request(method, endpoint, {
          jsonBody: options?.jsonBody,
          params: options?.params,
          retryOnAuth: false,
        });
      }
      throw error;
    }
  }

  async createBug(payload: JsonObject): Promise<JsonObject> {
    const normalizedPayload = withExecutionNote(payload, ["steps", "title"]);
    try {
      return await this.request("POST", "/api.php/v1/bugs", { jsonBody: normalizedPayload });
    } catch {
      return this.createBugViaWeb(normalizedPayload);
    }
  }

  async assignBug(bugId: number, payload: JsonObject): Promise<JsonObject> {
    return this.assignBugViaWeb(bugId, withExecutionNote(payload, ["comment"]));
  }

  async updateTaskStatus(taskId: number, payload: JsonObject): Promise<JsonObject> {
    const status = payload.status;
    const endpointMap: Record<string, string> = {
      doing: `/api.php/v1/tasks/${taskId}/start`,
      done: `/api.php/v1/tasks/${taskId}/finish`,
      pause: `/api.php/v1/tasks/${taskId}/pause`,
      closed: `/api.php/v1/tasks/${taskId}/close`,
      activate: `/api.php/v1/tasks/${taskId}/activate`,
    };

    if (typeof status !== "string" || !(status in endpointMap)) {
      throw new Error(
        `Unsupported task status: ${String(status)}. Supported: ${Object.keys(endpointMap)
          .sort()
          .join(", ")}`,
      );
    }

    const { status: _ignored, ...requestPayload } = payload;

    try {
      return await this.request("POST", endpointMap[status], { jsonBody: withExecutionNote(requestPayload, ["comment"]) });
    } catch {
      return this.updateTaskStatusViaWeb(taskId, status, withExecutionNote(requestPayload, ["comment"]));
    }
  }


  async updateBugStatus(bugId: number, payload: JsonObject): Promise<JsonObject> {
    const status = payload.status;
    if (typeof status !== "string") {
      throw new Error(`Unsupported bug status: ${String(status)}`);
    }

    return this.updateBugStatusViaWeb(bugId, status, withExecutionNote(payload, ["comment"]));
  }

  async createStory(payload: JsonObject): Promise<JsonObject> {
    return this.createStoryViaWeb(withExecutionNote(payload, ["spec", "verify"]));
  }

  async reviewStory(storyId: number, payload: JsonObject): Promise<JsonObject> {
    return this.reviewStoryViaWeb(storyId, withExecutionNote(payload, ["comment"]));
  }

  async createRelease(payload: JsonObject): Promise<JsonObject> {
    return this.createReleaseViaWeb(withExecutionNote(payload, ["desc", "name"]));
  }

  async updateStoryStatus(storyId: number, payload: JsonObject): Promise<JsonObject> {
    return this.updateStoryStatusViaWeb(storyId, withExecutionNote(payload, ["comment"]));
  }

  async updateReleaseStatus(releaseId: number, payload: JsonObject): Promise<JsonObject> {
    return this.updateReleaseStatusViaWeb(releaseId, withExecutionNote(payload, ["comment"]));
  }

  async linkReleaseStories(releaseId: number, payload: JsonObject): Promise<JsonObject> {
    return this.linkReleaseStoriesViaWeb(releaseId, payload);
  }

  async linkReleaseBugs(releaseId: number, payload: JsonObject): Promise<JsonObject> {
    return this.linkReleaseBugsViaWeb(releaseId, payload);
  }

  async linkExecutionStories(executionId: number, payload: JsonObject): Promise<JsonObject> {
    return this.linkExecutionStoriesViaWeb(executionId, payload);
  }

  async createTask(payload: JsonObject): Promise<JsonObject> {
    return this.createTaskViaWeb(withExecutionNote(payload, ["desc", "name"]));
  }

  async createProduct(payload: JsonObject): Promise<JsonObject> {
    return this.createProductViaWeb(withExecutionNote(payload, ["desc", "name"]));
  }

  async createProductModules(productId: number, payload: JsonObject): Promise<JsonObject> {
    return this.createProductModulesViaWeb(productId, payload);
  }

  async createTestcase(payload: JsonObject): Promise<JsonObject> {
    return this.createTestcaseViaWeb(withExecutionNote(payload, ["precondition"]));
  }

  async createTesttask(payload: JsonObject): Promise<JsonObject> {
    return this.createTesttaskViaWeb(withExecutionNote(payload, ["name", "desc"]));
  }

  async linkTesttaskCases(testtaskId: number, payload: JsonObject): Promise<JsonObject> {
    return this.linkTesttaskCasesViaWeb(testtaskId, payload);
  }

  async runTesttaskCase(runId: number, payload: JsonObject): Promise<JsonObject> {
    return this.runTesttaskCaseViaWeb(runId, withExecutionNote(payload, ["comment"]));
  }

  async updateTesttaskStatus(testtaskId: number, payload: JsonObject): Promise<JsonObject> {
    return this.updateTesttaskStatusViaWeb(testtaskId, withExecutionNote(payload, ["comment"]));
  }

  async addTeamMember(payload: JsonObject): Promise<JsonObject> {
    return this.addTeamMemberViaWeb(payload);
  }

  async getProgress(
    entityType: "project" | "execution" | "task",
    entityId: number,
    includeChildren = false,
  ): Promise<JsonObject> {
    const endpointMap = {
      project: `/api.php/v1/projects/${entityId}`,
      execution: `/api.php/v1/executions/${entityId}`,
      task: `/api.php/v1/tasks/${entityId}`,
    } as const;

    if (!(entityType in endpointMap)) {
      throw new Error(`Unsupported entityType: ${entityType}`);
    }

    return this.request("GET", endpointMap[entityType], {
      params: {
        includeChildren: String(includeChildren),
      },
    });
  }

  async getTasks(status = "all", page = 1, limit = 100): Promise<ZentaoTask[]> {
    const data = await this.request("GET", "/api.php/v1/tasks", {
      params: {
        status,
        page: String(page),
        limit: String(limit),
      },
    });
    return extractTasks(data);
  }

  async getMyTasks(options?: {
    status?: string;
    limit?: number;
    pageSize?: number;
  }): Promise<{
    matchedUser: ZentaoUser | null;
    identifiers: string[];
    tasks: ZentaoTask[];
  }> {
    const status = options?.status ?? "all";
    const limit = normalizePositiveInteger(options?.limit, 50);
    const pageSize = normalizePositiveInteger(options?.pageSize, 100);
    const matchedUser = await this.resolveCurrentUser();
    const identifiers = buildUserIdentifiers(matchedUser, this.userid, this.account);
    let tasks: ZentaoTask[];

    try {
      tasks = await this.listTasksAssignedTo(identifiers, status, limit, pageSize);
    } catch (error) {
      tasks = await this.listTasksAssignedToViaJsonView(identifiers, limit);
    }

    return {
      matchedUser,
      identifiers,
      tasks,
    };
  }

  async getUsers(options?: {
    limit?: number;
    pageSize?: number;
  }): Promise<{
    matchedUser: ZentaoUser | null;
    users: ZentaoUser[];
  }> {
    const limit = normalizePositiveInteger(options?.limit, Number.POSITIVE_INFINITY);
    const pageSize = normalizePositiveInteger(options?.pageSize, this.userListLimit);
    const users = await this.listAllUsers(pageSize, limit);
    const matchedUser = await this.resolveCurrentUser();

    return {
      matchedUser,
      users,
    };
  }

  async getWebJsonViewData(route: string): Promise<JsonObject> {
    await this.login(false);
    const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
    const url = `${this.baseUrl}/${normalizedRoute.replace(/^\/+/, "")}`;
    const response = await this.sendJsonRequest("GET", url);
    const parsedData = parseEnvelopeData(response.data, url);

    if (isJsonObject(parsedData)) {
      return parsedData;
    }

    if (isJsonObject(response)) {
      return response;
    }

    throw new Error(`Unexpected ZenTao Web JSON payload from ${url}`);
  }

  async getWebPage(route: string): Promise<string> {
    await this.login(false);
    const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
    const url = `${this.baseUrl}/${normalizedRoute.replace(/^\/+/, "")}`;
    const response = await this.fetchWithSession(url, {
      headers: {
        "User-Agent": "OpenClaw-Zentao/1.0",
      },
    });
    return response.bodyText;
  }

  async findUserByUserid(userid: string): Promise<ZentaoUser> {
    const normalizedUserid = userid.trim();
    if (!normalizedUserid) {
      throw new Error("userid cannot be empty");
    }

    const users = await this.listAllUsers();
    const matchedUser = users.find((user) => this.userMatchesUserid(user, normalizedUserid));
    if (!matchedUser) {
      throw new Error(
        `No Zentao user matched userid '${normalizedUserid}'. Checked fields: ${this.userMatchFields.join(", ")}`,
      );
    }
    return matchedUser;
  }

  async getUser(userId: number): Promise<ZentaoUser> {
    const data = await this.request("GET", `/api.php/v1/users/${userId}`, {
      retryOnAuth: false,
    });
    return extractSingleUser(data);
  }

  async listUsers(): Promise<ZentaoUser[]> {
    return this.listAllUsers();
  }

  async findUserByAccount(account: string): Promise<ZentaoUser> {
    const normalizedAccount = normalizeComparableText(account);
    if (!normalizedAccount) {
      throw new Error("account cannot be empty");
    }

    const users = await this.listAllUsers();
    const matchedUser = users.find(
      (user) => normalizeComparableText(user.account) === normalizedAccount,
    );
    if (!matchedUser) {
      throw new Error(`No Zentao user matched account '${account.trim()}'`);
    }
    return matchedUser;
  }

  async createUser(payload: JsonObject): Promise<ZentaoUser> {
    const data = await this.request("POST", "/api.php/v1/users", {
      jsonBody: payload,
    });
    return extractSingleUser(data);
  }

  async updateUser(userId: number, payload: JsonObject): Promise<ZentaoUser> {
    const data = await this.request("PUT", `/api.php/v1/users/${userId}`, {
      jsonBody: payload,
    });
    return extractSingleUser(data);
  }

  async syncWecomUser(input: WecomOrgUser): Promise<SyncUserResult> {
    await this.login(false);

    const normalizedInput = normalizeWecomOrgUser(input);
    const userid = getWecomUserid(normalizedInput);
    const account = resolveSyncAccount(normalizedInput);
    if (!account) {
      throw new Error(
        "Cannot determine Zentao account for sync. Provide account, userid/userId, or email.",
      );
    }

    let existing: {
      user: ZentaoUser | null;
      matchedBy?: string;
    };
    try {
      existing = await this.findExistingUserForSync(normalizedInput, account, userid);
    } catch {
      return this.syncWecomUserViaWebUpsert(normalizedInput, account, userid);
    }
    if (!existing.user) {
      try {
        const password = firstNonEmptyString(
          typeof normalizedInput.password === "string" ? normalizedInput.password : undefined,
          this.syncDefaultPassword,
        );
        if (!password) {
          throw new Error(
            "Sync needs a password when creating a new Zentao user. Set user_sync.default_password in config.json, ZENTAO_SYNC_DEFAULT_PASSWORD, or provide password in the sync payload.",
          );
        }

        const createdPayload = buildCreateUserPayload(normalizedInput, {
          account,
          password,
          defaultRole: this.syncDefaultRole,
          defaultGroup: this.syncDefaultGroup,
          defaultDept: this.syncDefaultDept,
          defaultVisions: this.syncDefaultVisions,
        });
        const createdUser = await this.createUser(createdPayload);

        const updatePayload = buildUpdateUserPayload(normalizedInput, {
          defaultRole: this.syncDefaultRole,
          defaultDept: this.syncDefaultDept,
        });
        const hasUpdateFields = Object.keys(updatePayload).length > 0;
        const finalUser =
          hasUpdateFields && typeof createdUser.id === "number"
            ? await this.updateUser(createdUser.id, updatePayload)
            : createdUser;

        return {
          ok: true,
          action: hasUpdateFields ? "updated" : "created",
          matched_by: existing.matchedBy,
          account,
          userid,
          created_payload: createdPayload,
          update_payload: hasUpdateFields ? updatePayload : undefined,
          user: finalUser,
        };
      } catch {
        return this.syncWecomUserViaWebUpsert(normalizedInput, account, userid);
      }
    }

    if (typeof existing.user.id !== "number") {
      throw new Error(`Matched Zentao user '${account}' is missing numeric id`);
    }

    const updatePayload = buildDiffUpdatePayload(
      existing.user,
      buildUpdateUserPayload(normalizedInput, {
        defaultRole: this.syncDefaultRole,
        defaultDept: this.syncDefaultDept,
      }),
    );
    if (Object.keys(updatePayload).length === 0) {
      return {
        ok: true,
        action: "noop",
        matched_by: existing.matchedBy,
        account,
        userid,
        user: existing.user,
      };
    }

    const updatedUser = await this.updateUser(existing.user.id, updatePayload);
    return {
      ok: true,
      action: "updated",
      matched_by: existing.matchedBy,
      account,
      userid,
      update_payload: updatePayload,
      user: updatedUser,
    };
  }

  private async createBugViaWeb(payload: JsonObject): Promise<JsonObject> {
    const productId = numberOrUndefined(payload.product);
    if (!productId) {
      throw new Error("Bug create requires numeric payload.product");
    }

    const branch = stringifyOptional(payload.branch) ?? "0";
    const moduleId = numberOrUndefined(payload.module) ?? 0;
    const projectId = numberOrUndefined(payload.project) ?? 0;
    const executionId = numberOrUndefined(payload.execution) ?? 0;
    const storyId = numberOrUndefined(payload.story) ?? 0;
    const caseId = numberOrUndefined(payload.case) ?? 0;
    const runId = numberOrUndefined(payload.run) ?? 0;
    const extras = [
      `moduleID=${moduleId}`,
      `projectID=${projectId}`,
      `executionID=${executionId}`,
      `storyID=${storyId}`,
      `caseID=${caseId}`,
      `runID=${runId}`,
    ].join(",");
    const route = `/bug-create-${productId}-${branch}-${extras}.html`;

    const title = firstNonEmptyString(typeof payload.title === "string" ? payload.title : undefined);
    if (!title) {
      throw new Error("Bug create requires payload.title");
    }

    const openedBuilds = normalizeStringListInput(payload.openedBuild ?? payload.openedBuilds ?? payload.builds ?? payload.build);
    if (openedBuilds.length === 0) {
      throw new Error("Bug create requires at least one opened build");
    }

    const formBody: Record<string, string> = {
      title,
      product: String(productId),
      branch,
      module: String(moduleId),
      project: String(projectId),
      execution: String(executionId),
      assignedTo: firstNonEmptyString(typeof payload.assignedTo === "string" ? payload.assignedTo : undefined, this.userid, this.account, "admin") ?? "admin",
      deadline: typeof payload.deadline === "string" ? payload.deadline : "",
      feedbackBy: typeof payload.feedbackBy === "string" ? payload.feedbackBy : "",
      notifyEmail: typeof payload.notifyEmail === "string" ? payload.notifyEmail : "",
      type: firstNonEmptyString(typeof payload.type === "string" ? payload.type : undefined, "codeerror") ?? "codeerror",
      color: typeof payload.color === "string" ? payload.color : "",
      severity: stringifyOptional(payload.severity) ?? "3",
      pri: stringifyOptional(payload.pri) ?? "3",
      steps: typeof payload.steps === "string" ? payload.steps : "",
      story: String(storyId),
      task: stringifyOptional(payload.task) ?? "0",
      case: String(caseId),
      caseVersion: stringifyOptional(payload.caseVersion) ?? "1",
      result: stringifyOptional(payload.result) ?? "0",
      testtask: stringifyOptional(payload.testtask) ?? "0",
      keywords: typeof payload.keywords === "string" ? payload.keywords : "",
      status: firstNonEmptyString(typeof payload.status === "string" ? payload.status : undefined, "active") ?? "active",
    };

    openedBuilds.forEach((build, index) => {
      formBody[`openedBuild[${index}]`] = build;
    });

    const osList = normalizeStringListInput(payload.os);
    osList.forEach((os, index) => {
      formBody[`os[${index}]`] = os;
    });
    const browserList = normalizeStringListInput(payload.browser);
    browserList.forEach((browser, index) => {
      formBody[`browser[${index}]`] = browser;
    });
    const relatedBugList = normalizeStringListInput(payload.relatedBug);
    relatedBugList.forEach((bug, index) => {
      formBody[`relatedBug[${index}]`] = bug;
    });
    const mailtoList = normalizeStringListInput(payload.mailto);
    mailtoList.forEach((account, index) => {
      formBody[`mailto[${index}]`] = account;
    });

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web bug create failed: ${response.bodyText}`);
    }

    const listView = await this.getWebJsonViewData(`/bug-browse-${productId}-all-0-id_desc-0-100-1.json`);
    const bugItems = Array.isArray(listView.bugs)
      ? listView.bugs.filter(isJsonObject)
      : isJsonObject(listView.bugs)
        ? Object.values(listView.bugs).filter(isJsonObject)
        : [];
    const matchedBug = bugItems.find((item) => item.title === title);
    const bugId = matchedBug ? numberOrUndefined(matchedBug.id) : undefined;
    const detail = bugId ? await this.getWebJsonViewData(`/bug-view-${bugId}.json`) : null;

    return {
      ok: true,
      route,
      bug_id: bugId,
      form: formBody,
      response: responseData,
      bug: detail?.bug ?? matchedBug ?? null,
    };
  }

  private async assignBugViaWeb(bugId: number, payload: JsonObject): Promise<JsonObject> {
    const bugView = await this.getWebJsonViewData(`/bug-view-${bugId}.json`);
    const bug = isJsonObject(bugView.bug) ? bugView.bug : bugView;
    if (!isJsonObject(bug)) {
      throw new Error(`Bug payload missing for bug ${bugId}`);
    }

    const assignedTo = firstNonEmptyString(typeof payload.assignedTo === "string" ? payload.assignedTo : undefined);
    if (!assignedTo) {
      throw new Error("Bug assign requires payload.assignedTo");
    }

    const route = `/bug-assignTo-${bugId}.html`;
    const comment = typeof payload.comment === "string" ? payload.comment : "";
    const formBody: Record<string, string> = {
      assignedTo,
      assignedDate: firstNonEmptyString(typeof payload.assignedDate === "string" ? payload.assignedDate : undefined, currentDateString()) ?? currentDateString(),
      lastEditedBy: this.account ?? this.userid ?? "admin",
      lastEditedDate: firstNonEmptyString(typeof payload.lastEditedDate === "string" ? payload.lastEditedDate : undefined, currentDateString()) ?? currentDateString(),
      comment,
    };

    const mailtoList = normalizeStringListInput(payload.mailto);
    mailtoList.forEach((account, index) => {
      formBody[`mailto[${index}]`] = account;
    });

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web bug assign failed for bug ${bugId}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(`/bug-view-${bugId}.json`);
    return {
      ok: true,
      route,
      bug_id: bugId,
      form: formBody,
      response: responseData,
      bug: latestView.bug ?? null,
    };
  }

  private async updateTaskStatusViaWeb(
    taskId: number,
    status: string,
    payload: JsonObject,
  ): Promise<JsonObject> {
    const taskView = await this.getWebJsonViewData(`/task-view-${taskId}.json`);
    const task = isJsonObject(taskView.task) ? taskView.task : null;
    if (!task) {
      throw new Error(`Task payload missing for task ${taskId}`);
    }

    const taskAccount = firstNonEmptyString(
      typeof task.assignedTo === "string" ? task.assignedTo : undefined,
      this.userid,
      this.account,
      "admin",
    ) ?? "admin";
    const currentLeft = normalizeOptionalInteger(task.left) ?? 0;
    const currentConsumed = normalizeOptionalInteger(task.consumed) ?? 0;
    const estimate = normalizeOptionalInteger(task.estimate) ?? 0;
    const leftHours = normalizeOptionalInteger(payload.leftHours);
    const consumedHours = normalizeOptionalInteger(payload.consumedHours);
    const comment = typeof payload.comment === "string" ? payload.comment : "";

    const routeMap: Record<string, string> = {
      doing: `/task-start-${taskId}.html`,
      done: `/task-finish-${taskId}.html`,
      pause: `/task-pause-${taskId}.html`,
      closed: `/task-close-${taskId}.html`,
      activate: `/task-activate-${taskId}.html`,
    };
    const route = routeMap[status];
    if (!route) {
      throw new Error(`Unsupported web task status route: ${status}`);
    }

    const formBody: Record<string, string> = {
      comment,
      uid: taskAccount,
      mode: "onlybody",
    };

    if (status === "doing") {
      formBody.consumed = String(consumedHours ?? 0);
      formBody.left = String(leftHours ?? Math.max(currentLeft, estimate - currentConsumed));
    } else if (status === "done") {
      formBody.currentConsumed = String(consumedHours ?? 0);
      formBody.assignedTo = taskAccount;
    } else if (status === "activate") {
      formBody.left = String(leftHours ?? Math.max(currentLeft, 1));
    } else if (status === "pause") {
      formBody.status = "pause";
    }

    const response = await this.sendFormRequest(
      "POST",
      `${this.baseUrl}/${route.replace(/^\/+/, "")}`,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: `${this.baseUrl}/${route.replace(/^\/+/, "")}`,
        Origin: this.baseUrl,
      },
    );

    const result = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(result) || result.result !== "success") {
      throw new Error(`ZenTao web task status update failed for task ${taskId}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(`/task-view-${taskId}.json`);
    return {
      ok: true,
      route,
      status,
      task_id: taskId,
      form: formBody,
      response: result,
      task: latestView.task,
    };
  }

  private async updateBugStatusViaWeb(
    bugId: number,
    status: string,
    payload: JsonObject,
  ): Promise<JsonObject> {
    const bugView = await this.getWebJsonViewData(`/bug-view-${bugId}.json`);
    const bug = isJsonObject(bugView.bug) ? bugView.bug : bugView;
    if (!isJsonObject(bug)) {
      throw new Error(`Bug payload missing for bug ${bugId}`);
    }

    const routeMap: Record<string, string> = {
      resolve: `/bug-resolve-${bugId}.html`,
      close: `/bug-close-${bugId}.html`,
      activate: `/bug-activate-${bugId}.html`,
    };
    const route = routeMap[status];
    if (!route) {
      throw new Error(`Unsupported web bug status route: ${status}`);
    }

    const formMeta = await this.getWebFormMeta(route);
    const assignedTo =
      firstNonEmptyString(
        typeof payload.assignedTo === "string" ? payload.assignedTo : undefined,
        typeof bug.assignedTo === "string" && bug.assignedTo !== "closed" ? bug.assignedTo : undefined,
        this.userid,
        this.account,
        "admin",
      ) ?? "admin";
    const openedBuild =
      firstNonEmptyString(
        typeof payload.openedBuild === "string" ? payload.openedBuild : undefined,
        typeof bug.openedBuild === "string" ? bug.openedBuild : undefined,
        "trunk",
      ) ?? "trunk";
    const resolvedBuild =
      firstNonEmptyString(
        typeof payload.resolvedBuild === "string" ? payload.resolvedBuild : undefined,
        typeof bug.resolvedBuild === "string" ? bug.resolvedBuild : undefined,
        typeof bug.openedBuild === "string" ? bug.openedBuild : undefined,
        "trunk",
      ) ?? "trunk";
    const comment = typeof payload.comment === "string" ? payload.comment : "";

    const formBody: Record<string, string> = {
      comment,
      uid: formMeta.uid,
      product: stringifyOptional(bug.product) ?? "0",
      project: stringifyOptional(bug.project) ?? "0",
      story: stringifyOptional(bug.story) ?? "0",
      execution: stringifyOptional(bug.execution) ?? "0",
      module: stringifyOptional(bug.module) ?? "0",
      branch: stringifyOptional(bug.branch) ?? "0",
      plan: stringifyOptional(bug.plan) ?? "0",
      task: stringifyOptional(bug.task) ?? "0",
      testtask: stringifyOptional(bug.testtask) ?? "0",
      case: stringifyOptional(bug.case) ?? "0",
      duplicateBug:
        typeof payload.duplicateBug === "string"
          ? payload.duplicateBug
          : stringifyOptional(bug.duplicateBug) ?? "0",
    };

    if (status === "resolve") {
      const resolution = firstNonEmptyString(typeof payload.resolution === "string" ? payload.resolution : undefined);
      if (!resolution) {
        throw new Error("Bug status 'resolve' requires payload.resolution");
      }
      formBody.resolution = resolution;
      formBody.resolvedBuild = resolvedBuild;
      formBody.assignedTo = assignedTo;
    } else if (status === "activate") {
      formBody["openedBuild[]"] = openedBuild;
      formBody.status = "active";
      formBody.assignedTo = assignedTo;
      formBody.resolvedBuild = resolvedBuild;
    }

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const result = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(result) || result.result !== "success") {
      throw new Error(`ZenTao web bug status update failed for bug ${bugId}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(`/bug-view-${bugId}.json`);
    return {
      ok: true,
      route,
      status,
      bug_id: bugId,
      form: formBody,
      response: result,
      bug: latestView.bug,
    };
  }

  private async getWebFormMeta(route: string): Promise<{ uid: string }> {
    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.fetchWithSession(fullUrl, {
      headers: {
        "User-Agent": "OpenClaw-Zentao/1.0",
      },
    });
    const uidMatch = response.bodyText.match(/name="uid" value="([^"]+)"/);
    return {
      uid: uidMatch?.[1] ?? (this.userid ?? this.account ?? "admin"),
    };
  }

  private async createProductViaWeb(payload: JsonObject): Promise<JsonObject> {
    const route = `/product-create--from=global.html`;
    const formMeta = await this.getWebFormMeta(route);
    const beforeList = await this.getWebJsonViewData(`/product-all-0.json`);
    const users = isJsonObject(beforeList.users) ? beforeList.users : null;
    const programs = Array.isArray(beforeList.programList)
      ? beforeList.programList.filter(isJsonObject)
      : [];
    const name = firstNonEmptyString(typeof payload.name === "string" ? payload.name : undefined);
    if (!name) {
      throw new Error("Product create requires payload.name");
    }

    const program = stringifyOptional(payload.program) ?? "";
    if (program && !programs.some((item) => stringifyOptional(item.id) === program)) {
      throw new Error(`Unknown product program id '${program}'`);
    }

    const owners = {
      PO: ensureSelectableUser(users, this.userAliases, "PO", typeof payload.PO === "string" ? payload.PO : undefined),
      QD: ensureSelectableUser(users, this.userAliases, "QD", typeof payload.QD === "string" ? payload.QD : undefined),
      RD: ensureSelectableUser(users, this.userAliases, "RD", typeof payload.RD === "string" ? payload.RD : undefined),
      feedback: ensureSelectableUser(users, this.userAliases, "feedback", typeof payload.feedback === "string" ? payload.feedback : undefined),
      ticket: ensureSelectableUser(users, this.userAliases, "ticket", typeof payload.ticket === "string" ? payload.ticket : undefined),
    };
    const reviewers = normalizeUserSelections(payload.reviewer ?? payload.reviewers, users, this.userAliases, "reviewer");
    const whitelist = normalizeUserSelections(payload.whitelist, users, this.userAliases, "whitelist");
    const acl =
      firstNonEmptyString(typeof payload.acl === "string" ? payload.acl : undefined, "open") ?? "open";

    const formBody: Record<string, FormValue> = {
      program,
      line: stringifyOptional(payload.line) ?? "",
      lineName:
        firstNonEmptyString(typeof payload.lineName === "string" ? payload.lineName : undefined) ?? "",
      newLine:
        payload.newLine === true || payload.newLine === 1 || payload.newLine === "1" ? "1" : "0",
      name,
      type:
        firstNonEmptyString(typeof payload.type === "string" ? payload.type : undefined, "normal") ??
        "normal",
      workflowGroup: stringifyOptional(payload.workflowGroup) ?? "1",
      PO: owners.PO,
      QD: owners.QD,
      RD: owners.RD,
      feedback: owners.feedback,
      ticket: owners.ticket,
      desc: typeof payload.desc === "string" ? payload.desc : "",
      uid: formMeta.uid,
      acl,
      "reviewer[]": reviewers,
    };

    if (acl === "private") {
      formBody["whitelist[]"] = whitelist;
    }

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web product create failed: ${response.bodyText}`);
    }

    const afterList = await this.getWebJsonViewData(`/product-all-0.json`);
    const productId = findLatestProductIdByName(beforeList.products, afterList.products, name);
    const detail = productId ? await this.getWebJsonViewData(`/product-view-${productId}.json`) : null;

    return {
      ok: true,
      route,
      product_id: productId,
      ignored_fields: payload.code ? ["code"] : [],
      form: formBody,
      response: responseData,
      product: detail?.product ?? null,
      products: afterList.products ?? null,
    };
  }

  private async createProductModulesViaWeb(productId: number, payload: JsonObject): Promise<JsonObject> {
    const moduleNames = normalizeStringList(payload.modules ?? payload.moduleNames ?? payload.names);
    if (moduleNames.length === 0) {
      throw new Error("Product module create requires at least one module name");
    }
    const duplicateRequested = findDuplicateStrings(moduleNames);
    if (duplicateRequested.length > 0) {
      throw new Error(`Duplicate product module names in request: ${duplicateRequested.join(", ")}`);
    }

    const browseRoute = `/tree-browse-${productId}-${productId}-0-all.html`;
    const beforeHtml = await this.getWebPage(browseRoute);
    const beforeModules = new Set(extractTreeModuleNamesFromHtml(beforeHtml));
    const existingRequested = moduleNames.filter((name) => beforeModules.has(name));
    if (existingRequested.length > 0) {
      throw new Error(
        `Product ${productId} already has modules: ${Array.from(new Set(existingRequested)).join(", ")}`,
      );
    }
    const route = `/tree-manageChild-${productId}-${productId}.html`;
    const shortsInput = normalizeStringList(payload.shorts);
    const shorts = moduleNames.map((name, index) => shortsInput[index] ?? buildModuleShortName(name));

    const formBody: Record<string, FormValue> = {
      "modules[]": moduleNames,
      "shorts[]": shorts,
      parentModuleID: stringifyOptional(payload.parentModuleID) ?? "0",
      maxOrder: stringifyOptional(payload.maxOrder) ?? String(extractTreeMaxOrder(beforeHtml)),
    };

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: `${this.baseUrl}/tree-browse-product-${productId}.html`,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web product module create failed: ${response.bodyText}`);
    }

    let afterHtml = await this.getWebPage(browseRoute);
    let afterModules = extractTreeModuleNamesFromHtml(afterHtml);
    let createdModules = afterModules.filter((name) => !beforeModules.has(name) && moduleNames.includes(name));
    let fallbackTried = false;

    if (createdModules.length === 0) {
      fallbackTried = true;
      const indexedFormBody: Record<string, FormValue> = {
        parentModuleID: stringifyOptional(payload.parentModuleID) ?? "0",
        maxOrder: stringifyOptional(payload.maxOrder) ?? String(extractTreeMaxOrder(beforeHtml)),
      };
      moduleNames.forEach((name, index) => {
        indexedFormBody[`modules[${index}]`] = name;
        indexedFormBody[`shorts[${index}]`] = shorts[index] ?? buildModuleShortName(name);
      });

      const indexedResponse = await this.sendFormRequest(
        "POST",
        fullUrl,
        indexedFormBody,
        "urlencoded",
        {
          "User-Agent": "OpenClaw-Zentao/1.0",
          Referer: `${this.baseUrl}/tree-browse-product-${productId}.html`,
          Origin: this.baseUrl,
        },
      );
      const indexedResponseData = parseJson<JsonObject>(indexedResponse.bodyText, route);
      if (!isJsonObject(indexedResponseData) || indexedResponseData.result !== "success") {
        throw new Error(`ZenTao indexed product module create failed: ${indexedResponse.bodyText}`);
      }

      afterHtml = await this.getWebPage(browseRoute);
      afterModules = extractTreeModuleNamesFromHtml(afterHtml);
      createdModules = afterModules.filter((name) => !beforeModules.has(name) && moduleNames.includes(name));
    }

    return {
      ok: true,
      route,
      product_id: productId,
      requested_modules: moduleNames,
      created_modules: createdModules,
      fallback_tried: fallbackTried,
      form: formBody,
      response: responseData,
      modules: afterModules,
    };
  }

  private async createStoryViaWeb(payload: JsonObject): Promise<JsonObject> {
    const productId = numberOrUndefined(payload.product);
    if (!productId) {
      throw new Error("Story create requires numeric payload.product");
    }

    const route = `/story-create-${productId}-0-0-0-0-0-0-0.html`;
    const formMeta = await this.getWebFormMeta(route);
    const reviewer = firstNonEmptyString(typeof payload.reviewer === "string" ? payload.reviewer : undefined);
    if (!reviewer) {
      throw new Error("Story create requires payload.reviewer");
    }

    const formBody: Record<string, string> = {
      product: String(productId),
      module: stringifyOptional(payload.module) ?? "0",
      parent: stringifyOptional(payload.parent) ?? "0",
      grade: stringifyOptional(payload.grade) ?? "1",
      "reviewer[]": reviewer,
      assignedTo:
        firstNonEmptyString(
          typeof payload.assignedTo === "string" ? payload.assignedTo : undefined,
          this.userid,
          this.account,
          reviewer,
          "admin",
        ) ?? "admin",
      category: firstNonEmptyString(typeof payload.category === "string" ? payload.category : undefined, "SR") ?? "SR",
      title: firstNonEmptyString(typeof payload.title === "string" ? payload.title : undefined) ?? "",
      pri: stringifyOptional(payload.pri) ?? "3",
      estimate: stringifyOptional(payload.estimate) ?? "",
      spec: firstNonEmptyString(typeof payload.spec === "string" ? payload.spec : undefined) ?? "",
      uid: formMeta.uid,
      verify: firstNonEmptyString(typeof payload.verify === "string" ? payload.verify : undefined) ?? "",
      needNotReview: "0",
      fileList: "[]",
      type: "story",
      status: "active",
      project: stringifyOptional(payload.project) ?? "",
      plan: stringifyOptional(payload.plan) ?? "0",
      source: stringifyOptional(payload.source) ?? "",
      sourceNote: stringifyOptional(payload.sourceNote) ?? "",
      feedbackBy: stringifyOptional(payload.feedbackBy) ?? "",
      notifyEmail: stringifyOptional(payload.notifyEmail) ?? "0",
      mailto: stringifyOptional(payload.mailto) ?? "",
      keywords: stringifyOptional(payload.keywords) ?? "",
    };

    if (!formBody.title || !formBody.spec || !formBody.verify) {
      throw new Error("Story create requires title, spec, and verify");
    }

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const result = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(result) || result.result !== "success") {
      throw new Error(`ZenTao web story create failed: ${response.bodyText}`);
    }

    const listData = await this.getWebJsonViewData(`/story-browse-${productId}-all-0-id_desc-0-100-1.json`);
    const storyMap = isJsonObject(listData.stories) ? listData.stories : null;
    const matchedStory = storyMap
      ? Object.values(storyMap).find(
          (item) => isJsonObject(item) && item.title === formBody.title,
        )
      : null;

    return {
      ok: true,
      route,
      form: formBody,
      response: result,
      story: matchedStory,
    };
  }

  private async reviewStoryViaWeb(storyId: number, payload: JsonObject): Promise<JsonObject> {
    const storyView = await this.getWebJsonViewData(`/story-view-${storyId}.json`);
    const story = isJsonObject(storyView.story) ? storyView.story : storyView;
    if (!isJsonObject(story)) {
      throw new Error(`Story payload missing for story ${storyId}`);
    }

    const route = `/story-review-${storyId}.html`;
    const formMeta = await this.getWebFormMeta(route);
    const result = firstNonEmptyString(typeof payload.result === "string" ? payload.result : undefined);
    if (!result) {
      throw new Error("Story review requires payload.result");
    }

    const formBody: Record<string, string> = {
      result,
      assignedTo:
        firstNonEmptyString(
          typeof payload.assignedTo === "string" ? payload.assignedTo : undefined,
          typeof story.assignedTo === "string" ? story.assignedTo : undefined,
          this.userid,
          this.account,
          "admin",
        ) ?? "admin",
      pri: stringifyOptional(payload.pri) ?? stringifyOptional(story.pri) ?? "3",
      estimate: stringifyOptional(payload.estimate) ?? stringifyOptional(story.estimate) ?? "",
      status: stringifyOptional(story.status) ?? "reviewing",
      comment: stringifyOptional(payload.comment) ?? "",
      uid: formMeta.uid,
      module: stringifyOptional(story.module) ?? "0",
      plan: stringifyOptional(story.plan) ?? "0",
    };

    if (result === "reject") {
      formBody.closedReason =
        firstNonEmptyString(typeof payload.closedReason === "string" ? payload.closedReason : undefined) ?? "willnotdo";
    }

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web story review failed for story ${storyId}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(`/story-view-${storyId}.json`);
    return {
      ok: true,
      route,
      story_id: storyId,
      form: formBody,
      response: responseData,
      story: latestView.story,
    };
  }

  private async createReleaseViaWeb(payload: JsonObject): Promise<JsonObject> {
    const productId = numberOrUndefined(payload.product);
    if (!productId) {
      throw new Error("Release create requires numeric payload.product");
    }

    const route = `/release-create-${productId}.html`;
    const formMeta = await this.getWebFormMeta(route);
    const date = firstNonEmptyString(typeof payload.date === "string" ? payload.date : undefined);
    const name = firstNonEmptyString(typeof payload.name === "string" ? payload.name : undefined);
    if (!date || !name) {
      throw new Error("Release create requires payload.name and payload.date");
    }

    const formBody: Record<string, string> = {
      name,
      marker: stringifyOptional(payload.marker) ?? "0",
      sync: stringifyOptional(payload.sync) ?? "1",
      status: firstNonEmptyString(typeof payload.status === "string" ? payload.status : undefined, "normal") ?? "normal",
      date,
      releasedDate: firstNonEmptyString(typeof payload.releasedDate === "string" ? payload.releasedDate : undefined, date) ?? date,
      desc: stringifyOptional(payload.desc) ?? "",
      uid: formMeta.uid,
    };

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const result = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(result) || result.result !== "success") {
      throw new Error(`ZenTao web release create failed: ${response.bodyText}`);
    }

    let matchedRelease: JsonObject | null = null;

    const loadPath = typeof result.load === "string" ? result.load : "";
    const loadMatch = loadPath.match(/\/release-view-(\d+)\.html/);
    const createdReleaseId = loadMatch ? Number(loadMatch[1]) : NaN;
    if (Number.isFinite(createdReleaseId) && createdReleaseId > 0) {
      try {
        const detailData = await this.getWebJsonViewData(`/release-view-${createdReleaseId}.json`);
        matchedRelease = isJsonObject(detailData.release) ? detailData.release : null;
      } catch {
        matchedRelease = null;
      }
    }

    if (!matchedRelease) {
      const listData = await this.getWebJsonViewData(`/release-browse-${productId}-all.json`);
      const releaseMap = isJsonObject(listData.releases) ? listData.releases : null;
      matchedRelease = releaseMap
        ? (Object.values(releaseMap).find((item) => isJsonObject(item) && item.name === name) as JsonObject | undefined) ?? null
        : null;
    }

    return {
      ok: true,
      route,
      form: formBody,
      response: result,
      release: matchedRelease,
    };
  }

  private async updateStoryStatusViaWeb(storyId: number, payload: JsonObject): Promise<JsonObject> {
    const storyView = await this.getWebJsonViewData(`/story-view-${storyId}.json`);
    const story = isJsonObject(storyView.story) ? storyView.story : storyView;
    if (!isJsonObject(story)) {
      throw new Error(`Story payload missing for story ${storyId}`);
    }

    const status = firstNonEmptyString(typeof payload.status === "string" ? payload.status : undefined);
    const routeMap: Record<string, string> = {
      close: `/story-close-${storyId}.html`,
      activate: `/story-activate-${storyId}.html`,
    };
    const route = status ? routeMap[status] : undefined;
    if (!route) {
      throw new Error(`Unsupported story status route: ${String(status)}`);
    }

    const formMeta = await this.getWebFormMeta(route);
    const formBody: Record<string, string> = {
      comment: stringifyOptional(payload.comment) ?? "",
      uid: formMeta.uid,
      module: stringifyOptional(story.module) ?? "0",
      plan: stringifyOptional(story.plan) ?? "0",
    };

    if (status === "close") {
      const closedReason = firstNonEmptyString(typeof payload.closedReason === "string" ? payload.closedReason : undefined);
      if (!closedReason) {
        throw new Error("Story status 'close' requires payload.closedReason");
      }
      formBody.closedReason = closedReason;
    }

    if (status === "activate") {
      formBody.assignedTo =
        firstNonEmptyString(
          typeof payload.assignedTo === "string" ? payload.assignedTo : undefined,
          typeof story.assignedTo === "string" && story.assignedTo !== "closed" ? story.assignedTo : undefined,
          this.userid,
          this.account,
          "admin",
        ) ?? "admin";
    }

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web story status update failed for story ${storyId}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(`/story-view-${storyId}.json`);
    return {
      ok: true,
      route,
      status,
      story_id: storyId,
      form: formBody,
      response: responseData,
      story: latestView.story,
    };
  }

  private async updateReleaseStatusViaWeb(releaseId: number, payload: JsonObject): Promise<JsonObject> {
    const releaseView = await this.getWebJsonViewData(`/release-view-${releaseId}.json`);
    const release = isJsonObject(releaseView.release) ? releaseView.release : releaseView;
    if (!isJsonObject(release)) {
      throw new Error(`Release payload missing for release ${releaseId}`);
    }

    const route = `/release-edit-${releaseId}.html`;
    const formMeta = await this.getWebFormMeta(route);
    const system = numberOrUndefined(payload.system) ?? numberOrUndefined(release.system) ?? numberOrUndefined(release.shadow);
    if (!system) {
      throw new Error(`Release ${releaseId} is missing a usable system value`);
    }

    const formBody: Record<string, string> = {
      system: String(system),
      name: firstNonEmptyString(typeof release.name === "string" ? release.name : undefined) ?? `release-${releaseId}`,
      marker: stringifyOptional(release.marker) ?? "0",
      status: firstNonEmptyString(typeof payload.status === "string" ? payload.status : undefined, typeof release.status === "string" ? release.status : undefined, "normal") ?? "normal",
      date: firstNonEmptyString(typeof release.date === "string" ? release.date : undefined) ?? currentDateString(),
      releasedDate: firstNonEmptyString(typeof release.releasedDate === "string" ? release.releasedDate : undefined, typeof release.date === "string" ? release.date : undefined, currentDateString()) ?? currentDateString(),
      desc: typeof payload.desc === "string" ? payload.desc : stringifyOptional(release.desc) ?? "",
      uid: formMeta.uid,
      product: stringifyOptional(release.product) ?? "0",
    };

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web release status update failed for release ${releaseId}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(`/release-view-${releaseId}.json`);
    return {
      ok: true,
      route,
      release_id: releaseId,
      form: formBody,
      response: responseData,
      release: latestView.release,
    };
  }

  private async linkReleaseStoriesViaWeb(releaseId: number, payload: JsonObject): Promise<JsonObject> {
    const storyIds = normalizeIdListInput(payload.storyIds ?? payload.stories);
    if (storyIds.length === 0) {
      throw new Error("Release story linkage requires at least one story id");
    }

    const route = `/release-linkStory-${releaseId}.html`;
    const formBody: Record<string, string> = {};
    storyIds.forEach((storyId, index) => {
      formBody[`stories[${index}]`] = String(storyId);
    });

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web release story linkage failed for release ${releaseId}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(`/release-view-${releaseId}.json`);
    return {
      ok: true,
      route,
      release_id: releaseId,
      story_ids: storyIds,
      form: formBody,
      response: responseData,
      stories: latestView.stories ?? [],
      release: latestView.release,
    };
  }

  private async linkReleaseBugsViaWeb(releaseId: number, payload: JsonObject): Promise<JsonObject> {
    const bugIds = normalizeIdListInput(payload.bugIds ?? payload.bugs);
    if (bugIds.length === 0) {
      throw new Error("Release bug linkage requires at least one bug id");
    }

    const route = `/release-linkBug-${releaseId}.html`;
    const formBody: Record<string, string> = {};
    bugIds.forEach((bugId, index) => {
      formBody[`bugs[${index}]`] = String(bugId);
    });

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web release bug linkage failed for release ${releaseId}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(`/release-view-${releaseId}.json`);
    return {
      ok: true,
      route,
      release_id: releaseId,
      bug_ids: bugIds,
      form: formBody,
      response: responseData,
      bugs: latestView.bugs ?? [],
      release: latestView.release,
    };
  }

  private async linkExecutionStoriesViaWeb(executionId: number, payload: JsonObject): Promise<JsonObject> {
    const storyIds = normalizeIdListInput(payload.storyIds ?? payload.stories);
    if (storyIds.length === 0) {
      throw new Error("Execution story linkage requires at least one story id");
    }

    const route = `/execution-linkStory-${executionId}.html`;
    const formBody: Record<string, string> = {};
    storyIds.forEach((storyId, index) => {
      formBody[`stories[${index}]`] = String(storyId);
    });

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web execution story linkage failed for execution ${executionId}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(`/execution-story-${executionId}.json`);
    return {
      ok: true,
      route,
      execution_id: executionId,
      story_ids: storyIds,
      form: formBody,
      response: responseData,
      stories: latestView.stories ?? [],
      summary: latestView.summary ?? null,
      title: latestView.title ?? null,
    };
  }

  private async createTaskViaWeb(payload: JsonObject): Promise<JsonObject> {
    const executionId = numberOrUndefined(payload.execution);
    if (!executionId) {
      throw new Error("Task create requires numeric payload.execution");
    }

    const storyId = numberOrUndefined(payload.story) ?? 0;
    const moduleId = numberOrUndefined(payload.module) ?? 0;
    const parentTaskId = numberOrUndefined(payload.parentTask) ?? numberOrUndefined(payload.parent) ?? 0;
    const todoId = numberOrUndefined(payload.todo) ?? 0;
    const bugId = numberOrUndefined(payload.bug) ?? 0;
    const route = `/task-create-${executionId}-${storyId}-${moduleId}-${parentTaskId}-${todoId}-${bugId}.html`;
    const formMeta = await this.getWebFormMeta(route);

    const name = firstNonEmptyString(typeof payload.name === "string" ? payload.name : undefined);
    const type = firstNonEmptyString(typeof payload.type === "string" ? payload.type : undefined, "devel") ?? "devel";
    if (!name) {
      throw new Error("Task create requires payload.name");
    }

    const formBody: Record<string, string> = {
      execution: String(executionId),
      type,
      module: String(moduleId),
      story: String(storyId),
      assignedTo: firstNonEmptyString(typeof payload.assignedTo === "string" ? payload.assignedTo : undefined, this.userid, this.account, "admin") ?? "admin",
      name,
      pri: stringifyOptional(payload.pri) ?? "3",
      estimate: stringifyOptional(payload.estimate) ?? "0",
      desc: typeof payload.desc === "string" ? payload.desc : "",
      keywords: typeof payload.keywords === "string" ? payload.keywords : "",
      status: firstNonEmptyString(typeof payload.status === "string" ? payload.status : undefined, "wait") ?? "wait",
      uid: formMeta.uid,
      after: firstNonEmptyString(typeof payload.after === "string" ? payload.after : undefined, "toTaskList") ?? "toTaskList",
      fileList: "[]",
    };

    if (payload.parent !== undefined || payload.parentTask !== undefined) formBody.parent = String(parentTaskId);
    if (typeof payload.color === "string") formBody.color = payload.color;
    if (typeof payload.estStarted === "string") formBody.estStarted = payload.estStarted;
    if (typeof payload.deadline === "string") formBody.deadline = payload.deadline;
    if (typeof payload.mode === "string") formBody.mode = payload.mode;

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web task create failed: ${response.bodyText}`);
    }

    const load = typeof responseData.load === "string" ? responseData.load : "";
    const taskIdMatch = load.match(/task-view-(\d+)\.html/);
    let taskId = taskIdMatch ? Number(taskIdMatch[1]) : undefined;

    if (!taskId) {
      const taskListView = await this.getWebJsonViewData(`/execution-task-${executionId}.json`);
      const taskItems = Array.isArray(taskListView.tasks)
        ? taskListView.tasks.filter(isJsonObject)
        : isJsonObject(taskListView.tasks)
          ? Object.values(taskListView.tasks).filter(isJsonObject)
          : [];
      const matchedTask = taskItems.find((item) => item.name === name);
      taskId = matchedTask ? numberOrUndefined(matchedTask.id) : undefined;
    }

    const detail = taskId ? await this.getWebJsonViewData(`/task-view-${taskId}.json`) : null;

    return {
      ok: true,
      route,
      task_id: taskId,
      form: formBody,
      response: responseData,
      task: detail?.task ?? null,
    };
  }

  private async createTestcaseViaWeb(payload: JsonObject): Promise<JsonObject> {
    const productId = numberOrUndefined(payload.product);
    if (!productId) {
      throw new Error("Testcase create requires numeric payload.product");
    }

    const branch = stringifyOptional(payload.branch) ?? "0";
    const moduleId = numberOrUndefined(payload.module) ?? 0;
    const from = firstNonEmptyString(typeof payload.from === "string" ? payload.from : undefined) ?? "";
    const param = numberOrUndefined(payload.param) ?? 0;
    const storyId = numberOrUndefined(payload.story) ?? 0;
    const route = `/testcase-create-${productId}-${branch}-${moduleId}-${from}-${param}-${storyId}.html`;

    const title = firstNonEmptyString(typeof payload.title === "string" ? payload.title : undefined);
    const type = firstNonEmptyString(typeof payload.type === "string" ? payload.type : undefined, "feature") ?? "feature";
    const steps = normalizeStringListInput(payload.steps);
    const expects = normalizeStringListInput(payload.expects);
    if (!title) throw new Error("Testcase create requires payload.title");
    if (steps.length === 0) throw new Error("Testcase create requires at least one step");

    const normalizedExpects = steps.map((_, index) => expects[index] ?? "");
    const formBody: Record<string, string> = {
      product: String(productId),
      branch,
      module: String(moduleId),
      type,
      story: String(storyId),
      scene: stringifyOptional(payload.scene) ?? "0",
      title,
      pri: stringifyOptional(payload.pri) ?? "3",
      precondition: typeof payload.precondition === "string" ? payload.precondition : "",
      keywords: typeof payload.keywords === "string" ? payload.keywords : "",
      status: firstNonEmptyString(typeof payload.status === "string" ? payload.status : undefined, "normal") ?? "normal",
    };

    const stageList = normalizeStringListInput(payload.stage);
    if (stageList.length > 0) {
      stageList.forEach((stage, index) => {
        formBody[`stage[${index}]`] = stage;
      });
    }

    steps.forEach((step, index) => {
      formBody[`steps[${index}]`] = step;
      formBody[`expects[${index}]`] = normalizedExpects[index] ?? "";
      formBody[`stepType[${index}]`] = "item";
    });

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web testcase create failed: ${response.bodyText}`);
    }

    const load = typeof responseData.load === "string" ? responseData.load : "";
    const caseIdMatch = load.match(/testcase-view-(\d+)\.html/);
    let caseId = caseIdMatch ? Number(caseIdMatch[1]) : undefined;

    if (!caseId) {
      const listView = await this.getWebJsonViewData(`/testcase-browse-${productId}-all.json`);
      const caseItems = Array.isArray(listView.cases)
        ? listView.cases.filter(isJsonObject)
        : isJsonObject(listView.cases)
          ? Object.values(listView.cases).filter(isJsonObject)
          : [];
      const matchedCase = caseItems.find((item) => item.title === title);
      caseId = matchedCase ? caseIdFromValue(matchedCase.id) : undefined;
    }

    const detail = caseId ? await this.getWebJsonViewData(`/testcase-view-${caseId}.json`) : null;
    return {
      ok: true,
      route,
      case_id: caseId,
      form: formBody,
      response: responseData,
      testcase: detail?.case ?? null,
    };
  }

  private async createTesttaskViaWeb(payload: JsonObject): Promise<JsonObject> {
    const productId = numberOrUndefined(payload.product);
    if (!productId) {
      throw new Error("Testtask create requires numeric payload.product");
    }

    const buildIds = normalizeIdListInput(payload.builds ?? payload.build);
    if (buildIds.length === 0) {
      throw new Error("Testtask create requires at least one build id");
    }

    const executionId = numberOrUndefined(payload.execution) ?? 0;
    const route = `/testtask-create-${productId}-${executionId}-${buildIds[0]}-0.html`;
    const formMeta = await this.getWebFormMeta(route);

    const name = firstNonEmptyString(typeof payload.name === "string" ? payload.name : undefined);
    const begin = firstNonEmptyString(typeof payload.begin === "string" ? payload.begin : undefined);
    const end = firstNonEmptyString(typeof payload.end === "string" ? payload.end : undefined);
    if (!name || !begin || !end) {
      throw new Error("Testtask create requires payload.name, payload.begin and payload.end");
    }

    const typeList = normalizeStringListInput(payload.types ?? payload.type);
    const memberList = normalizeStringListInput(payload.members);
    const mailtoList = normalizeStringListInput(payload.mailto);
    const formBody: Record<string, string> = {
      product: String(productId),
      execution: String(executionId),
      build: buildIds.join(","),
      owner:
        firstNonEmptyString(
          typeof payload.owner === "string" ? payload.owner : undefined,
          this.userid,
          this.account,
          "admin",
        ) ?? "admin",
      begin,
      end,
      status: firstNonEmptyString(typeof payload.status === "string" ? payload.status : undefined, "wait") ?? "wait",
      testreport: stringifyOptional(payload.testreport) ?? "0",
      name,
      pri: stringifyOptional(payload.pri) ?? "3",
      desc: typeof payload.desc === "string" ? payload.desc : "",
      uid: formMeta.uid,
    };

    const normalizedTypes = typeList.length > 0 ? typeList : ["feature"];
    normalizedTypes.forEach((type, index) => {
      formBody[`type[${index}]`] = type;
    });
    memberList.forEach((member, index) => {
      formBody[`members[${index}]`] = member;
    });
    mailtoList.forEach((member, index) => {
      formBody[`mailto[${index}]`] = member;
    });

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web testtask create failed: ${response.bodyText}`);
    }

    let testtaskId = numberOrUndefined(responseData.id);
    if (!testtaskId) {
      const load = typeof responseData.load === "string" ? responseData.load : "";
      const match = load.match(/testtask-view-(\d+)\.html/);
      testtaskId = match ? Number(match[1]) : undefined;
    }

    if (!testtaskId) {
      const listView = await this.getWebJsonViewData(`/testtask-browse-${productId}-0-all-id_desc-0-100-1.json`);
      const taskItems = Array.isArray(listView.tasks)
        ? listView.tasks.filter(isJsonObject)
        : isJsonObject(listView.tasks)
          ? Object.values(listView.tasks).filter(isJsonObject)
          : [];
      const matchedTask = taskItems.find((item) => item.name === name);
      testtaskId = matchedTask ? numberOrUndefined(matchedTask.id) : undefined;
    }

    const detail = testtaskId ? await this.getWebJsonViewData(`/testtask-view-${testtaskId}.json`) : null;
    return {
      ok: true,
      route,
      testtask_id: testtaskId,
      form: formBody,
      response: responseData,
      testtask: detail?.task ?? null,
    };
  }

  private async linkTesttaskCasesViaWeb(testtaskId: number, payload: JsonObject): Promise<JsonObject> {
    const caseIds = normalizeIdListInput(payload.caseIds ?? payload.cases);
    if (caseIds.length === 0) {
      throw new Error("Testtask case linkage requires at least one case id");
    }

    const route = `/testtask-linkCase-${testtaskId}-all-0-0-100-1.html`;
    const formBody: Record<string, string> = {};
    caseIds.forEach((caseId, index) => {
      formBody[`case[${index}]`] = String(caseId);
      formBody[`version[${index}]`] = "1";
    });

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web testtask case linkage failed for testtask ${testtaskId}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(`/testtask-cases-${testtaskId}-all-0-id_desc-0-100-1.json`);
    return {
      ok: true,
      route,
      testtask_id: testtaskId,
      case_ids: caseIds,
      form: formBody,
      response: responseData,
      runs: latestView.runs ?? [],
      task: latestView.task ?? null,
    };
  }

  private async runTesttaskCaseViaWeb(runId: number, payload: JsonObject): Promise<JsonObject> {
    const runView = await this.getWebJsonViewData(`/testtask-runCase-${runId}.json`);
    const run = isJsonObject(runView.run) ? runView.run : null;
    const caseData = run && isJsonObject(run.case) ? run.case : null;
    if (!run || !caseData) {
      throw new Error(`Run payload missing for testtask run ${runId}`);
    }

    const caseId = numberOrUndefined(caseData.id);
    const version = numberOrUndefined(runView.version) ?? numberOrUndefined(caseData.currentVersion) ?? numberOrUndefined(caseData.version);
    if (!caseId || !version) {
      throw new Error(`Run ${runId} is missing case id or version`);
    }

    const result = firstNonEmptyString(typeof payload.result === "string" ? payload.result : undefined, "pass") ?? "pass";
    const real = typeof payload.real === "string" ? payload.real : "";
    const steps = Array.isArray(caseData.steps) ? caseData.steps.filter(isJsonObject) : [];
    const executableSteps = steps.filter((step) => typeof step.type === "string" && step.type !== "group");

    const route = `/testtask-runCase-${runId}-${caseId}-${version}.html`;
    const formBody: Record<string, string> = {
      case: String(caseId),
      version: String(version),
    };

    if (executableSteps.length === 0) {
      formBody["result[0]"] = result;
      formBody["real[0]"] = real;
    } else {
      executableSteps.forEach((step) => {
        const stepId = numberOrUndefined(step.id) ?? 0;
        formBody[`result[${stepId}]`] = result;
        formBody[`real[${stepId}]`] = real;
      });
    }

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web run case failed for run ${runId}: ${response.bodyText}`);
    }

    const resultsView = await this.getWebJsonViewData(`/testtask-results-${runId}-${caseId}-${version}-all-all-0.json`);
    return {
      ok: true,
      route,
      run_id: runId,
      case_id: caseId,
      version,
      form: formBody,
      response: responseData,
      results: resultsView.results ?? [],
      case: resultsView.case ?? caseData,
      testtask: resultsView.testtask ?? null,
    };
  }

  private async updateTesttaskStatusViaWeb(testtaskId: number, payload: JsonObject): Promise<JsonObject> {
    const taskView = await this.getWebJsonViewData(`/testtask-view-${testtaskId}.json`);
    const testtask = isJsonObject(taskView.task) ? taskView.task : null;
    if (!testtask) {
      throw new Error(`Testtask payload missing for testtask ${testtaskId}`);
    }

    const status = firstNonEmptyString(typeof payload.status === "string" ? payload.status : undefined);
    const routeMap: Record<string, string> = {
      doing: `/testtask-start-${testtaskId}.html`,
      blocked: `/testtask-block-${testtaskId}.html`,
      activate: `/testtask-activate-${testtaskId}.html`,
      done: `/testtask-close-${testtaskId}.html`,
      closed: `/testtask-close-${testtaskId}.html`,
    };
    const route = status ? routeMap[status] : undefined;
    if (!route) {
      throw new Error(`Unsupported testtask status route: ${String(status)}`);
    }

    const formMeta = await this.getWebFormMeta(route);
    const formBody: Record<string, string> = {
      uid: formMeta.uid,
      comment: typeof payload.comment === "string" ? payload.comment : "",
    };

    if (status === "doing") {
      formBody.status = "doing";
      formBody.realBegan = firstNonEmptyString(typeof payload.realBegan === "string" ? payload.realBegan : undefined, currentDateString()) ?? currentDateString();
    } else if (status === "blocked") {
      formBody.status = "blocked";
    } else if (status === "activate") {
      formBody.status = "doing";
    } else if (status === "done" || status === "closed") {
      formBody.status = "done";
      formBody.realFinishedDate = firstNonEmptyString(
        typeof payload.realFinishedDate === "string" ? payload.realFinishedDate : undefined,
        `${currentDateString()} 00:00:00`,
      ) ?? `${currentDateString()} 00:00:00`;
      const mailtoList = normalizeStringListInput(payload.mailto);
      mailtoList.forEach((account, index) => {
        formBody[`mailto[${index}]`] = account;
      });
    }

    const fullUrl = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, route);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web testtask status update failed for testtask ${testtaskId}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(`/testtask-view-${testtaskId}.json`);
    return {
      ok: true,
      route,
      status,
      testtask_id: testtaskId,
      form: formBody,
      response: responseData,
      testtask: latestView.task ?? null,
    };
  }

  private async addTeamMemberViaWeb(payload: JsonObject): Promise<JsonObject> {
    const scope = firstNonEmptyString(typeof payload.scope === "string" ? payload.scope : undefined);
    const root = numberOrUndefined(payload.root);
    const account = firstNonEmptyString(typeof payload.account === "string" ? payload.account : undefined);
    if (!scope || (scope !== "project" && scope !== "execution")) {
      throw new Error("Team member update requires scope=project|execution");
    }
    if (!root || !account) {
      throw new Error("Team member update requires root and account");
    }

    const viewRoute = scope === "project" ? `/project-view-${root}.json` : `/execution-view-${root}.json`;
    const manageRoute = scope === "project" ? `/project-manageMembers-${root}.html` : `/execution-manageMembers-${root}.html`;
    const viewData = await this.getWebJsonViewData(viewRoute);
    const teamMap = isJsonObject(viewData.teamMembers) ? viewData.teamMembers : {};
    const existingMembers = Object.values(teamMap).filter(isJsonObject);
    const existingByAccount = new Map<string, JsonObject>();
    for (const member of existingMembers) {
      const memberAccount = firstNonEmptyString(typeof member.account === "string" ? member.account : undefined);
      if (memberAccount) existingByAccount.set(memberAccount, member);
    }

    const targetMember = existingByAccount.get(account);
    const defaultDays = numberOrUndefined(payload.days) ?? numberOrUndefined(targetMember?.days) ?? (scope === "project" ? 15 : 10);
    const defaultHours = numberOrUndefined(payload.hours) ?? numberOrUndefined(targetMember?.hours) ?? 7;
    const defaultRole = firstNonEmptyString(typeof payload.role === "string" ? payload.role : undefined, typeof targetMember?.role === "string" ? targetMember.role : undefined) ?? "";
    const defaultLimited = firstNonEmptyString(typeof payload.limited === "string" ? payload.limited : undefined, typeof targetMember?.limited === "string" ? targetMember.limited : undefined, "no") ?? "no";

    const mergedMembers = existingMembers.filter((member) => {
      const memberAccount = firstNonEmptyString(typeof member.account === "string" ? member.account : undefined);
      return memberAccount !== account;
    });
    mergedMembers.push({
      account,
      role: defaultRole,
      days: defaultDays,
      hours: defaultHours,
      limited: defaultLimited,
    });

    const formBody: Record<string, string> = {};
    mergedMembers.forEach((member, index) => {
      formBody[`account[${index}]`] = firstNonEmptyString(typeof member.account === "string" ? member.account : undefined) ?? "";
      formBody[`role[${index}]`] = firstNonEmptyString(typeof member.role === "string" ? member.role : undefined) ?? "";
      formBody[`days[${index}]`] = String(numberOrUndefined(member.days) ?? defaultDays);
      formBody[`hours[${index}]`] = String(numberOrUndefined(member.hours) ?? defaultHours);
      formBody[`limited[${index}]`] = firstNonEmptyString(typeof member.limited === "string" ? member.limited : undefined, "no") ?? "no";
    });
    if (scope === "project") {
      formBody.removeExecution = "no";
    }

    const fullUrl = `${this.baseUrl}/${manageRoute.replace(/^\/+/, "")}`;
    const response = await this.sendFormRequest(
      "POST",
      fullUrl,
      formBody,
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: fullUrl,
        Origin: this.baseUrl,
      },
    );

    const responseData = parseJson<JsonObject>(response.bodyText, manageRoute);
    if (!isJsonObject(responseData) || responseData.result !== "success") {
      throw new Error(`ZenTao web team update failed for ${scope} ${root}: ${response.bodyText}`);
    }

    const latestView = await this.getWebJsonViewData(viewRoute);
    return {
      ok: true,
      scope,
      root,
      account,
      form: formBody,
      response: responseData,
      teamMembers: latestView.teamMembers,
    };
  }

  private async syncWecomUserViaWebUpsert(
    input: WecomOrgUser,
    account: string,
    userid: string | null,
  ): Promise<SyncUserResult> {
    const password = firstNonEmptyString(
      typeof input.password === "string" ? input.password : undefined,
      this.syncDefaultPassword,
    );
    if (!password) {
      throw new Error(
        "Sync needs a password when creating a new Zentao user. Set user_sync.default_password in config.json, ZENTAO_SYNC_DEFAULT_PASSWORD, or provide password in the sync payload.",
      );
    }

    const createdPayload = buildCreateUserPayload(input, {
      account,
      password,
      defaultRole: this.syncDefaultRole,
      defaultGroup: this.syncDefaultGroup,
      defaultDept: this.syncDefaultDept,
      defaultVisions: this.syncDefaultVisions,
    });

    try {
      await this.createUserViaWebForm(input, createdPayload, password);
      return {
        ok: true,
        action: "created",
        matched_by: "web_form",
        account,
        userid,
        created_payload: createdPayload,
        user: {
          account,
          realname: createdPayload.realname as string | undefined,
          dept: createdPayload.dept as number | undefined,
          role: createdPayload.role as string | undefined,
          email: input.email as string | undefined,
          mobile: input.mobile as string | undefined,
          phone: firstNonEmptyString(
            typeof input.phone === "string" ? input.phone : undefined,
            typeof input.telephone === "string" ? input.telephone : undefined,
          ),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isWebUserAlreadyExistsError(message)) {
        return {
          ok: true,
          action: "noop",
          matched_by: "account",
          account,
          userid,
          user: {
            account,
            realname:
              (createdPayload.realname as string | undefined) ??
              firstNonEmptyString(
                typeof input.realname === "string" ? input.realname : undefined,
                typeof input.name === "string" ? input.name : undefined,
              ),
          },
        };
      }
      throw error;
    }
  }


  private async ensureActorCredentialsResolved(forceRefresh = false): Promise<void> {
    if (!this.userid || this.explicitCredentialMode) {
      return;
    }

    const credential = resolveActorCredential(this.userid, this.userAliases, forceRefresh);
    this.account = credential.account;
    this.password = undefined;
    this.passwordHash = credential.passwordHash;
    this.setSessionCacheIdentity(credential.account);
  }

  private setSessionCacheIdentity(identity: string): void {
    const nextPath = buildSessionCachePath(identity);
    if (nextPath === this.sessionCachePath) {
      return;
    }

    this.token = null;
    this.matchedUser = null;
    this.cookies.clear();
    this.sessionCachePath = nextPath;
    this.loadCachedSession();
  }

  clearCachedSession(): void {
    this.token = null;
    this.matchedUser = null;
    this.cookies.clear();
    if (existsSync(this.sessionCachePath)) {
      unlinkSync(this.sessionCachePath);
    }
  }

  private requireCredentials(): void {
    if (!this.account || (!this.password && !this.passwordHash)) {
      throw new Error(
        `Missing Zentao credentials. Fill ZENTAO_ACCOUNT with ZENTAO_PASSWORD/ZENTAO_PASSWORD_HASH, write service credentials to ${CONFIG_PATH}, or provide userid so actor auth can be resolved automatically.`,
      );
    }
  }

  private loadCachedSession(): void {
    if (!existsSync(this.sessionCachePath)) {
      return;
    }

    try {
      const cached = parseJson<SessionCache>(
        readFileSync(this.sessionCachePath, "utf8"),
        this.sessionCachePath,
      );
      this.token = cached.token ?? null;
      this.cookies.clear();
      for (const cookie of cached.cookies ?? []) {
        this.cookies.set(cookie.name, cookie.value);
      }
    } catch {
      this.cookies.clear();
      this.token = null;
    }
  }

  private saveCachedSession(): void {
    mkdirSync(dirname(this.sessionCachePath), { recursive: true });
    const cacheData: SessionCache = {
      token: this.token,
      cookies: Array.from(this.cookies.entries()).map(([name, value]) => ({ name, value })),
    };
    writeFileSync(this.sessionCachePath, JSON.stringify(cacheData, null, 2), "utf8");
  }

  private async listAllUsers(pageSize = this.userListLimit, limit = Number.POSITIVE_INFINITY): Promise<ZentaoUser[]> {
    try {
      const users: ZentaoUser[] = [];
      let page = 1;
      let total = Number.POSITIVE_INFINITY;

      while (users.length < total && users.length < limit) {
        const data = await this.request("GET", "/api.php/v1/users", {
          params: {
            page: String(page),
            limit: String(pageSize),
            ...(this.userBrowse ? { browse: this.userBrowse } : {}),
          },
          retryOnAuth: false,
        });

        const pageUsers = extractUsers(data);
        users.push(...pageUsers);

        const responseTotal = numberOrUndefined(data.total);
        total = responseTotal ?? pageUsers.length;
        if (pageUsers.length === 0 || pageUsers.length < pageSize) {
          break;
        }
        page += 1;
      }

      return users.slice(0, limit);
    } catch (error) {
      return this.listAllUsersViaWebAjax(limit);
    }
  }

  private async listAllUsersViaWebAjax(limit: number): Promise<ZentaoUser[]> {
    const route = this.webUserListRoute.replace(/^\/+/, "");
    const url = `${this.baseUrl}/${route}`;
    const response = await this.fetchWithSession(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "OpenClaw-Zentao/1.0",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${this.baseUrl}/user-browse.html`,
      },
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw createHttpError(response, url);
    }
    if (!response.bodyText.trim()) {
      throw new Error(`ZenTao web user list returned empty body from ${url}`);
    }
    const parsedResponse = parseJson<JsonObject>(response.bodyText, url);
    const parsedData = parseEnvelopeData(parsedResponse.data, url);
    const searchTarget =
      parsedData === undefined
        ? parsedResponse
        : ({
            ...parsedResponse,
            data: parsedData,
          } as JsonObject);
    const users = extractUsers(searchTarget);
    return users.slice(0, limit);
  }

  private async createUserViaWebForm(
    input: WecomOrgUser,
    payload: JsonObject,
    rawPassword: string,
  ): Promise<void> {
    const url = `${this.baseUrl}/user-create.html`;
    const page = await this.fetchWithSession(url, {
      headers: {
        "User-Agent": "OpenClaw-Zentao/1.0",
      },
    });
    const verifyRand = extractVerifyRandFromHtml(page.bodyText, url);
    const realname =
      (payload.realname as string | undefined) ??
      firstNonEmptyString(
        typeof input.realname === "string" ? input.realname : undefined,
        typeof input.name === "string" ? input.name : undefined,
      ) ??
      accountFromPayload(payload);

    const response = await this.sendFormRequest(
      "POST",
      url,
      {
        account: accountFromPayload(payload),
        password1: `${md5Hex(rawPassword)}${verifyRand}`,
        password2: `${md5Hex(rawPassword)}${verifyRand}`,
        "visions[]": firstVisionFromPayload(payload, this.syncDefaultVisions),
        realname,
        gender: normalizeGender(input.gender) ?? "m",
        verifyPassword: buildVerifyPasswordValue(this.password, this.passwordHash, verifyRand),
        passwordLength: String(rawPassword.length),
        passwordStrength: String(computePasswordStrength(rawPassword)),
        dept: stringifyOptional(payload.dept) ?? stringifyOptional(this.syncDefaultDept) ?? "1",
        type: "inside",
        join: currentDateString(),
        role: stringifyOptional(payload.role) ?? "",
        email: stringifyOptional(input.email) ?? "",
        mobile: stringifyOptional(input.mobile) ?? "",
        phone:
          firstNonEmptyString(
            typeof input.phone === "string" ? input.phone : undefined,
            typeof input.telephone === "string" ? input.telephone : undefined,
          ) ?? "",
      },
      "urlencoded",
      {
        "User-Agent": "OpenClaw-Zentao/1.0",
        Referer: url,
        Origin: this.baseUrl,
      },
    );

    const bodyText = response.bodyText.trim();
    if (bodyText.includes("保存成功")) {
      return;
    }

    const alertMessage = extractAlertMessage(bodyText);
    if (alertMessage) {
      throw new Error(`ZenTao web create user failed: ${alertMessage}`);
    }

    throw new Error(`ZenTao web create user failed: unexpected response from ${url}`);
  }

  private async resolveCurrentUser(): Promise<ZentaoUser | null> {
    if (this.matchedUser) {
      return this.matchedUser;
    }

    if (this.userid) {
      try {
        this.matchedUser = await this.findUserByUserid(this.userid);
        return this.matchedUser;
      } catch {
        try {
          this.matchedUser = await this.findUserByAccount(this.userid);
          return this.matchedUser;
        } catch {
          this.matchedUser = this.buildInferredCurrentUser();
          return this.matchedUser;
        }
      }
    }

    try {
      const data = await this.request("GET", "/api.php/v1/user", {
        retryOnAuth: false,
      });
      return extractSingleUser(data);
    } catch {
      this.matchedUser = this.buildInferredCurrentUser();
      return this.matchedUser;
    }
  }

  private buildInferredCurrentUser(): ZentaoUser | null {
    const inferredAccount = firstNonEmptyString(this.userid, this.account);
    if (!inferredAccount) {
      return null;
    }

    return {
      account: inferredAccount,
      realname: inferredAccount,
      inferred: true,
      matchedBy: "identifier-fallback",
    };
  }

  private async findExistingUserForSync(
    input: WecomOrgUser,
    account: string,
    userid: string | null,
  ): Promise<{
    user: ZentaoUser | null;
    matchedBy?: string;
  }> {
    if (userid) {
      try {
        return {
          user: await this.findUserByUserid(userid),
          matchedBy: "userid",
        };
      } catch {
        // Fall back to account matching below when the custom userid mapping is not yet populated.
      }
    }

    try {
      return {
        user: await this.findUserByAccount(account),
        matchedBy: "account",
      };
    } catch {
      // Continue to email matching below.
    }

    const normalizedEmail = normalizeComparableText(input.email);
    if (normalizedEmail) {
      const users = await this.listAllUsers();
      const matchedUser = users.find(
        (user) => normalizeComparableText(user.email) === normalizedEmail,
      );
      if (matchedUser) {
        return {
          user: matchedUser,
          matchedBy: "email",
        };
      }
    }

    return {
      user: null,
    };
  }

  private async listTasksAssignedTo(
    identifiers: string[],
    status: string,
    limit: number,
    pageSize: number,
  ): Promise<ZentaoTask[]> {
    if (identifiers.length === 0) {
      return [];
    }

    const normalizedIdentifiers = new Set(identifiers.map(normalizeComparableText).filter(Boolean));
    const tasks: ZentaoTask[] = [];
    let page = 1;

    while (tasks.length < limit) {
      const pageTasks = await this.getTasks(status, page, pageSize);
      if (pageTasks.length === 0) {
        break;
      }

      for (const task of pageTasks) {
        const assignedTo = normalizeComparableText(task.assignedTo);
        if (assignedTo && normalizedIdentifiers.has(assignedTo)) {
          tasks.push(task);
          if (tasks.length >= limit) {
            break;
          }
        }
      }

      if (pageTasks.length < pageSize) {
        break;
      }
      page += 1;
    }

    return tasks;
  }

  private async loginWithJsonView(protectedJsonRoute: string): Promise<JsonObject> {
    const loginViewUrl = await this.resolveJsonLoginUrl(protectedJsonRoute);
    const loginInfo = await this.getJsonLoginInfo(loginViewUrl);
    const passwordVariants = buildPasswordVariants(this.password, this.passwordHash, loginInfo.rand);
    let lastPayload: JsonPageEnvelope | null = null;

    for (const variant of passwordVariants) {
      const response = await this.sendFormRequest("POST", loginViewUrl, {
        account: this.account as string,
        password: variant.value,
        passwordStrength: String(computeLoginPasswordStrength(this.password, this.passwordHash)),
        referer: loginInfo.referer,
        verifyRand: loginInfo.rand,
        keepLogin: "0",
        captcha: "",
      });
      const payload = parseJsonEnvelope(response.bodyText, loginViewUrl);
      lastPayload = payload;

      const verification = await this.sendJsonRequest(
        "GET",
        `${this.baseUrl}/${protectedJsonRoute.replace(/^\/+/, "")}`,
      );
      const verificationData = parseEnvelopeData(verification.data, protectedJsonRoute);
      if (!looksLikeLoginPayload(verificationData)) {
        return {
          login_view_url: loginViewUrl,
          protected_json_route: protectedJsonRoute,
          password_mode: variant.label,
          response: payload,
          verification,
        };
      }
    }

    throw new Error(
      `ZenTao JSON login did not establish a session for account '${this.account}'. Last response: ${JSON.stringify(
        lastPayload,
      )}`,
    );
  }

  private async loginWithWebAjax(protectedRoute: string): Promise<JsonObject> {
    await this.fetchWithSession(`${this.baseUrl}/user-login.html`, {
      headers: {
        "User-Agent": "OpenClaw-Zentao/1.0",
      },
    });

    const randResponse = await this.fetchWithSession(`${this.baseUrl}/user-refreshRandom.html`, {
      headers: {
        "User-Agent": "OpenClaw-Zentao/1.0",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    const rand = randResponse.bodyText.trim();
    if (!rand) {
      throw new Error("ZenTao web login did not return verifyRand.");
    }

    const passwordVariants = buildPasswordVariants(this.password, this.passwordHash, rand);
    let lastResponseText = "";

    for (const variant of passwordVariants) {
      const form = new FormData();
      form.set("account", this.account as string);
      form.set("password", variant.value);
      form.set("passwordStrength", String(computeLoginPasswordStrength(this.password, this.passwordHash)));
      form.set("referer", normalizeWebReferer(protectedRoute));
      form.set("verifyRand", rand);
      form.set("keepLogin", "0");
      form.set("captcha", "");

      const response = await this.fetchWithSession(`${this.baseUrl}/user-login.html`, {
        method: "POST",
        body: form,
        headers: {
          "User-Agent": "OpenClaw-Zentao/1.0",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${this.baseUrl}/user-login.html`,
          Origin: this.baseUrl,
        },
      });
      lastResponseText = response.bodyText;

      const verification = await this.sendJsonRequest("GET", `${this.baseUrl}/${this.toJsonRoute(protectedRoute).replace(/^\/+/, "")}`);
      const verificationData = parseEnvelopeData(verification.data, protectedRoute);
      if (!looksLikeLoginPayload(verificationData)) {
        return {
          login_mode: "web-ajax",
          password_mode: variant.label,
          verify_rand: rand,
          login_response_text: lastResponseText,
          verification,
        };
      }
    }

    throw new Error(
      `ZenTao web ajax login did not establish a session for account '${this.account}'. Last response: ${lastResponseText}`,
    );
  }

  private async fetchWithSession(
    requestUrl: string,
    options?: {
      method?: "GET" | "POST";
      headers?: Record<string, string>;
      body?: FormData;
    },
  ): Promise<HttpResponse> {
    const headers = new Headers(options?.headers ?? {});
    if (this.cookies.size > 0) {
      headers.set(
        "Cookie",
        Array.from(this.cookies.entries())
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      );
    }

    const response = await fetch(requestUrl, {
      method: options?.method ?? "GET",
      headers,
      body: options?.body,
      redirect: "manual",
    });

    this.captureFetchSession(response);
    return {
      statusCode: response.status,
      bodyText: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
    };
  }

  private captureFetchSession(response: Response): void {
    const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
    const cookies = getSetCookie ? getSetCookie() : [];
    for (const rawCookie of cookies) {
      const parsedCookie = normalizeSetCookie(rawCookie);
      if (parsedCookie) {
        this.cookies.set(parsedCookie.name, parsedCookie.value);
      }
    }
  }

  private async resolveJsonLoginUrl(protectedJsonRoute: string): Promise<string> {
    const targetUrl = `${this.baseUrl}/${protectedJsonRoute.replace(/^\/+/, "")}`;
    const response = await this.performRequest("GET", targetUrl, undefined, {
      followRedirects: false,
      accept: "application/json, text/plain, */*",
    });
    this.captureSession(response.headers);

    const locationHeader = response.headers.location;
    const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
    if (response.statusCode >= 300 && response.statusCode < 400 && typeof location === "string") {
      return new URL(location, targetUrl).toString();
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return `${this.baseUrl}/user-login.json`;
    }

    throw createHttpError(response, targetUrl);
  }

  private async getJsonLoginInfo(
    loginViewUrl: string,
  ): Promise<{
    rand: string;
    referer: string;
  }> {
    const response = await this.sendJsonRequest("GET", loginViewUrl);
    const data = parseEnvelopeData(response.data, loginViewUrl);
    if (!isJsonObject(data)) {
      throw new Error(`Unexpected ZenTao login view payload from ${loginViewUrl}`);
    }

    const randValue = data.rand;
    const rand =
      typeof randValue === "number"
        ? String(randValue)
        : typeof randValue === "string"
          ? randValue.trim()
          : "";
    const referer =
      typeof data.referer === "string" && data.referer.trim() ? data.referer.trim() : "/";

    if (!rand) {
      throw new Error(`ZenTao login view did not provide verifyRand from ${loginViewUrl}`);
    }

    return {
      rand,
      referer,
    };
  }

  private async listTasksAssignedToViaJsonView(
    identifiers: string[],
    limit: number,
  ): Promise<ZentaoTask[]> {
    const route = this.toJsonRoute(this.webMyTaskAssignedRoute);
    const url = `${this.baseUrl}/${route.replace(/^\/+/, "")}`;
    const response = await this.sendJsonRequest("GET", url);
    const parsedData = parseEnvelopeData(response.data, url);
    const searchTarget =
      parsedData === undefined
        ? response
        : ({
            ...response,
            data: parsedData,
          } as JsonObject);
    const tasks = extractTasksFromUnknown(searchTarget);

    if (tasks.length === 0) {
      return [];
    }

    if (identifiers.length === 0) {
      return tasks.slice(0, limit);
    }

    const normalizedIdentifiers = new Set(identifiers.map(normalizeComparableText).filter(Boolean));
    const filteredTasks = tasks.filter((task) => {
      const candidates = [
        task.assignedTo,
        task.account,
        task.openedBy,
        task.realname,
        typeof task.id === "number" ? String(task.id) : undefined,
      ];
      return candidates.some((candidate) => normalizedIdentifiers.has(normalizeComparableText(candidate)));
    });

    return (filteredTasks.length > 0 ? filteredTasks : tasks).slice(0, limit);
  }

  private async hasValidJsonSession(): Promise<boolean> {
    try {
      const route = this.toJsonRoute(this.webMyTaskAssignedRoute);
      const response = await this.sendJsonRequest(
        "GET",
        `${this.baseUrl}/${route.replace(/^\/+/, "")}`,
      );
      const parsedData = parseEnvelopeData(response.data, route);
      return !looksLikeLoginPayload(parsedData);
    } catch {
      return false;
    }
  }

  private userMatchesUserid(user: ZentaoUser, userid: string): boolean {
    return this.userMatchFields.some((field) => {
      const value = user[field];
      return typeof value === "string" && value.trim() === userid;
    });
  }

  private async sendJsonRequest(
    method: HttpMethod,
    requestUrl: string,
    jsonBody?: JsonObject,
  ): Promise<JsonObject> {
    const response = await this.performRequest(method, requestUrl, jsonBody);
    this.captureSession(response.headers);

    const redirectedResponse = await this.followRedirectIfNeeded(
      method,
      requestUrl,
      jsonBody,
      response,
      0,
    );
    if (redirectedResponse !== response) {
      this.captureSession(redirectedResponse.headers);
    }

    if (redirectedResponse.statusCode < 200 || redirectedResponse.statusCode >= 300) {
      throw createHttpError(redirectedResponse, requestUrl);
    }

    const data = parseJson<unknown>(redirectedResponse.bodyText, requestUrl);
    if (!isJsonObject(data)) {
      throw new Error(`Unexpected response payload from ${requestUrl}: expected JSON object`);
    }
    return data;
  }

  private async sendFormRequest(
    method: HttpMethod,
    requestUrl: string,
    formBody: Record<string, FormValue>,
    encoding: "urlencoded" | "multipart" = "urlencoded",
    extraHeaders?: Record<string, string>,
  ): Promise<HttpResponse> {
    const response = await this.performRequest(method, requestUrl, formBody, {
      bodyType: encoding,
      accept: "application/json, text/plain, */*",
      includeAjaxHeader: true,
      extraHeaders,
    });
    this.captureSession(response.headers);

    const redirectedResponse = await this.followRedirectIfNeeded(
      method,
      requestUrl,
      formBody,
      response,
      0,
      {
        bodyType: encoding,
        accept: "application/json, text/plain, */*",
        includeAjaxHeader: true,
        extraHeaders,
      },
    );
    if (redirectedResponse !== response) {
      this.captureSession(redirectedResponse.headers);
    }

    if (redirectedResponse.statusCode < 200 || redirectedResponse.statusCode >= 300) {
      throw createHttpError(redirectedResponse, requestUrl);
    }

    return redirectedResponse;
  }

  private captureSession(headers: Record<string, string | string[] | undefined>): void {
    const setCookieHeader = headers["set-cookie"];
    const cookieHeaders = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : typeof setCookieHeader === "string"
        ? [setCookieHeader]
        : [];

    for (const rawCookie of cookieHeaders) {
      const parsedCookie = normalizeSetCookie(rawCookie);
      if (parsedCookie) {
        this.cookies.set(parsedCookie.name, parsedCookie.value);
      }
    }
  }

  private toJsonRoute(route: string): string {
    return route.replace(/\.html$/i, ".json");
  }

  private performRequest(
    method: HttpMethod,
    requestUrl: string,
    requestBody?: JsonObject | Record<string, FormValue>,
    options?: {
      bodyType?: "json" | "urlencoded" | "multipart";
      followRedirects?: boolean;
      accept?: string;
      includeAjaxHeader?: boolean;
      extraHeaders?: Record<string, string>;
    },
  ): Promise<HttpResponse> {
    const url = new URL(requestUrl);
    const bodyType = options?.bodyType ?? "json";
    const multipartBoundary =
      bodyType === "multipart" ? `----OpenClawBoundary${Date.now().toString(16)}` : undefined;
    const bodyText =
      requestBody === undefined
        ? undefined
        : bodyType === "urlencoded"
          ? encodeUrlencodedForm(requestBody as Record<string, FormValue>)
          : bodyType === "multipart"
            ? encodeMultipartForm(requestBody as Record<string, FormValue>, multipartBoundary as string)
            : JSON.stringify(requestBody);
    const headers: Record<string, string> = {
      Accept: options?.accept ?? "application/json",
    };
    if (options?.includeAjaxHeader) {
      headers["X-Requested-With"] = "XMLHttpRequest";
    }
    for (const [key, value] of Object.entries(options?.extraHeaders ?? {})) {
      headers[key] = value;
    }

    if (this.token) {
      headers.Token = this.token;
    }
    if (this.cookies.size > 0) {
      headers.Cookie = Array.from(this.cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    }
    if (bodyText) {
      headers["Content-Type"] =
        bodyType === "urlencoded"
          ? "application/x-www-form-urlencoded; charset=UTF-8"
          : bodyType === "multipart"
            ? `multipart/form-data; boundary=${multipartBoundary}`
            : "application/json";
      headers["Content-Length"] = Buffer.byteLength(bodyText).toString();
    }

    const requestImpl = url.protocol === "https:" ? httpsRequest : httpRequest;

    return new Promise<HttpResponse>((resolve, reject) => {
      const request = requestImpl(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port ? Number(url.port) : undefined,
          path: `${url.pathname}${url.search}`,
          method,
          headers,
          timeout: this.timeout,
          rejectUnauthorized: this.verifySsl,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on("end", () => {
            resolve({
              statusCode: response.statusCode ?? 0,
              bodyText: Buffer.concat(chunks).toString("utf8"),
              headers: response.headers,
            });
          });
        },
      );

      request.on("error", reject);
      request.on("timeout", () => {
        request.destroy(new Error(`Request timed out after ${this.timeout} ms`));
      });

      if (bodyText) {
        request.write(bodyText);
      }
      request.end();
    });
  }

  private async followRedirectIfNeeded(
    method: HttpMethod,
    requestUrl: string,
    requestBody: JsonObject | Record<string, string> | undefined,
    response: HttpResponse,
    redirectCount: number,
    options?: {
      bodyType?: "json" | "urlencoded" | "multipart";
      accept?: string;
      includeAjaxHeader?: boolean;
      extraHeaders?: Record<string, string>;
    },
  ): Promise<HttpResponse> {
    if ((options?.bodyType === "urlencoded" || options?.bodyType === "multipart") && redirectCount === 0) {
      return response;
    }
    if (response.statusCode < 300 || response.statusCode >= 400) {
      return response;
    }

    const locationHeader = response.headers.location;
    const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
    if (!location) {
      return response;
    }

    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error(`Too many redirects while requesting ${requestUrl}`);
    }

    const nextUrl = new URL(location, requestUrl).toString();
    const nextResponse = await this.performRequest(method, nextUrl, requestBody, options);
    this.captureSession(nextResponse.headers);
    return this.followRedirectIfNeeded(
      method,
      nextUrl,
      requestBody,
      nextResponse,
      redirectCount + 1,
      options,
    );
  }
}

export function loadConfig(configPath = CONFIG_PATH): Config {
  const explicitOpenclawPath = firstExistingPath([
    process.env.OPENCLAW_ZENTAO_CONFIG_PATH,
    process.env.OPENCLAW_CONFIG_PATH,
    OPENCLAW_ZENTAO_CONFIG_PATH,
    OPENCLAW_CONFIG_PATH,
  ]);
  const openclawConfig = explicitOpenclawPath
    ? loadOpenclawSkillConfig(explicitOpenclawPath)
    : {};
  const localConfig = existsSync(configPath)
    ? parseJson<Config>(readFileSync(configPath, "utf8"), configPath)
    : {};

  return mergeConfig(openclawConfig, localConfig);
}

function loadOpenclawSkillConfig(configPath: string): Config {
  const rawConfig = parseJson<JsonObject>(readFileSync(configPath, "utf8"), configPath);
  const extracted = extractZentaoConfigFromOpenclaw(rawConfig);
  if (!extracted) {
    return {};
  }
  return extracted;
}

function extractZentaoConfigFromOpenclaw(value: JsonObject): Config | null {
  const channelDerived = extractWecomConfigFromChannels(value);
  const directCandidate = toConfigCandidate(value);
  if (directCandidate) {
    return mergeConfig(channelDerived, directCandidate);
  }

  const topLevelCandidates = [
    value.zentao,
    value["openclaw-zentao"],
    value.openclawZentao,
    getNestedObject(value, ["skills", "zentao"]),
    getNestedObject(value, ["skills", "openclaw-zentao"]),
    getNestedObject(value, ["agents", "zentao"]),
    getNestedObject(value, ["agents", "openclaw-zentao"]),
    getNestedObject(value, ["integrations", "zentao"]),
    getNestedObject(value, ["integrations", "wecomZentao"]),
  ];

  for (const candidate of topLevelCandidates) {
    if (isJsonObject(candidate)) {
      const normalized = toConfigCandidate(candidate);
      if (normalized) {
        return mergeConfig(channelDerived, normalized);
      }
    }
  }

  const queue: JsonObject[] = [value];
  const seen = new Set<JsonObject>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);

    for (const nested of Object.values(current)) {
      if (!isJsonObject(nested)) {
        continue;
      }
      const normalized = toConfigCandidate(nested);
      if (normalized) {
        return mergeConfig(channelDerived, normalized);
      }
      queue.push(nested);
    }
  }

  return hasConfigContent(channelDerived) ? channelDerived : null;
}

function toConfigCandidate(value: JsonObject): Config | null {
  const hasZentaoSignal =
    typeof value.base_url === "string" ||
    typeof value.api_base_url === "string" ||
    typeof value.account === "string" ||
    typeof value.password === "string";
  const hasWecomSignal =
    isJsonObject(value.wecom) &&
    (typeof value.wecom.corp_id === "string" || typeof value.wecom.corp_secret === "string");

  if (!hasZentaoSignal && !hasWecomSignal) {
    return null;
  }

  return value as Config;
}

function getNestedObject(value: JsonObject, path: string[]): JsonObject | undefined {
  let current: JsonValue | undefined = value;
  for (const segment of path) {
    if (!isJsonObject(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return isJsonObject(current) ? current : undefined;
}

function extractWecomConfigFromChannels(value: JsonObject): Config {
  const agent =
    getNestedObject(value, ["channels", "wecom", "accounts", "default", "agent"]) ??
    getNestedObject(value, ["channels", "wecom", "agent"]);

  if (!agent) {
    return {};
  }

  const corpId = firstNonEmptyString(
    typeof agent.corpId === "string" ? agent.corpId : undefined,
    typeof agent.corp_id === "string" ? agent.corp_id : undefined,
  );
  const corpSecret = firstNonEmptyString(
    typeof agent.corpSecret === "string" ? agent.corpSecret : undefined,
    typeof agent.corp_secret === "string" ? agent.corp_secret : undefined,
  );
  const agentId =
    typeof agent.agentId === "number" || typeof agent.agentId === "string"
      ? agent.agentId
      : typeof agent.agent_id === "number" || typeof agent.agent_id === "string"
        ? agent.agent_id
        : undefined;

  if (!corpId && !corpSecret && agentId === undefined) {
    return {};
  }

  return {
    wecom: {
      corp_id: corpId,
      corp_secret: corpSecret,
      agent_id: agentId,
    },
  };
}

function firstExistingPath(paths: Array<string | undefined>): string | undefined {
  for (const candidate of paths) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function mergeConfig(base: Config, override: Config): Config {
  return {
    ...base,
    ...override,
    user_match: {
      ...base.user_match,
      ...override.user_match,
    },
    user_sync: {
      ...base.user_sync,
      ...override.user_sync,
    },
    user_aliases: {
      ...(base.user_aliases ?? {}),
      ...(override.user_aliases ?? {}),
    },
    web_routes: {
      ...base.web_routes,
      ...override.web_routes,
    },
    debug: {
      ...base.debug,
      ...override.debug,
      tests: override.debug?.tests ?? base.debug?.tests,
    },
    wecom: mergeJsonObjectsIgnoringEmptyStrings(
      base.wecom as unknown as JsonObject | undefined,
      override.wecom as unknown as JsonObject | undefined,
    ) as Config["wecom"] extends infer T ? T : never,
  };
}

function hasConfigContent(config: Config): boolean {
  return Object.keys(config).length > 0;
}

function mergeJsonObjectsIgnoringEmptyStrings(
  base: JsonObject | undefined,
  override: JsonObject | undefined,
): JsonObject | undefined {
  if (!base && !override) {
    return undefined;
  }

  const result: JsonObject = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === "string" && value.trim() === "") {
      continue;
    }
    result[key] = value;
  }
  return result;
}

function normalizeUserMatchFields(fields?: string[]): string[] {
  if (!fields || fields.length === 0) {
    return [...DEFAULT_USER_MATCH_FIELDS];
  }
  return Array.from(
    new Set(
      fields
        .map((field) => field.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeUserListLimit(value?: number): number {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return DEFAULT_USER_LIST_LIMIT;
  }
  return Math.floor(value);
}

function normalizeOptionalInteger(value: JsonValue | undefined): number | undefined {
  if (typeof value === "number") {
    if (Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return undefined;
}

function normalizeVisions(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }

  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }

  return [];
}

function normalizeStringListInput(value: JsonValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : typeof item === "number" ? String(item) : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .replaceAll(String.fromCharCode(13), "")
      .split(String.fromCharCode(10))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return [String(value)];
  }

  return [];
}

function normalizeIdListInput(value: JsonValue | undefined): number[] {
  if (Array.isArray(value)) {
    const ids = value
      .map((item) => {
        if (typeof item === "number" && Number.isFinite(item) && item > 0) return Math.floor(item);
        if (typeof item === "string") {
          const parsed = Number(item.trim());
          return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
        }
        return undefined;
      })
      .filter((item): item is number => item !== undefined);
    return Array.from(new Set(ids));
  }

  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(",")
          .map((item) => Number(item.trim()))
          .filter((item) => Number.isFinite(item) && item > 0)
          .map((item) => Math.floor(item)),
      ),
    );
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return [Math.floor(value)];
  }

  return [];
}

function caseIdFromValue(value: JsonValue | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const match = value.match(/(?:case_)?(\d+)/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function numberOrUndefined(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractUsers(data: JsonObject): ZentaoUser[] {
  const directUsers = data.users;
  if (Array.isArray(directUsers)) {
    return directUsers.filter(isJsonObject) as ZentaoUser[];
  }

  const directData = data.data;
  if (Array.isArray(directData)) {
    return directData.filter(isJsonObject) as ZentaoUser[];
  }

  if (isJsonObject(directData) && Array.isArray(directData.users)) {
    return directData.users.filter(isJsonObject) as ZentaoUser[];
  }

  throw new Error("Unexpected /users response payload: could not find users array");
}

function extractSingleUserLegacy(data: JsonObject): ZentaoUser {
  if (isJsonObject(data.user)) {
    return data.user as ZentaoUser;
  }

  if (isJsonObject(data.data)) {
    const nestedUser = data.data.user;
    if (isJsonObject(nestedUser)) {
      return nestedUser as ZentaoUser;
    }
    return data.data as ZentaoUser;
  }

  return data as ZentaoUser;
}

function extractSingleUser(data: JsonObject): ZentaoUser {
  const directProfile = data.profile;
  if (isJsonObject(directProfile)) {
    return directProfile as ZentaoUser;
  }

  const directUser = data.user;
  if (isJsonObject(directUser)) {
    return directUser as ZentaoUser;
  }

  const directData = data.data;
  if (isJsonObject(directData)) {
    if (isJsonObject(directData.profile)) {
      return directData.profile as ZentaoUser;
    }
    if (isJsonObject(directData.user)) {
      return directData.user as ZentaoUser;
    }
    return directData as ZentaoUser;
  }

  if (typeof data.id === "number" || typeof data.account === "string") {
    return data as ZentaoUser;
  }

  throw new Error("Unexpected user payload: could not find user object");
}

function extractTasks(data: JsonObject): ZentaoTask[] {
  const directTasks = data.tasks;
  if (Array.isArray(directTasks)) {
    return directTasks.filter(isJsonObject) as ZentaoTask[];
  }

  const directData = data.data;
  if (Array.isArray(directData)) {
    return directData.filter(isJsonObject) as ZentaoTask[];
  }

  if (isJsonObject(directData) && Array.isArray(directData.tasks)) {
    return directData.tasks.filter(isJsonObject) as ZentaoTask[];
  }

  throw new Error("Unexpected /tasks response payload: could not find tasks array");
}

function parseJsonEnvelope(rawText: string, source: string): JsonPageEnvelope {
  const parsed = parseJson<unknown>(rawText, source);
  if (!isJsonObject(parsed)) {
    throw new Error(`Unexpected JSON envelope from ${source}: expected JSON object`);
  }
  return parsed as JsonPageEnvelope;
}

function encodeUrlencodedForm(fields: Record<string, FormValue>): string {
  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(fields)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      params.append(key, value);
    }
  }
  return params.toString();
}

function encodeMultipartForm(fields: Record<string, FormValue>, boundary: string): string {
  const chunks: string[] = [];
  for (const [key, rawValue] of Object.entries(fields)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      chunks.push(`--${boundary}\r\n`);
      chunks.push(`Content-Disposition: form-data; name="${escapeMultipartValue(key)}"\r\n\r\n`);
      chunks.push(`${value}\r\n`);
    }
  }
  chunks.push(`--${boundary}--\r\n`);
  return chunks.join("");
}

function escapeMultipartValue(value: string): string {
  return value.replace(/"/g, "%22");
}

function parseEnvelopeData(value: JsonValue | undefined, source: string): JsonValue | undefined {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed) as JsonValue;
    } catch {
      return value;
    }
  }

  if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
    throw new Error(`ZenTao returned HTML instead of JSON from ${source}`);
  }

  return value;
}

function hashZentaoPassword(password: string, rand: string): string {
  return md5Hex(`${md5Hex(password)}${rand}`);
}

function buildPasswordVariants(
  password: string | undefined,
  passwordHash: string | undefined,
  rand: string,
): Array<{
  label: string;
  value: string;
}> {
  const variants: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();
  const push = (label: string, value: string | undefined) => {
    const normalized = firstNonEmptyString(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    variants.push({ label, value: normalized });
  };

  if (password) {
    push("double-md5", hashZentaoPassword(password, rand));
    push("single-md5-plus-rand", `${md5Hex(password)}${rand}`);
    push("plain", password);
  }

  if (passwordHash) {
    push("stored-hash-double-md5", md5Hex(`${passwordHash}${rand}`));
    push("stored-hash-plus-rand", `${passwordHash}${rand}`);
    push("stored-hash-plain", passwordHash);
  }

  return variants;
}

function md5Hex(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex");
}

function computePasswordStrength(password: string): number {
  let hasNumber = false;
  let hasUpper = false;
  let hasLower = false;
  let hasSpecial = false;

  for (const char of password) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      hasNumber = true;
    } else if (code >= 65 && code <= 90) {
      hasUpper = true;
    } else if (code >= 97 && code <= 122) {
      hasLower = true;
    } else {
      hasSpecial = true;
    }
  }

  const complexity = [hasNumber, hasUpper, hasLower, hasSpecial].filter(Boolean).length;
  if ((complexity === 3 || complexity === 4) && password.length >= 10) {
    return 2;
  }
  if ((complexity === 3 || complexity === 4) && password.length >= 6) {
    return 1;
  }
  return 0;
}

function computeLoginPasswordStrength(
  password: string | undefined,
  passwordHash: string | undefined,
): number {
  if (password) {
    return computePasswordStrength(password);
  }
  if (passwordHash) {
    return 1;
  }
  return 0;
}

function buildVerifyPasswordValue(
  password: string | undefined,
  passwordHash: string | undefined,
  verifyRand: string,
): string {
  if (passwordHash) {
    return md5Hex(`${passwordHash}${verifyRand}`);
  }
  if (password) {
    return md5Hex(`${md5Hex(password)}${verifyRand}`);
  }
  throw new Error("Missing password or password hash for verifyPassword");
}

function extractTasksFromUnknown(value: JsonValue | undefined): ZentaoTask[] {
  const queue: JsonValue[] = [];
  if (value !== undefined) {
    queue.push(value);
  }

  const tasks: ZentaoTask[] = [];
  const seenTaskIds = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    if (!isJsonObject(current)) {
      continue;
    }

    if (looksLikeTask(current)) {
      const key = buildTaskDedupKey(current);
      if (!seenTaskIds.has(key)) {
        seenTaskIds.add(key);
        tasks.push(current as ZentaoTask);
      }
    }

    for (const nested of Object.values(current)) {
      if (nested !== undefined) {
        queue.push(nested);
      }
    }
  }

  return tasks;
}

function looksLikeTask(value: JsonObject): boolean {
  if (typeof value.id !== "number") {
    return false;
  }

  const hasName = typeof value.name === "string" && value.name.trim().length > 0;
  const hasStatus = typeof value.status === "string" && value.status.trim().length > 0;
  const hasAssignedTo =
    typeof value.assignedTo === "string" && value.assignedTo.trim().length > 0;

  return hasName && (hasStatus || hasAssignedTo);
}

function buildTaskDedupKey(task: JsonObject): string {
  const id = typeof task.id === "number" ? String(task.id) : "";
  const name = typeof task.name === "string" ? task.name.trim() : "";
  return `${id}:${name}`;
}

function looksLikeLoginPayload(value: JsonValue | undefined): boolean {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.rand === "number" ||
    typeof value.rand === "string" ||
    typeof value.referer === "string" ||
    value.loginExpired === true
  );
}

function normalizeWebReferer(route: string): string {
  if (!route) {
    return "/";
  }
  return route.startsWith("/") ? route : `/${route}`;
}

function buildUserIdentifiers(
  matchedUser: ZentaoUser | null,
  userid?: string,
  account?: string,
): string[] {
  return Array.from(
    new Set(
      [
        userid,
        account,
        matchedUser?.account,
        matchedUser?.realname,
        typeof matchedUser?.id === "number" ? String(matchedUser.id) : undefined,
      ]
        .map(normalizeComparableText)
        .filter(Boolean),
    ),
  );
}

function normalizeWecomOrgUser(input: WecomOrgUser): WecomOrgUser {
  const normalized: WecomOrgUser = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        normalized[key] = trimmed;
      }
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

function getWecomUserid(input: WecomOrgUser): string | null {
  return (
    firstNonEmptyString(
      typeof input.userid === "string" ? input.userid : undefined,
      typeof input.userId === "string" ? input.userId : undefined,
    ) ?? null
  );
}

function resolveSyncAccount(input: WecomOrgUser): string | null {
  const account = firstNonEmptyString(
    typeof input.account === "string" ? input.account : undefined,
    getWecomUserid(input) ?? undefined,
    extractAccountFromEmail(typeof input.email === "string" ? input.email : undefined),
  );
  return account ?? null;
}

function extractAccountFromEmail(email: string | undefined): string | undefined {
  if (!email) {
    return undefined;
  }
  const separatorIndex = email.indexOf("@");
  if (separatorIndex <= 0) {
    return undefined;
  }
  return email.slice(0, separatorIndex).trim();
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function normalizeDept(value: JsonValue | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const candidates = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
      }
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const dept = normalizeDept(item);
      if (dept !== undefined) {
        return dept;
      }
    }
  }

  if (isJsonObject(value)) {
    return normalizeDept(value.id);
  }

  return undefined;
}

function normalizeGender(value: string | number | undefined): string | undefined {
  if (typeof value === "number") {
    if (value === 1) {
      return "m";
    }
    if (value === 2) {
      return "f";
    }
    return undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "m", "male", "man", "男"].includes(normalized)) {
      return "m";
    }
    if (["2", "f", "female", "woman", "女"].includes(normalized)) {
      return "f";
    }
  }

  return undefined;
}

function extractVerifyRandFromHtml(html: string, source: string): string {
  const match =
    /name="verifyRand"\s+value="(\d+)"/.exec(html) ?? /"verifyRand"\s+value="(\d+)"/.exec(html);
  if (!match?.[1]) {
    throw new Error(`Could not find verifyRand in ZenTao HTML page: ${source}`);
  }
  return match[1];
}

function extractAlertMessage(html: string): string | undefined {
  const match = /window\.alert\('([^']*)'/.exec(html);
  if (!match?.[1]) {
    return undefined;
  }
  return match[1].replace(/\\n/g, "\n");
}

function isWebUserAlreadyExistsError(message: string): boolean {
  return message.includes("已经有") || message.toLowerCase().includes("already exists");
}

function stringifyOptional(value: JsonValue | number | string | undefined): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.floor(value));
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function accountFromPayload(payload: JsonObject): string {
  const account = stringifyOptional(payload.account);
  if (!account) {
    throw new Error("ZenTao create user payload is missing account");
  }
  return account;
}

function firstVisionFromPayload(payload: JsonObject, fallback: string[]): string {
  const visions = payload.visions;
  if (Array.isArray(visions)) {
    const first = visions.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string" && first.trim()) {
      return first.trim();
    }
  }
  if (typeof visions === "string" && visions.trim()) {
    return visions.trim();
  }
  return fallback[0] ?? "rnd";
}

function currentDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeStringList(value: JsonValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : typeof item === "number" ? String(item) : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return [String(value)];
  }

  return [];
}

function normalizeUserAliasMap(value: Record<string, string> | undefined): Record<string, string> {
  if (!value) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [alias, account] of Object.entries(value)) {
    const normalizedAlias = normalizeComparableText(alias);
    const normalizedAccount = firstNonEmptyString(account);
    if (!normalizedAlias || !normalizedAccount) {
      continue;
    }
    normalized[normalizedAlias] = normalizedAccount;
  }
  return normalized;
}

function ensureSelectableUser(
  users: JsonObject | null,
  userAliases: Record<string, string>,
  fieldName: string,
  value: string | undefined,
): string {
  const normalized = firstNonEmptyString(value) ?? "";
  if (!normalized) {
    return "";
  }
  const resolved = resolveSelectableUser(users, userAliases, normalized);
  if (!resolved) {
    const candidates = listSelectableUserCandidates(users).slice(0, 10).join(", ");
    throw new Error(
      `Unknown Zentao account for ${fieldName}: ${normalized}${candidates ? `. Available accounts: ${candidates}` : ""}`,
    );
  }
  return resolved;
}

function normalizeUserSelections(
  value: JsonValue | undefined,
  users: JsonObject | null,
  userAliases: Record<string, string>,
  fieldName: string,
): string[] {
  return normalizeStringList(value).map((item) => ensureSelectableUser(users, userAliases, fieldName, item));
}

function resolveSelectableUser(
  users: JsonObject | null,
  userAliases: Record<string, string>,
  rawValue: string,
): string | undefined {
  const direct = firstNonEmptyString(rawValue);
  if (!direct || !users) {
    return direct ?? undefined;
  }
  if (direct in users) {
    return direct;
  }

  const normalizedInput = normalizeComparableText(direct);
  const aliasAccount = userAliases[normalizedInput];
  if (aliasAccount && aliasAccount in users) {
    return aliasAccount;
  }

  for (const [account, label] of Object.entries(users)) {
    if (!account || account === "closed") {
      continue;
    }
    if (normalizeComparableText(label) === normalizedInput) {
      return account;
    }
  }

  return undefined;
}

function listSelectableUserCandidates(users: JsonObject | null): string[] {
  if (!users) {
    return [];
  }
  return Object.keys(users).filter((account) => account && account !== "closed");
}

function findLatestProductIdByName(
  beforeProducts: JsonValue | undefined,
  afterProducts: JsonValue | undefined,
  name: string,
): number | undefined {
  const beforeIds = new Set(
    collectProductIdsByName(beforeProducts, name).map((item) => String(item)),
  );
  const created = collectProductIdsByName(afterProducts, name).filter((item) => !beforeIds.has(String(item)));
  if (created.length > 0) {
    return created.sort((a, b) => b - a)[0];
  }
  const all = collectProductIdsByName(afterProducts, name);
  return all.sort((a, b) => b - a)[0];
}

function collectProductIdsByName(value: JsonValue | undefined, name: string): number[] {
  if (!isJsonObject(value)) {
    return [];
  }
  const ids: number[] = [];
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string" || item !== name) {
      continue;
    }
    const parsed = Number(key);
    if (Number.isFinite(parsed) && parsed > 0) {
      ids.push(parsed);
    }
  }
  return ids;
}

function buildModuleShortName(name: string): string {
  const compact = name.replace(/\s+/g, "");
  return compact.slice(0, 20);
}

function extractModuleNames(value: JsonValue | undefined): string[] {
  const names = new Set<string>();
  const queue: JsonValue[] = [];
  if (value !== undefined) {
    queue.push(value);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    if (!isJsonObject(current)) {
      continue;
    }

    const name = firstNonEmptyString(
      typeof current.name === "string" ? current.name : undefined,
      typeof current.text === "string" ? current.text : undefined,
    );
    if (name) {
      names.add(name);
    }

    for (const nested of Object.values(current)) {
      if (nested !== undefined) {
        queue.push(nested);
      }
    }
  }

  return Array.from(names);
}

function extractTreeModuleNamesFromHtml(html: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /name="modules\[id\d+\]"\s+value="([^"]+)"/g,
    /"name":"([^"]+)","parent":0,"path":",\d+,","grade":1/g,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const name = match[1]?.trim();
      if (name) {
        names.add(name);
      }
    }
  }

  return Array.from(names);
}

function extractTreeMaxOrder(html: string): number {
  const values = Array.from(html.matchAll(/name="order\[id\d+\]"\s+value="(\d+)"/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (values.length === 0) {
    return 0;
  }
  return values.sort((a, b) => b - a)[0] ?? 0;
}

function findDuplicateStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }
  return Array.from(duplicates);
}

function buildCreateUserPayload(
  input: WecomOrgUser,
  defaults: {
    account: string;
    password: string;
    defaultRole?: string;
    defaultGroup?: number;
    defaultDept?: number;
    defaultVisions: string[];
  },
): JsonObject {
  const payload: JsonObject = {
    account: defaults.account,
    password: defaults.password,
  };

  const realname = firstNonEmptyString(
    typeof input.realname === "string" ? input.realname : undefined,
    typeof input.name === "string" ? input.name : undefined,
  );
  if (realname) {
    payload.realname = realname;
  }

  const dept = normalizeDept(input.dept ?? input.department) ?? defaults.defaultDept;
  if (dept !== undefined) {
    payload.dept = dept;
  }

  const role = firstNonEmptyString(
    typeof input.role === "string" ? input.role : undefined,
    defaults.defaultRole,
  );
  if (role) {
    payload.role = role;
  }

  if (defaults.defaultGroup !== undefined) {
    payload.group = defaults.defaultGroup;
  }

  const visions = normalizeVisions(input.visions);
  const finalVisions = visions.length > 0 ? visions : defaults.defaultVisions;
  if (finalVisions.length > 0) {
    payload.visions = finalVisions;
  }

  return payload;
}

function buildUpdateUserPayload(
  input: WecomOrgUser,
  defaults: {
    defaultRole?: string;
    defaultDept?: number;
  },
): JsonObject {
  const payload: JsonObject = {};

  const realname = firstNonEmptyString(
    typeof input.realname === "string" ? input.realname : undefined,
    typeof input.name === "string" ? input.name : undefined,
  );
  if (realname) {
    payload.realname = realname;
  }

  const dept = normalizeDept(input.dept ?? input.department) ?? defaults.defaultDept;
  if (dept !== undefined) {
    payload.dept = dept;
  }

  const role = firstNonEmptyString(
    typeof input.role === "string" ? input.role : undefined,
    defaults.defaultRole,
  );
  if (role) {
    payload.role = role;
  }

  const email =
    typeof input.email === "string" && input.email.trim() ? input.email.trim() : undefined;
  if (email) {
    payload.email = email;
  }

  const mobile =
    typeof input.mobile === "string" && input.mobile.trim() ? input.mobile.trim() : undefined;
  if (mobile) {
    payload.mobile = mobile;
  }

  const phone = firstNonEmptyString(
    typeof input.phone === "string" ? input.phone : undefined,
    typeof input.telephone === "string" ? input.telephone : undefined,
  );
  if (phone) {
    payload.phone = phone;
  }

  const gender = normalizeGender(input.gender);
  if (gender) {
    payload.gender = gender;
  }

  return payload;
}

function buildDiffUpdatePayload(user: ZentaoUser, payload: JsonObject): JsonObject {
  const diff: JsonObject = {};
  for (const [key, value] of Object.entries(payload)) {
    const currentValue = user[key];
    if (Array.isArray(value) || isJsonObject(value)) {
      if (JSON.stringify(currentValue) !== JSON.stringify(value)) {
        diff[key] = value;
      }
      continue;
    }

    if (typeof value === "string") {
      if (normalizeComparableText(currentValue) !== normalizeComparableText(value)) {
        diff[key] = value;
      }
      continue;
    }

    if (currentValue !== value) {
      diff[key] = value;
    }
  }
  return diff;
}

function normalizeComparableTextLegacy(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeOptionalIntegerLegacy(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function normalizePositiveIntegerLegacy(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function normalizeVisionsLegacy(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function firstNonEmptyStringLegacy(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}

function normalizeWecomOrgUserLegacy(input: WecomOrgUser): WecomOrgUser {
  const normalized: WecomOrgUser = { ...input };

  const realname = firstNonEmptyString(input.realname, input.name);
  if (realname) {
    normalized.realname = realname;
  }

  const phone = firstNonEmptyString(input.phone, input.telephone);
  if (phone) {
    normalized.phone = phone;
  }

  if (typeof input.mobile === "string" && input.mobile.trim()) {
    normalized.mobile = input.mobile.trim();
  }
  if (typeof input.email === "string" && input.email.trim()) {
    normalized.email = input.email.trim();
  }
  if (typeof input.role === "string" && input.role.trim()) {
    normalized.role = input.role.trim();
  }

  return normalized;
}

function getWecomUseridLegacy(input: WecomOrgUser): string | null {
  return firstNonEmptyString(input.userid, input.userId) ?? null;
}

function resolveSyncAccountLegacy(input: WecomOrgUser): string | undefined {
  return (
    firstNonEmptyString(input.account, input.userid, input.userId) ??
    (typeof input.email === "string" ? input.email.split("@")[0]?.trim() : undefined)
  );
}

function toOptionalString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveDept(input: WecomOrgUser, defaultDept?: number): number | undefined {
  const candidate =
    normalizeOptionalInteger(input.dept as number | string | undefined) ??
    normalizeOptionalInteger(input.department as number | string | undefined);
  return candidate ?? defaultDept;
}

function normalizeGenderLegacy(value: string | number | undefined): string | undefined {
  if (typeof value === "number") {
    return value === 1 ? "m" : value === 2 ? "f" : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["m", "male", "1", "man"].includes(normalized)) {
    return "m";
  }
  if (["f", "female", "2", "woman"].includes(normalized)) {
    return "f";
  }
  return normalized;
}

function buildCreateUserPayloadLegacy(
  input: WecomOrgUser,
  defaults: {
    account: string;
    password: string;
    defaultRole?: string;
    defaultGroup?: number;
    defaultDept?: number;
    defaultVisions?: string[];
  },
): JsonObject {
  const payload: JsonObject = {
    account: defaults.account,
    password: defaults.password,
    realname: firstNonEmptyString(input.realname, input.name, defaults.account),
  };

  const role = firstNonEmptyString(input.role, defaults.defaultRole);
  const dept = resolveDept(input, defaults.defaultDept);
  const group = normalizeOptionalInteger(input.group as number | string | undefined) ?? defaults.defaultGroup;
  const visions = normalizeVisions(input.visions) || defaults.defaultVisions || [];
  const email = toOptionalString(input.email);
  const mobile = toOptionalString(input.mobile);
  const phone = firstNonEmptyString(input.phone, input.telephone);
  const gender = normalizeGender(input.gender);

  if (role) {
    payload.role = role;
  }
  if (dept !== undefined) {
    payload.dept = dept;
  }
  if (group !== undefined) {
    payload.group = group;
  }
  if (visions.length > 0) {
    payload.visions = visions;
  }
  if (email) {
    payload.email = email;
  }
  if (mobile) {
    payload.mobile = mobile;
  }
  if (phone) {
    payload.phone = phone;
  }
  if (gender) {
    payload.gender = gender;
  }

  return payload;
}

function buildUpdateUserPayloadLegacy(
  input: WecomOrgUser,
  defaults: {
    defaultRole?: string;
    defaultDept?: number;
  },
): JsonObject {
  const payload: JsonObject = {};
  const realname = firstNonEmptyString(input.realname, input.name);
  const role = firstNonEmptyString(input.role, defaults.defaultRole);
  const dept = resolveDept(input, defaults.defaultDept);
  const email = toOptionalString(input.email);
  const mobile = toOptionalString(input.mobile);
  const phone = firstNonEmptyString(input.phone, input.telephone);
  const gender = normalizeGender(input.gender);

  if (realname) {
    payload.realname = realname;
  }
  if (role) {
    payload.role = role;
  }
  if (dept !== undefined) {
    payload.dept = dept;
  }
  if (email) {
    payload.email = email;
  }
  if (mobile) {
    payload.mobile = mobile;
  }
  if (phone) {
    payload.phone = phone;
  }
  if (gender) {
    payload.gender = gender;
  }

  return payload;
}

function buildDiffUpdatePayloadLegacy(existingUser: ZentaoUser, nextPayload: JsonObject): JsonObject {
  const diff: JsonObject = {};

  for (const [key, value] of Object.entries(nextPayload)) {
    const currentValue = existingUser[key];
    const same =
      Array.isArray(value) && Array.isArray(currentValue)
        ? JSON.stringify(value) === JSON.stringify(currentValue)
        : String(value ?? "") === String(currentValue ?? "");

    if (!same) {
      diff[key] = value;
    }
  }

  return diff;
}

function normalizeComparableText(value: unknown): string {
  return normalizeComparableTextLegacy(value);
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return normalizePositiveIntegerLegacy(value, fallback);
}

function createHttpError(response: HttpResponse, requestUrl: string): HttpError {
  const locationHeader = response.headers.location;
  const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;

  if (
    response.statusCode >= 300 &&
    response.statusCode < 400 &&
    typeof location === "string" &&
    location.includes("/user-login")
  ) {
    return new HttpError(
      response.statusCode,
      response.bodyText,
      response.headers,
      `Request was redirected to ZenTao web login page (${location}) instead of returning JSON. Check whether the REST API endpoint is enabled and whether api_base_url is correct: ${requestUrl}`,
    );
  }

  if (response.statusCode >= 300 && response.statusCode < 400 && typeof location === "string") {
    return new HttpError(
      response.statusCode,
      response.bodyText,
      response.headers,
      `Request was redirected to ${location}: ${requestUrl}`,
    );
  }

  return new HttpError(response.statusCode, response.bodyText, response.headers);
}

function withExecutionNote(payload: JsonObject, fields: string[]): JsonObject {
  const cloned: JsonObject = { ...payload };
  for (const field of fields) {
    const current = cloned[field];
    if (typeof current !== "string") {
      continue;
    }
    const trimmed = current.trim();
    if (trimmed.includes(BOT_EXECUTION_NOTE)) {
      return cloned;
    }
    cloned[field] = trimmed ? `${trimmed}\n\n${BOT_EXECUTION_NOTE}` : BOT_EXECUTION_NOTE;
    return cloned;
  }
  return cloned;
}

function buildSessionCachePath(identity: string): string {
  const normalizedIdentity =
    normalizeComparableText(identity).replace(/[^a-z0-9_-]+/g, "-") || "default";
  return join(tmpdir(), `openclaw-zentao-session-${normalizedIdentity}.json`);
}

function readSimpleEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const env: Record<string, string> = {};
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized
      .slice(separatorIndex + 1)
      .trim()
      .replace(/\s+#.*$/g, "")
      .replace(/^['"]|['"]$/g, "");
    if (key) {
      env[key] = value;
    }
  }
  return env;
}

function resolveShellPlaceholderValue(value: string | undefined): string | undefined {
  const normalized = firstNonEmptyString(value);
  if (!normalized) {
    return undefined;
  }
  const match = normalized.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!match) {
    return normalized;
  }
  return firstNonEmptyString(process.env[match[1]]);
}

function resolveMysqlRuntimeConfig(): MysqlRuntimeConfig {
  const zboxEnv = readSimpleEnvFile(ZBOX_ENV_PATH);
  const secretEnv = readSimpleEnvFile(ZBOX_SECRETS_ENV_PATH);
  const mysqlPassword =
    firstNonEmptyString(
      process.env.ZENTAO_MYSQL_PASS,
      process.env.MYSQL_PASS,
      resolveShellPlaceholderValue(secretEnv.MYSQL_PASS),
      resolveShellPlaceholderValue(zboxEnv.MYSQL_PASS),
      DEFAULT_MYSQL_PASSWORD,
    ) ?? "";
  if (!mysqlPassword) {
    throw new Error(`Unable to resolve MySQL password from ${ZBOX_SECRETS_ENV_PATH}`);
  }

  return {
    mysqlBin: firstNonEmptyString(process.env.ZENTAO_MYSQL_BIN, ZBOX_MYSQL_BIN) ?? ZBOX_MYSQL_BIN,
    socket:
      firstNonEmptyString(
        process.env.ZENTAO_MYSQL_SOCKET,
        process.env.MYSQL_SOCK,
        resolveShellPlaceholderValue(zboxEnv.MYSQL_SOCK),
        ZBOX_MYSQL_SOCKET,
      ) ?? ZBOX_MYSQL_SOCKET,
    user: firstNonEmptyString(process.env.ZENTAO_MYSQL_USER, DEFAULT_MYSQL_USER) ?? DEFAULT_MYSQL_USER,
    password: mysqlPassword,
    database:
      firstNonEmptyString(process.env.ZENTAO_MYSQL_DATABASE, DEFAULT_ZENTAO_DATABASE) ??
      DEFAULT_ZENTAO_DATABASE,
  };
}

function sqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function queryMysqlTsv(sql: string): string {
  const mysql = resolveMysqlRuntimeConfig();
  return execFileSync(
    mysql.mysqlBin,
    [
      "--protocol=socket",
      `-u${mysql.user}`,
      `-p${mysql.password}`,
      "-S",
      mysql.socket,
      "--batch",
      "--raw",
      "--skip-column-names",
      mysql.database,
      "-e",
      sql,
    ],
    {
      encoding: "utf8",
    },
  ).trim();
}

function loadActorAuthCache(): ActorAuthCacheFile {
  if (!existsSync(ACTOR_AUTH_CACHE_PATH)) {
    return { version: 1, entries: {} };
  }

  try {
    const parsed = parseJson<ActorAuthCacheFile>(
      readFileSync(ACTOR_AUTH_CACHE_PATH, "utf8"),
      ACTOR_AUTH_CACHE_PATH,
    );
    return {
      version: parsed.version ?? 1,
      entries: parsed.entries ?? {},
    };
  } catch {
    return { version: 1, entries: {} };
  }
}

function saveActorAuthCache(cache: ActorAuthCacheFile): void {
  mkdirSync(dirname(ACTOR_AUTH_CACHE_PATH), { recursive: true });
  writeFileSync(ACTOR_AUTH_CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

function buildActorCacheKey(userid: string): string {
  return normalizeComparableText(userid) || userid.trim();
}

function readActorCredentialFromCache(userid: string): ActorAuthCacheEntry | null {
  const cache = loadActorAuthCache();
  const key = buildActorCacheKey(userid);
  const entry = cache.entries[key];
  if (!entry) {
    return null;
  }

  const cachedAt = Date.parse(entry.cachedAt);
  if (!Number.isFinite(cachedAt)) {
    return null;
  }

  if (Date.now() - cachedAt > DEFAULT_ACTOR_AUTH_CACHE_TTL_MS) {
    return null;
  }

  return entry;
}

function writeActorCredentialToCache(userid: string, credential: ActorCredential): ActorAuthCacheEntry {
  const cache = loadActorAuthCache();
  const key = buildActorCacheKey(userid);
  const entry: ActorAuthCacheEntry = {
    ...credential,
    cacheKey: key,
    userid,
    cachedAt: new Date().toISOString(),
  };
  cache.entries[key] = entry;
  saveActorAuthCache(cache);
  return entry;
}

function resolveActorCredential(
  userid: string,
  userAliases: Record<string, string>,
  forceRefresh = false,
): ActorCredential {
  const normalizedUserid = firstNonEmptyString(userid);
  if (!normalizedUserid) {
    throw new Error("Cannot resolve actor credential without userid");
  }

  if (!forceRefresh) {
    const cached = readActorCredentialFromCache(normalizedUserid);
    if (cached) {
      return cached;
    }
  }

  const candidates = Array.from(
    new Set(
      [
        normalizedUserid,
        userAliases[normalizedUserid],
      ]
        .map((value) => firstNonEmptyString(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const predicates: string[] = [];
  const orderBy: string[] = [];
  for (const candidate of candidates) {
    predicates.push(`account = ${sqlString(candidate)}`);
    predicates.push(`weixin = ${sqlString(candidate)}`);
    predicates.push(`realname = ${sqlString(candidate)}`);
    orderBy.push(`WHEN account = ${sqlString(candidate)} THEN 1`);
    orderBy.push(`WHEN weixin = ${sqlString(candidate)} THEN 2`);
    orderBy.push(`WHEN realname = ${sqlString(candidate)} THEN 3`);
  }

  const sql = `
SELECT account, realname, password
FROM zt_user
WHERE deleted = '0'
  AND (${predicates.join(" OR ")})
ORDER BY CASE
  ${orderBy.join("\n  ")}
  ELSE 99
END
LIMIT 1;
`.trim();
  const output = queryMysqlTsv(sql);
  if (!output) {
    throw new Error(`No ZenTao credential matched userid '${normalizedUserid}'`);
  }

  const [account, realname, passwordHash] = output.split("\t");
  if (!account || !passwordHash) {
    throw new Error(`Incomplete ZenTao credential row for userid '${normalizedUserid}'`);
  }

  const source =
    account === normalizedUserid
      ? "account"
      : realname === normalizedUserid
        ? "realname"
        : "weixin-or-alias";
  const credential = {
    account,
    realname: firstNonEmptyString(realname),
    passwordHash,
    source,
  };
  writeActorCredentialToCache(normalizedUserid, credential);
  return credential;
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

