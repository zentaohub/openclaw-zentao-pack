import { parseArgs } from "node:util";
import { printJson, ZentaoClient } from "../shared/zentao_client";
import { extractArrayObjects, summarizeList } from "./_query_utils";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      userid: { type: "string" },
    },
    allowPositionals: false,
  });
  const client = new ZentaoClient({ userid: values.userid });
  const projectData = await client.getWebJsonViewData('/project-browse-all-all-0.json');
  const executionData = await client.getWebJsonViewData('/execution-all.json');
  const projects = extractArrayObjects(projectData.projectStats);
  const executions = extractArrayObjects(executionData.executionStats);

  printJson({
    ok: true,
    type: 'delivery-overview',
    project_count: projects.length,
    execution_count: executions.length,
    projects: summarizeList(projects, ['id', 'name', 'status', 'begin', 'end', 'hasProduct', 'parent']),
    executions: summarizeList(executions, ['id', 'name', 'project', 'status', 'begin', 'end', 'type', 'hasProduct']),
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

