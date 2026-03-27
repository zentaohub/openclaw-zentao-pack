import type { JsonObject, JsonValue } from "../shared/zentao_client";

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractArrayObjects(value: JsonValue | undefined): JsonObject[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isJsonObject);
}

export function extractRecordValues(value: JsonValue | undefined): JsonObject[] {
  if (!isJsonObject(value)) {
    return [];
  }
  return Object.values(value).filter(isJsonObject);
}

export function summarizeList(items: JsonObject[], fields: string[]): JsonObject[] {
  return items.map((item) => {
    const summary: JsonObject = {};
    for (const field of fields) {
      const fieldValue = item[field];
      if (fieldValue !== undefined) {
        summary[field] = fieldValue;
      }
    }
    summary.raw = item;
    return summary;
  });
}
