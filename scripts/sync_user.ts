import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { printJson, ZentaoClient, type WecomOrgUser } from "./shared/zentao_client";
import { WecomClient, type WecomDepartment, type WecomDirectoryUser } from "./shared/wecom_client";

function parseJsonInput(raw: string, source: string): WecomOrgUser {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("payload must be a JSON object");
    }
    return parsed as WecomOrgUser;
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${source}: ${(error as Error).message}`);
  }
}

function parseDepartment(value: string | undefined): string[] | number[] | undefined {
  if (!value) {
    return undefined;
  }
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) {
    return undefined;
  }
  const parsedNumbers = items.map((item) => Number(item));
  if (parsedNumbers.every((item) => Number.isFinite(item) && item > 0)) {
    return parsedNumbers.map((item) => Math.floor(item));
  }
  return items;
}

function parseDepartmentIds(value: string | undefined): number[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item));
}

function mergeInputs(base: WecomOrgUser, overrides: WecomOrgUser): WecomOrgUser {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined && value !== "")),
  };
}

function mapWecomUserToSyncPayload(user: WecomDirectoryUser): WecomOrgUser {
  const userid = typeof user.userid === "string" ? user.userid.trim() : undefined;
  return {
    userid,
    userId: userid,
    account: userid,
    name: typeof user.name === "string" ? user.name.trim() : undefined,
    realname: typeof user.name === "string" ? user.name.trim() : undefined,
    email: typeof user.email === "string" ? user.email.trim() : undefined,
    mobile: typeof user.mobile === "string" ? user.mobile.trim() : undefined,
    phone: typeof user.telephone === "string" ? user.telephone.trim() : undefined,
    telephone: typeof user.telephone === "string" ? user.telephone.trim() : undefined,
    gender: typeof user.gender === "string" || typeof user.gender === "number" ? user.gender : undefined,
    department: user.department,
    position: typeof user.position === "string" ? user.position.trim() : undefined,
    role: typeof user.position === "string" ? user.position.trim() : undefined,
  };
}

function formatDepartmentTree(departments: WecomDepartment[]): string[] {
  const byParent = new Map<number, WecomDepartment[]>();
  const allIds = new Set<number>();
  for (const department of departments) {
    const id = typeof department.id === "number" ? department.id : undefined;
    const parentId = typeof department.parentid === "number" ? department.parentid : 0;
    if (id !== undefined) {
      allIds.add(id);
    }
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(department);
    byParent.set(parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => {
      const leftOrder = typeof left.order === "number" ? left.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = typeof right.order === "number" ? right.order : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return String(left.name ?? "").localeCompare(String(right.name ?? ""));
    });
  }
  const rootCandidates = departments.filter((department) => {
    const parentId = typeof department.parentid === "number" ? department.parentid : 0;
    return parentId === 0 || !allIds.has(parentId);
  });
  const output: string[] = [];
  const walk = (department: WecomDepartment, depth: number): void => {
    const id = typeof department.id === "number" ? department.id : 0;
    const name = typeof department.name === "string" && department.name.trim() ? department.name.trim() : `Department ${id}`;
    output.push(`${"  ".repeat(depth)}- [${id}] ${name}`);
    for (const child of byParent.get(id) ?? []) {
      walk(child, depth + 1);
    }
  };
  for (const department of rootCandidates) {
    walk(department, 0);
  }
  return output;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
      account: { type: "string" },
      name: { type: "string" },
      realname: { type: "string" },
      email: { type: "string" },
      mobile: { type: "string" },
      phone: { type: "string" },
      telephone: { type: "string" },
      gender: { type: "string" },
      department: { type: "string" },
      role: { type: "string" },
      group: { type: "string" },
      password: { type: "string" },
      visions: { type: "string" },
      data: { type: "string" },
      "data-file": { type: "string" },
      "from-wecom": { type: "boolean", default: false },
      "all-org": { type: "boolean", default: false },
      "fetch-child": { type: "boolean", default: true },
      "include-inactive": { type: "boolean", default: false },
      "list-departments": { type: "boolean", default: false },
      "validate-only": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  const filePayload = values["data-file"] ? parseJsonInput(readFileSync(values["data-file"], "utf8"), values["data-file"]) : {};
  const inlinePayload = values.data ? parseJsonInput(values.data, "--data") : {};
  const cliPayload: WecomOrgUser = {
    userid: values.userid,
    account: values.account,
    name: values.name,
    realname: values.realname,
    email: values.email,
    mobile: values.mobile,
    phone: values.phone,
    telephone: values.telephone,
    gender: values.gender,
    department: parseDepartment(values.department),
    role: values.role,
    group: values.group,
    password: values.password,
    visions: values.visions,
  };

  const payload = mergeInputs(mergeInputs(filePayload, inlinePayload), cliPayload);
  const wecomClient = new WecomClient();
  const departmentIds = values["all-org"] ? [wecomClient.rootDepartmentId] : parseDepartmentIds(values.department);

  if (values["validate-only"]) {
    printJson({
      ok: true,
      mode: values["list-departments"] ? "list-departments" : departmentIds.length > 0 ? (values["all-org"] ? "all-org" : "department") : values["from-wecom"] ? "single-from-wecom" : "single-payload",
      payload,
      department_ids: departmentIds,
      fetch_child: values["fetch-child"],
      include_inactive: values["include-inactive"],
      wecom_configured: wecomClient.isConfigured(),
      note: "validate-only does not write Zentao users",
    });
    return;
  }

  if (values["list-departments"]) {
    const requestedDepartments = parseDepartmentIds(values.department);
    const departments = await wecomClient.listDepartments(requestedDepartments[0]);
    printJson({ ok: true, count: departments.length, departments, tree: formatDepartmentTree(departments) });
    return;
  }

  const client = new ZentaoClient({ userid: values.userid });

  if (departmentIds.length > 0) {
    const users = await wecomClient.listUsersByDepartments(departmentIds, {
      fetchChild: values["fetch-child"],
      includeInactive: values["include-inactive"],
    });
    const results = [];
    const failures = [];
    for (const user of users) {
      try {
        const syncPayload = mergeInputs(mapWecomUserToSyncPayload(user), payload);
        const result = await client.syncWecomUser(syncPayload);
        results.push(result);
      } catch (error) {
        failures.push({
          userid: typeof user.userid === "string" ? user.userid : null,
          name: typeof user.name === "string" ? user.name : null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const summary = {
      total: users.length,
      created: results.filter((item) => item.action === "created").length,
      updated: results.filter((item) => item.action === "updated").length,
      noop: results.filter((item) => item.action === "noop").length,
      failed: failures.length,
    };
    printJson({ ok: failures.length === 0, mode: values["all-org"] ? "all-org" : "department", department_ids: departmentIds, fetch_child: values["fetch-child"], include_inactive: values["include-inactive"], summary, results, failures });
    return;
  }

  let finalPayload = payload;
  if (values["from-wecom"]) {
    const userid = values.userid ?? payload.userid ?? payload.userId;
    if (!userid) {
      throw new Error("Option --from-wecom requires --userid, userid, or userId in the payload.");
    }
    const wecomUser = await wecomClient.getUser(userid);
    finalPayload = mergeInputs(mapWecomUserToSyncPayload(wecomUser), payload);
  }

  const result = await client.syncWecomUser(finalPayload);
  printJson({ ok: true, input: finalPayload, result });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
