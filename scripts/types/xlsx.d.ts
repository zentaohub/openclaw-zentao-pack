declare module "xlsx" {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  }

  export const utils: {
    sheet_to_json(sheet: unknown, options?: Record<string, unknown>): unknown[];
  };

  export function read(data: unknown, options?: Record<string, unknown>): WorkBook;
}
