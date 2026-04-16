export interface RequirementSource {
  sourceType: "text" | "file" | "url";
  sourceName: string;
  rawText: string;
  titleCandidate: string;
  warnings: string[];
  blockingWarnings?: string[];
}

export interface RunRequirementOptions {
  payloadFile?: string;
  inputText?: string;
  inputFile?: string;
  inputUrl?: string;
  format: "excel" | "xmind" | "both";
  outputDir?: string;
  callbackMode: boolean;
  sourceType: "bot" | "agent" | "unknown";
}

export interface StructuredTestcase {
  "用例ID": string;
  "模块": string;
  "关联需求点": string;
  "用例标题": string;
  "前置条件": string;
  "测试步骤": string;
  "测试数据": string;
  "预期结果": string;
  "优先级": string;
  "用例类型": string;
}

export interface TestcasePayload {
  requirement_name: string;
  date: string;
  output_dir?: string;
  sheet_name?: string;
  test_cases: StructuredTestcase[];
}

export interface ExportResult {
  format: "excel" | "xmind";
  outputFile: string;
  caseCount: number;
  requirementName: string;
}
