import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ContextEntityName, ContextCandidate } from "./wecom_session_context_store";

const STORE_DIR = path.resolve(__dirname, "../../tmp/wecom-pending-routes");
const EXPIRY_MS = 5 * 60 * 1000;

export interface WecomPendingRouteSelection {
  id: string;
  userid: string;
  routeIntent: string;
  routeTrigger: string | null;
  originalText: string;
  args: Record<string, string>;
  entity: ContextEntityName;
  candidates: ContextCandidate[];
  createdAt: number;
}

function ensureStoreDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function sanitizeUserid(userid: string): string {
  return userid.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function getStoreFile(userid: string): string {
  return path.join(STORE_DIR, `${sanitizeUserid(userid)}.json`);
}

function isExpired(record: WecomPendingRouteSelection, now = Date.now()): boolean {
  return now - record.createdAt > EXPIRY_MS;
}

export function savePendingRouteSelection(input: Omit<WecomPendingRouteSelection, "id" | "createdAt">): WecomPendingRouteSelection {
  ensureStoreDir();
  const record: WecomPendingRouteSelection = {
    id: randomUUID(),
    createdAt: Date.now(),
    ...input,
  };
  writeFileSync(getStoreFile(input.userid), JSON.stringify(record, null, 2), "utf8");
  return record;
}

export function loadPendingRouteSelection(userid: string): WecomPendingRouteSelection | null {
  ensureStoreDir();
  const storeFile = getStoreFile(userid.trim());
  if (!existsSync(storeFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(storeFile, "utf8")) as WecomPendingRouteSelection;
    if (!parsed || typeof parsed !== "object" || isExpired(parsed)) {
      rmSync(storeFile, { force: true });
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingRouteSelection(userid: string): void {
  rmSync(getStoreFile(userid.trim()), { force: true });
}
