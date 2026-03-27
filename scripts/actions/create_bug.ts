import { parseArgs } from "node:util";
import { printJson, type JsonObject, ZentaoClient } from "../shared/zentao_client";

function requiredNumber(value: string | undefined, optionName: string): number {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Option --${optionName} must be a valid positive number`);
  return parsed;
}

function optionalNumber(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Option --${optionName} must be a valid number`);
  return parsed;
}

function requiredString(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`Missing required option --${optionName}`);
  return value;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split('||').map((item) => item.trim()).filter(Boolean);
}

function parseBuilds(value: string | undefined): string[] {
  if (!value) throw new Error('Missing required option --builds');
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      product: { type: 'string' },
      branch: { type: 'string' },
      module: { type: 'string' },
      project: { type: 'string' },
      execution: { type: 'string' },
      story: { type: 'string' },
      task: { type: 'string' },
      case: { type: 'string' },
      'case-version': { type: 'string' },
      run: { type: 'string' },
      testtask: { type: 'string' },
      title: { type: 'string' },
      builds: { type: 'string' },
      'assigned-to': { type: 'string' },
      severity: { type: 'string' },
      pri: { type: 'string' },
      type: { type: 'string', default: 'codeerror' },
      steps: { type: 'string', default: '' },
      keywords: { type: 'string' },
      deadline: { type: 'string' },
      userid: { type: 'string' },
    },
    allowPositionals: false,
  });

  const payload: JsonObject = {
    product: requiredNumber(values.product, 'product'),
    title: requiredString(values.title, 'title'),
    openedBuild: parseBuilds(values.builds),
    type: values.type ?? 'codeerror',
    assignedTo: values['assigned-to'] ?? 'admin',
    steps: values.steps ?? '',
  };

  if (values.branch !== undefined) payload.branch = values.branch;
  const module = optionalNumber(values.module, 'module');
  if (module !== undefined) payload.module = module;
  const project = optionalNumber(values.project, 'project');
  if (project !== undefined) payload.project = project;
  const execution = optionalNumber(values.execution, 'execution');
  if (execution !== undefined) payload.execution = execution;
  const story = optionalNumber(values.story, 'story');
  if (story !== undefined) payload.story = story;
  const task = optionalNumber(values.task, 'task');
  if (task !== undefined) payload.task = task;
  const caseId = optionalNumber(values.case, 'case');
  if (caseId !== undefined) payload.case = caseId;
  const caseVersion = optionalNumber(values['case-version'], 'case-version');
  if (caseVersion !== undefined) payload.caseVersion = caseVersion;
  const run = optionalNumber(values.run, 'run');
  if (run !== undefined) payload.run = run;
  const testtask = optionalNumber(values.testtask, 'testtask');
  if (testtask !== undefined) payload.testtask = testtask;
  const severity = optionalNumber(values.severity, 'severity');
  if (severity !== undefined) payload.severity = severity;
  const pri = optionalNumber(values.pri, 'pri');
  if (pri !== undefined) payload.pri = pri;
  if (values.keywords !== undefined) payload.keywords = values.keywords;
  if (values.deadline !== undefined) payload.deadline = values.deadline;

  const client = new ZentaoClient({ userid: values.userid });
  await client.login(false);
  const result = await client.createBug(payload);
  printJson(result);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});
