import { basename, extname } from "node:path";

export interface DownloadedFile {
  buffer: Buffer;
  filename: string;
  contentType: string | null;
  sourceUrl: string;
}

function ensureSupportedUrl(sourceUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch (error) {
    throw new Error(`Invalid source URL: ${(error as Error).message}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }

  return parsed;
}

function inferFilename(parsedUrl: URL, contentType: string | null): string {
  const fromPath = basename(parsedUrl.pathname || "").trim();
  if (fromPath && extname(fromPath)) {
    return fromPath;
  }

  if (contentType?.includes("csv")) {
    return "import.csv";
  }

  if (contentType?.includes("sheet") || contentType?.includes("excel")) {
    return "import.xlsx";
  }

  return "import.xlsx";
}

export async function downloadFile(sourceUrl: string): Promise<DownloadedFile> {
  const parsedUrl = ensureSupportedUrl(sourceUrl);
  const response = await fetch(parsedUrl, {
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to download source file: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type");

  if (buffer.length === 0) {
    throw new Error("Downloaded source file is empty");
  }

  return {
    buffer,
    filename: inferFilename(parsedUrl, contentType),
    contentType,
    sourceUrl: parsedUrl.toString(),
  };
}
