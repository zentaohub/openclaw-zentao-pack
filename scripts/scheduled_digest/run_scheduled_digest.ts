import { parseArgs } from "node:util";
import { WecomClient } from "../shared/wecom_client";
import { printJson, ZentaoClient, type JsonObject } from "../shared/zentao_client";
import { writeScheduledDigestAudit, createScheduledDigestAuditId, hasSuccessfulScheduledDigestAudit } from "./audit";
import { collectRoleDigests } from "./collectors";
import { loadScheduledDigestConfig } from "./config";
import { renderUserDigestMessage } from "./renderer";
import type { ScheduledDigestTimeslot, ScheduledDigestAuditRecord } from "./types";

function parseTimeslot(value: string | undefined): ScheduledDigestTimeslot {
  if (value === "morning" || value === "evening") {
    return value;
  }
  throw new Error("Missing or invalid --timeslot. Use --timeslot morning or --timeslot evening");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      timeslot: { type: "string" },
      userid: { type: "string" },
      config: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  const timeslot = parseTimeslot(values.timeslot);
  const config = loadScheduledDigestConfig(values.config);
  if (!config.enabled) {
    printJson({
      ok: true,
      enabled: false,
      skipped_reason: "scheduled digest disabled",
      config: config.sourcePath,
    });
    return;
  }

  const filteredUsers = config.users.filter((user) => {
    if (!user.enabled) {
      return false;
    }
    if (values.userid && user.userid !== values.userid.trim()) {
      return false;
    }
    if (timeslot === "morning" && !user.preferences.receiveMorning) {
      return false;
    }
    if (timeslot === "evening" && !user.preferences.receiveEvening) {
      return false;
    }
    return true;
  });

  const results: JsonObject[] = [];
  let hasFailure = false;

  for (const user of filteredUsers) {
    const client = new ZentaoClient({ userid: user.zentaoAccount });

    try {
      if (!values["dry-run"] && !values.force && hasSuccessfulScheduledDigestAudit({
        userid: user.userid,
        timeslot,
        timezone: config.timezone,
      })) {
        const auditRecord: ScheduledDigestAuditRecord = {
          id: createScheduledDigestAuditId(),
          created_at: new Date().toISOString(),
          timeslot,
          userid: user.userid,
          zentao_account: user.zentaoAccount,
          roles: [...user.roles],
          dry_run: values["dry-run"],
          ok: true,
          sent: false,
          skipped_reason: "already sent for this user and timeslot today",
        };
        writeScheduledDigestAudit(auditRecord);
        results.push({
          userid: user.userid,
          zentao_account: user.zentaoAccount,
          roles: user.roles,
          sent: false,
          skipped_reason: auditRecord.skipped_reason,
        });
        continue;
      }

      const roleDigests = await collectRoleDigests(client, config, user, timeslot);
      const message = renderUserDigestMessage(
        config,
        {
          userid: user.userid,
          zentaoAccount: user.zentaoAccount,
          roles: user.roles,
        },
        timeslot,
        roleDigests,
      );

      let wecomResponse: JsonObject | undefined;
      if (!values["dry-run"]) {
        wecomResponse = await new WecomClient().sendMarkdownToUsers([user.userid], message.markdown);
      }

      const auditRecord: ScheduledDigestAuditRecord = {
        id: createScheduledDigestAuditId(),
        created_at: new Date().toISOString(),
        timeslot,
        userid: user.userid,
        zentao_account: user.zentaoAccount,
        roles: [...user.roles],
        dry_run: values["dry-run"],
        ok: true,
        sent: !values["dry-run"],
        title: message.title,
        overview: message.overviewParts,
        risk_count: message.riskItems.length,
        todo_count: message.todoItems.length,
        links: message.links.map((item) => item.label),
        wecom_response: wecomResponse,
      };
      writeScheduledDigestAudit(auditRecord);

      results.push({
        userid: user.userid,
        zentao_account: user.zentaoAccount,
        roles: user.roles,
        sent: !values["dry-run"],
        title: message.title,
        markdown: message.markdown,
        overview: message.overviewParts,
        risk_count: message.riskItems.length,
        todo_count: message.todoItems.length,
      });
    } catch (error) {
      hasFailure = true;
      const errorMessage = error instanceof Error ? error.stack ?? error.message : String(error);
      const auditRecord: ScheduledDigestAuditRecord = {
        id: createScheduledDigestAuditId(),
        created_at: new Date().toISOString(),
        timeslot,
        userid: user.userid,
        zentao_account: user.zentaoAccount,
        roles: [...user.roles],
        dry_run: values["dry-run"],
        ok: false,
        sent: false,
        error: errorMessage,
      };
      writeScheduledDigestAudit(auditRecord);
      results.push({
        userid: user.userid,
        zentao_account: user.zentaoAccount,
        roles: user.roles,
        sent: false,
        error: errorMessage,
      });
    }
  }

  printJson({
    ok: !hasFailure,
    config: config.sourcePath,
    timeslot,
    dry_run: values["dry-run"],
    force: values.force,
    processed_users: filteredUsers.length,
    results,
  });

  if (hasFailure) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
