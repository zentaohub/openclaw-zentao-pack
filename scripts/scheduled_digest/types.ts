import type { JsonObject } from "../shared/zentao_client";

export type ScheduledDigestRole = "pm" | "dev" | "qa" | "manager";
export type ScheduledDigestTimeslot = "morning" | "evening";
export type DigestFocusBucket = "risk" | "todo";
export type DigestFocusSeverity = "p0" | "p1" | "info";

export interface ScheduledDigestStrategy {
  mergeMultiRoles: boolean;
  topN: number;
  skipWhenEmpty: boolean;
  majorRiskImmediate: boolean;
  maxSections: number;
  maxLinks: number;
  titleMaxChars: number;
}

export interface ScheduledDigestRiskRules {
  highBug: {
    p1Hours: number;
    p2Hours: number;
  };
  bug: {
    overdueDays: number;
  };
  task: {
    blockedOverdueAsP0: boolean;
  };
  project: {
    delayEscalationDays: number[];
  };
  immediateCooldownHours: number;
}

export interface ScheduledDigestScope {
  products: number[];
  projects: number[];
  executions: number[];
}

export interface ScheduledDigestUserPreferences {
  receiveMorning: boolean;
  receiveEvening: boolean;
  receiveImmediate: boolean;
}

export interface ScheduledDigestUserConfig {
  enabled: boolean;
  userid: string;
  name: string;
  zentaoAccount: string;
  roles: ScheduledDigestRole[];
  scope: ScheduledDigestScope;
  preferences: ScheduledDigestUserPreferences;
}

export interface ScheduledDigestConfig {
  enabled: boolean;
  timezone: string;
  schedules: {
    morning: string;
    evening: string;
  };
  strategy: ScheduledDigestStrategy;
  riskRules: ScheduledDigestRiskRules;
  users: ScheduledDigestUserConfig[];
  sourcePath: string;
}

export interface DigestLink {
  label: string;
  url: string;
}

export interface DigestFocusItem {
  key: string;
  bucket: DigestFocusBucket;
  severity: DigestFocusSeverity;
  text: string;
  url?: string;
}

export interface RoleDigestData {
  role: ScheduledDigestRole;
  title: string;
  overviewParts: string[];
  riskItems: DigestFocusItem[];
  todoItems: DigestFocusItem[];
  links: DigestLink[];
  metrics: JsonObject;
}

export interface UserDigestMessage {
  userid: string;
  zentaoAccount: string;
  roles: ScheduledDigestRole[];
  markdown: string;
  title: string;
  overviewParts: string[];
  riskItems: DigestFocusItem[];
  todoItems: DigestFocusItem[];
  links: DigestLink[];
  metrics: JsonObject;
}

export interface ScheduledDigestAuditRecord extends JsonObject {
  id: string;
  created_at: string;
  timeslot: ScheduledDigestTimeslot;
  userid: string;
  zentao_account: string;
  roles: ScheduledDigestRole[];
  dry_run: boolean;
  ok: boolean;
  sent: boolean;
  title?: string;
  overview?: string[];
  risk_count?: number;
  todo_count?: number;
  links?: string[];
  skipped_reason?: string;
  error?: string;
  wecom_response?: JsonObject;
}
