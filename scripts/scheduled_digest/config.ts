import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ScheduledDigestConfig, ScheduledDigestRiskRules, ScheduledDigestRole, ScheduledDigestScope, ScheduledDigestStrategy, ScheduledDigestUserConfig, ScheduledDigestUserPreferences } from "./types";

const DEFAULT_STRATEGY: ScheduledDigestStrategy = {
  mergeMultiRoles: true,
  topN: 3,
  skipWhenEmpty: false,
  majorRiskImmediate: true,
  maxSections: 2,
  maxLinks: 2,
  titleMaxChars: 22,
};

const DEFAULT_RISK_RULES: ScheduledDigestRiskRules = {
  highBug: {
    p1Hours: 24,
    p2Hours: 72,
  },
  bug: {
    overdueDays: 3,
  },
  task: {
    blockedOverdueAsP0: true,
  },
  project: {
    delayEscalationDays: [1, 3, 7],
  },
  immediateCooldownHours: 8,
};

const DEFAULT_SCOPE: ScheduledDigestScope = {
  products: [],
  projects: [],
  executions: [],
};

const DEFAULT_PREFERENCES: ScheduledDigestUserPreferences = {
  receiveMorning: true,
  receiveEvening: true,
  receiveImmediate: true,
};

const VALID_ROLES = new Set<ScheduledDigestRole>(["pm", "dev", "qa", "manager"]);

export function loadScheduledDigestConfig(configPath?: string): ScheduledDigestConfig {
  const resolvedPath = resolveScheduledDigestConfigPath(configPath);
  if (!resolvedPath || !existsSync(resolvedPath)) {
    throw new Error(
      `Scheduled digest config not found. Set --config or OPENCLAW_SCHEDULED_DIGEST_CONFIG_PATH, or create ${path.join(resolveRepoRoot(), "scheduled-digest.json")}.`,
    );
  }

  const raw = parseJson(readFileSync(resolvedPath, "utf8"), resolvedPath);
  return normalizeConfig(raw, resolvedPath);
}

function resolveScheduledDigestConfigPath(configPath?: string): string | null {
  const candidates = [
    configPath,
    process.env.OPENCLAW_SCHEDULED_DIGEST_CONFIG_PATH,
    path.join(resolveRepoRoot(), "scripts", "scheduled_digest", "scheduled-digest.json"),
    path.join(resolveRepoRoot(), "scheduled-digest.json"),
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  return candidates.length > 0 ? path.resolve(candidates[0]) : null;
}

function resolveRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../.."),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "package.json")) && existsSync(path.join(candidate, "scripts"))) {
      return candidate;
    }
  }

  return process.cwd();
}

function parseJson(rawText: string, source: string): unknown {
  try {
    return JSON.parse(rawText) as unknown;
  } catch (error) {
    throw new Error(`Failed to parse scheduled digest config ${source}: ${(error as Error).message}`);
  }
}

function normalizeConfig(raw: unknown, sourcePath: string): ScheduledDigestConfig {
  const root = asRecord(raw, "scheduled digest config");
  const users = asArray(root.users, "users").map((item, index) => normalizeUser(item, index));
  validateUniqueUsers(users);

  const timezone = asOptionalString(root.timezone)?.trim() || "Asia/Shanghai";
  const schedules = asRecord(root.schedules, "schedules");

  return {
    enabled: asOptionalBoolean(root.enabled) ?? true,
    timezone,
    schedules: {
      morning: requireNonEmptyString(schedules.morning, "schedules.morning"),
      evening: requireNonEmptyString(schedules.evening, "schedules.evening"),
    },
    strategy: normalizeStrategy(root.strategy),
    riskRules: normalizeRiskRules(root.riskRules),
    users,
    sourcePath,
  };
}

function normalizeStrategy(value: unknown): ScheduledDigestStrategy {
  const raw = value === undefined ? {} : asRecord(value, "strategy");
  return {
    mergeMultiRoles: asOptionalBoolean(raw.mergeMultiRoles) ?? DEFAULT_STRATEGY.mergeMultiRoles,
    topN: normalizeBoundedNumber(raw.topN, DEFAULT_STRATEGY.topN, "strategy.topN", 1, 5),
    skipWhenEmpty: asOptionalBoolean(raw.skipWhenEmpty) ?? DEFAULT_STRATEGY.skipWhenEmpty,
    majorRiskImmediate: asOptionalBoolean(raw.majorRiskImmediate) ?? DEFAULT_STRATEGY.majorRiskImmediate,
    maxSections: normalizeBoundedNumber(raw.maxSections, DEFAULT_STRATEGY.maxSections, "strategy.maxSections", 1, 3),
    maxLinks: normalizeBoundedNumber(raw.maxLinks, DEFAULT_STRATEGY.maxLinks, "strategy.maxLinks", 1, 3),
    titleMaxChars: normalizeBoundedNumber(raw.titleMaxChars, DEFAULT_STRATEGY.titleMaxChars, "strategy.titleMaxChars", 10, 40),
  };
}

