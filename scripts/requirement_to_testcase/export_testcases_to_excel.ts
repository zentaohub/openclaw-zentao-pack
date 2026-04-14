import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { readPayloadFile } from "./build_testcases_payload";
import { normalizePayload } from "./normalize_testcases";
import type { ExportResult } from "./types";

function getResourceRoot(): string {
  return path.resolve(__dirname, "../../../requirement-to-testcase");
}

function readHeaders(resourceRoot: string): string[] {
  const headersPath = path.join(resourceRoot, "templates", "testcase_headers.json");
  if (!existsSync(headersPath)) {
    throw new Error(`Header template not found: ${headersPath}`);
  }
  return JSON.parse(readFileSync(headersPath, "utf8")) as string[];
}

export async function exportTestcasesToExcel(payloadFile: string, outputDirOverride?: string): Promise<ExportResult> {
  const resourceRoot = getResourceRoot();
  const headers = readHeaders(resourceRoot);
  const payload = normalizePayload(readPayloadFile(payloadFile));
  const outputDir = path.resolve(outputDirOverride ?? payload.output_dir ?? path.join(resourceRoot, "output"));

  mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, `${payload.requirement_name}测试用例${payload.date}.xlsx`);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet((payload.sheet_name ?? "测试用例").slice(0, 31));

  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: header === "测试步骤" || header === "预期结果" || header === "前置条件" ? 28 : 20,
    style: {
      alignment: {
        vertical: "top",
        wrapText: true,
      },
    },
  }));

  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const item of payload.test_cases) {
    const row: Record<string, string> = {};
    for (const header of headers) {
      row[header] = item[header as keyof typeof item] ?? "无";
    }
    worksheet.addRow(row);
  }

  await workbook.xlsx.writeFile(outputFile);
  return {
    format: "excel",
    outputFile,
    caseCount: payload.test_cases.length,
    requirementName: payload.requirement_name,
  };
}
