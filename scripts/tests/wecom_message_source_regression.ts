import assert from "node:assert/strict";

import { detectWecomMessageSource } from "../shared/wecom_payload";

function main(): void {
  assert.equal(
    detectWecomMessageSource({
      FromUserName: "admin",
      ToUserName: "acme-agent",
      MsgType: "text",
      msgtype: "text",
      AgentID: "1000001",
      content: "有哪些模块",
      body: {
        MsgType: "text",
        msgtype: "text",
        content: "有哪些模块",
      },
    }),
    "agent",
    "hybrid self-built app payload should stay on agent chain",
  );

  assert.equal(
    detectWecomMessageSource({
      userid: "admin",
      msgtype: "text",
      content: "有哪些模块",
      body: {
        msgtype: "text",
        content: "有哪些模块",
      },
    }),
    "bot",
    "bot payload should stay on bot chain",
  );

  process.stdout.write("wecom message source regression passed\n");
}

main();
