import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { RunRequirementOptions } from "./types";

export async function parseRunOptions(): Promise<RunRequirementOptions> {
  const { values } = parseArgs({
    options: {
      "payload-file": { type: "string" },
      "input-text": { type: "string" },
      "input-file": { type: "string" },
      "input-url": { type: "string" },
      format: { type: "string", default: "excel" },
      "output-dir": { type: "string" },
      "callback-mode": { type: "boolean", default: false },
      "source-type": { type: "string", default: "unknown" },
    },
    allowPositionals: false,
  });

  const formatValue = values.format;
  const format = formatValue === "xmind" || formatValue === "both" ? formatValue : "excel";
  const outputDir = typeof values["output-dir"] === "string" ? path.resolve(values["output-dir"]) : undefined;
  const callbackMode = values["callback-mode"] ?? false;
  const sourceType = values["source-type"] === "bot" || values["source-type"] === "agent"
    ? values["source-type"]
    : "unknown";

  if (typeof values["payload-file"] === "string" && values["payload-file"].trim()) {
    const payloadFile = path.resolve(values["payload-file"]);
    if (!existsSync(payloadFile)) {
      throw new Error(`Payload file not found: ${payloadFile}`);
    }
    return { payloadFile, format, outputDir, callbackMode, sourceType };
  }

  if (typeof values["input-file"] === "string" && values["input-file"].trim()) {
    const inputFile = path.resolve(values["input-file"]);
    if (!existsSync(inputFile)) {
      throw new Error(`Input file not found: ${inputFile}`);
    }
    return { inputFile, format, outputDir, callbackMode, sourceType };
  }

  if (typeof values["input-url"] === "string" && values["input-url"].trim()) {
    return {
      inputUrl: values["input-url"].trim(),
      format,
      outputDir,
      callbackMode,
      sourceType,
    };
  }

  if (typeof values["input-text"] === "string" && values["input-text"].trim()) {
    return {
      inputText: values["input-text"].trim(),
      format,
      outputDir,
      callbackMode,
      sourceType,
    };
  }

  throw new Error("Missing --payload-file, --input-file, --input-url, or --input-text");
}
