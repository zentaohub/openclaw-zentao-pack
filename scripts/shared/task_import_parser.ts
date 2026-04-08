import { extname } from "node:path";
import * as XLSX from "xlsx";

export interface ParsedImportTaskRow {
  rowNumber: number;
  name: string;
  assignedTo?: string;
  estimate?: number;
  pri?: number;
  desc?: string;
  estStarted?: string;
  deadline?: string;
  module?: number;
  story?: number;
  type?: string;
  keywords?: string;
}

const HEADER_ALIASES: Record<string, keyof ParsedImportTaskRow> = {
  "任务名称": "name",
  "名称": "name",
  name: "name",
  title: "name",
  "指派给": "assignedTo",
  "负责人": "assignedTo",
  assignedto: "assignedTo",
  assignee: "assignedTo",
  "预计工时": "estimate",
  estimate: "estimate",
  "工时": "estimate",
  "优先级": "pri",
  pri: "pri",
  priority: "pri",
  "描述": "desc",
  desc: "desc",
  description: "desc",
  "开始日期": "estStarted",
  "预计开始": "estStarted",
  eststarted: "estStarted",
  "截止日期": "deadline",
  deadline: "deadline",
  "模块id": "module",
  "模块": "module",
  module: "module",
  "需求id": "story",
  "需求": "story",
  story: "story",
  type: "type",
  "类型": "type",
  keywords: "keywords",
  "关键词": "keywords",
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）:_-]/g, "");
}

function toOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function toOptionalDateString(value: unknown): string | undefined {
  const normalized = toOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  const isoMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    return formatDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? 2000 + Number(slashMatch[3]) : Number(slashMatch[3]);
    return formatDateParts(year, Number(slashMatch[1]), Number(slashMatch[2]));
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function toOptionalNumber(value: unknown, fieldName: string, rowNumber: number): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`第 ${rowNumber} 行字段 ${fieldName} 不是有效数字`);
  }

  return numeric;
}

function toOptionalInteger(value: unknown, fieldName: string, rowNumber: number): number | undefined {
  const numeric = toOptionalNumber(value, fieldName, rowNumber);
  if (numeric === undefined) {
    return undefined;
  }

  if (numeric <= 0 || !Number.isInteger(numeric)) {
    throw new Error(`第 ${rowNumber} 行字段 ${fieldName} 必须是正整数`);
  }

  return numeric;
}

function parseSheetRows(workbook: XLSX.WorkBook): unknown[][] {
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("导入文件中没有可读取的工作表");
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
}

export function parseTaskImportFile(buffer: Buffer, filename: string): ParsedImportTaskRow[] {
  const extension = extname(filename).toLowerCase();
  const workbook = extension === ".csv"
    ? XLSX.read(buffer.toString("utf8"), {
        type: "string",
        raw: false,
      })
    : XLSX.read(buffer, {
        type: "buffer",
        raw: false,
      });
  const rows = parseSheetRows(workbook);
  if (rows.length <= 1) {
    throw new Error("导入文件没有有效数据行");
  }

  const headerRow = rows[0] ?? [];
  const mappedHeaders = headerRow.map((header) => HEADER_ALIASES[normalizeHeader(header)]);
  if (!mappedHeaders.includes("name")) {
    throw new Error(`导入文件缺少任务名称列，文件：${filename}`);
  }

  const parsedRows: ParsedImportTaskRow[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const sourceRow = rows[index] ?? [];
    const rowNumber = index + 1;
    const record: Partial<ParsedImportTaskRow> = { rowNumber };

    mappedHeaders.forEach((fieldName, columnIndex) => {
      if (!fieldName) {
        return;
      }

      const rawValue = sourceRow[columnIndex];
      switch (fieldName) {
        case "name":
        case "assignedTo":
        case "desc":
        case "type":
        case "keywords":
          record[fieldName] = toOptionalString(rawValue);
          break;
        case "estStarted":
        case "deadline":
          record[fieldName] = toOptionalDateString(rawValue);
          break;
        case "estimate":
        case "pri":
          record[fieldName] = toOptionalNumber(rawValue, fieldName, rowNumber);
          break;
        case "module":
        case "story":
          record[fieldName] = toOptionalInteger(rawValue, fieldName, rowNumber);
          break;
        default:
          break;
      }
    });

    const name = toOptionalString(record.name);
    if (!name) {
      const hasAnyValue = sourceRow.some((item) => toOptionalString(item));
      if (!hasAnyValue) {
        continue;
      }
      throw new Error(`第 ${rowNumber} 行缺少任务名称`);
    }

    parsedRows.push({
      rowNumber,
      name,
      assignedTo: toOptionalString(record.assignedTo),
      estimate: record.estimate,
      pri: record.pri,
      desc: toOptionalString(record.desc),
      estStarted: record.estStarted,
      deadline: record.deadline,
      module: record.module,
      story: record.story,
      type: toOptionalString(record.type),
      keywords: toOptionalString(record.keywords),
    });
  }

  if (parsedRows.length === 0) {
    throw new Error(`导入文件没有可创建的任务数据，文件：${filename}${extname(filename) ? "" : ""}`);
  }

  return parsedRows;
}
