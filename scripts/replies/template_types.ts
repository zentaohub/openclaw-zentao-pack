import type { JsonObject } from "../shared/zentao_client";
import type { WecomMessageSource } from "../shared/wecom_payload";

export interface ReplyRenderContext {
  intent: string;
  script: string;
  userid: string;
  sourceType: WecomMessageSource;
  routeArgs: Record<string, string>;
  result: JsonObject;
}

export interface ReplyTemplate {
  name: string;
  render(context: ReplyRenderContext): string;
}
