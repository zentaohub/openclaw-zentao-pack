import { type JsonObject, type JsonValue, printJson, type WecomOrgUser, ZentaoClient } from "../shared/zentao_client";

interface CallbackPayload extends JsonObject {
  InfoType?: string;
  infoType?: string;
  ChangeType?: string;
  changeType?: string;
  body?: JsonValue;
}

interface ContactSyncEvent {
  infoType: string;
  changeType: string;
  payload: JsonObject;
}

interface ContactSyncResult extends JsonObject {
  ok: boolean;
  event_type: string;
  action: "sync_user" | "skip_user_delete" | "skip_department";
  userid?: string | null;
  reason?: string;
  sync_result?: JsonObject;
}

export function isContactSyncPayload(payload: JsonObject): boolean {
  const event = extractContactSyncEvent(payload);
  return Boolean(event);
}

export async function handleContactSyncPayload(payload: JsonObject): Promise<JsonObject> {
  const event = extractContactSyncEvent(payload);
  if (!event) {
    throw new Error("Current callback payload is not a contact sync event.");
  }

  const result = await dispatchContactSyncEvent(event);
  return {
    ok: true,
    intent: "contact_sync",
    info_type: event.infoType,
    change_type: event.changeType,
    result,
  };
}

async function dispatchContactSyncEvent(event: ContactSyncEvent): Promise<ContactSyncResult> {
  if (["create_party", "update_party", "delete_party"].includes(event.changeType)) {
    return {
      ok: true,
      event_type: event.changeType,
      action: "skip_department",
      reason: "Department change received. Current sync flow only writes Zentao users.",
    };
  }

  if (event.changeType === "delete_user") {
    return {
      ok: true,
      event_type: event.changeType,
      action: "skip_user_delete",
      userid: firstNonEmptyString(
        pickString(event.payload, ["UserID", "userid", "userId"]),
        pickString(event.payload, ["NewUserID"]),
      ) ?? null,
      reason:
        "Delete-user callback received, but current Zentao integration does not disable users automatically.",
    };
  }

  if (!["create_user", "update_user"].includes(event.changeType)) {
    return {
      ok: true,
      event_type: event.changeType,
      action: "skip_department",
      reason: "Unsupported contact sync event type.",
    };
  }

  const syncPayload = buildWecomOrgUserFromEvent(event);
  const userid = firstNonEmptyString(syncPayload.userid, syncPayload.userId) ?? null;
  if (!userid) {
    throw new Error(`Cannot determine userid from contact sync event '${event.changeType}'.`);
  }

  const zentaoClient = new ZentaoClient({ userid });
  const syncResult = await zentaoClient.syncWecomUser(syncPayload);
  return {
    ok: true,
    event_type: event.changeType,
    action: "sync_user",
    userid,
    sync_result: syncResult,
  };
}

function extractContactSyncEvent(payload: JsonObject): ContactSyncEvent | null {
  const candidates = [payload, toObject(payload.body)].filter(Boolean) as JsonObject[];
  for (const candidate of candidates) {
    const infoType = firstNonEmptyString(
      pickString(candidate, ["InfoType", "infoType"]),
      pickString(payload, ["InfoType", "infoType"]),
    );
    const changeType = firstNonEmptyString(
      pickString(candidate, ["ChangeType", "changeType"]),
      pickString(payload, ["ChangeType", "changeType"]),
    );

    if (infoType === "change_contact" || changeType) {
      return {
        infoType: infoType ?? "change_contact",
        changeType: changeType ?? "unknown",
        payload: candidate,
      };
    }
  }

  return null;
}

function buildWecomOrgUserFromEvent(event: ContactSyncEvent): WecomOrgUser {
  const payload = event.payload;
  const userid = firstNonEmptyString(
    pickString(payload, ["UserID", "userid", "userId", "NewUserID"]),
  );
  const name = firstNonEmptyString(pickString(payload, ["Name", "name"]));
  const mobile = firstNonEmptyString(pickString(payload, ["Mobile", "mobile"]));
  const telephone = firstNonEmptyString(pickString(payload, ["Telephone", "telephone"]));
  const email = firstNonEmptyString(pickString(payload, ["Email", "email"]));
  const position = firstNonEmptyString(pickString(payload, ["Position", "position"]));
  const gender = firstNonEmptyString(pickString(payload, ["Gender", "gender"]));
  const department = parseDepartmentValue(payload["Department"] ?? payload["department"]);

  return {
    userid,
    userId: userid,
    account: userid,
    name,
    realname: name,
    mobile,
    telephone,
    phone: telephone,
    email,
    position,
    role: position,
    gender,
    department,
  };
}

function parseDepartmentValue(value: JsonValue | undefined): JsonValue | undefined {
  if (typeof value === "string") {
    const items = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) {
      return undefined;
    }
    const numbers = items.map((item) => Number(item));
    if (numbers.every((item) => Number.isFinite(item) && item > 0)) {
      return numbers.map((item) => Math.floor(item));
    }
    return items;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => {
        if (typeof item === "number" && Number.isFinite(item) && item > 0) {
          return Math.floor(item);
        }
        if (typeof item === "string" && item.trim()) {
          const parsed = Number(item.trim());
          return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : item.trim();
        }
        return undefined;
      })
      .filter((item) => item !== undefined) as Array<number | string>;
    if (normalized.length === 0) {
      return undefined;
    }
    if (normalized.every((item) => typeof item === "number")) {
      return normalized as number[];
    }
    return normalized.map((item) => String(item)) as string[];
  }

  return undefined;
}

function pickString(record: JsonObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function toObject(value: JsonValue | undefined): JsonObject | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return undefined;
}

if (require.main === module) {
  void (async () => {
    const raw = await new Promise<string>((resolve, reject) => {
      let buffer = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        buffer += chunk;
      });
      process.stdin.on("end", () => resolve(buffer));
      process.stdin.on("error", reject);
    });
    const payload = JSON.parse(raw) as JsonObject;
    printJson(await handleContactSyncPayload(payload));
  })().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  });
}