function normalizeRiskRules(value: unknown): ScheduledDigestRiskRules {
  const raw = value === undefined ? {} : asRecord(value, "riskRules");
  const highBug = raw.highBug === undefined ? {} : asRecord(raw.highBug, "riskRules.highBug");
  const bug = raw.bug === undefined ? {} : asRecord(raw.bug, "riskRules.bug");
  const task = raw.task === undefined ? {} : asRecord(raw.task, "riskRules.task");
  const project = raw.project === undefined ? {} : asRecord(raw.project, "riskRules.project");

  return {
    highBug: {
      p1Hours: normalizeBoundedNumber(highBug.p1Hours, DEFAULT_RISK_RULES.highBug.p1Hours, "riskRules.highBug.p1Hours", 1, 24 * 30),
      p2Hours: normalizeBoundedNumber(highBug.p2Hours, DEFAULT_RISK_RULES.highBug.p2Hours, "riskRules.highBug.p2Hours", 1, 24 * 30),
    },
    bug: {
      overdueDays: normalizeBoundedNumber(bug.overdueDays, DEFAULT_RISK_RULES.bug.overdueDays, "riskRules.bug.overdueDays", 1, 60),
    },
    task: {
      blockedOverdueAsP0: asOptionalBoolean(task.blockedOverdueAsP0) ?? DEFAULT_RISK_RULES.task.blockedOverdueAsP0,
    },
    project: {
      delayEscalationDays: normalizePositiveIntegerArray(project.delayEscalationDays, "riskRules.project.delayEscalationDays", DEFAULT_RISK_RULES.project.delayEscalationDays),
    },
    immediateCooldownHours: normalizeBoundedNumber(raw.immediateCooldownHours, DEFAULT_RISK_RULES.immediateCooldownHours, "riskRules.immediateCooldownHours", 1, 24 * 30),
  };
}

function normalizeUser(value: unknown, index: number): ScheduledDigestUserConfig {
  const user = asRecord(value, `users[${index}]`);
  const scope = user.scope === undefined ? {} : asRecord(user.scope, `users[${index}].scope`);
  const preferences = user.preferences === undefined ? {} : asRecord(user.preferences, `users[${index}].preferences`);
  const roles = asArray(user.roles, `users[${index}].roles`).map((item) => {
    if (typeof item !== "string") {
      throw new Error(`users[${index}].roles contains a non-string value`);
    }
    if (!VALID_ROLES.has(item as ScheduledDigestRole)) {
      throw new Error(`users[${index}].roles contains invalid role '${item}'`);
    }
    return item as ScheduledDigestRole;
  });
  if (roles.length === 0) {
    throw new Error(`users[${index}].roles must contain at least one role`);
  }

  const normalizedUser: ScheduledDigestUserConfig = {
    enabled: asOptionalBoolean(user.enabled) ?? true,
    userid: requireNonEmptyString(user.userid, `users[${index}].userid`),
    name: asOptionalString(user.name)?.trim() ?? "",
    zentaoAccount: requireNonEmptyString(user.zentaoAccount, `users[${index}].zentaoAccount`),
    roles,
    scope: {
      products: normalizePositiveIntegerArray(scope.products, `users[${index}].scope.products`, DEFAULT_SCOPE.products),
      projects: normalizePositiveIntegerArray(scope.projects, `users[${index}].scope.projects`, DEFAULT_SCOPE.projects),
      executions: normalizePositiveIntegerArray(scope.executions, `users[${index}].scope.executions`, DEFAULT_SCOPE.executions),
    },
    preferences: {
      receiveMorning: asOptionalBoolean(preferences.receiveMorning) ?? DEFAULT_PREFERENCES.receiveMorning,
      receiveEvening: asOptionalBoolean(preferences.receiveEvening) ?? DEFAULT_PREFERENCES.receiveEvening,
      receiveImmediate: asOptionalBoolean(preferences.receiveImmediate) ?? DEFAULT_PREFERENCES.receiveImmediate,
    },
  };

  if (normalizedUser.roles.includes("manager") && normalizedUser.scope.projects.length === 0 && normalizedUser.scope.executions.length === 0) {
    throw new Error(`users[${index}] role 'manager' requires at least one project or execution in scope`);
  }

  return normalizedUser;
}

function validateUniqueUsers(users: ScheduledDigestUserConfig[]): void {
  const seen = new Set<string>();
  for (const user of users) {
    if (seen.has(user.userid)) {
      throw new Error(`Duplicate scheduled digest userid '${user.userid}'`);
    }
    seen.add(user.userid);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an array`);
  }
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string`);
  }
  return value.trim();
}

function normalizeBoundedNumber(
  value: unknown,
  fallback: number,
  label: string,
  min: number,
  max: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected ${label} to be between ${min} and ${max}`);
  }
  return Math.floor(parsed);
}

function normalizePositiveIntegerArray(value: unknown, label: string, fallback: number[]): number[] {
  if (value === undefined) {
    return [...fallback];
  }
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an array`);
  }
  const normalized = value.map((item) => {
    const parsed = typeof item === "number" ? item : typeof item === "string" ? Number(item) : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Expected ${label} to contain only positive integers`);
    }
    return Math.floor(parsed);
  });
  return Array.from(new Set(normalized));
}
