import fs from "node:fs";
import path from "node:path";

const configPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(process.cwd(), "config.json");
const targetUsers = process.argv.slice(3).filter(Boolean);

function readConfigText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractMatch(text, pattern, fieldName) {
  const match = text.match(pattern);
  const value = match?.[1]?.trim();
  if (!value) {
    throw new Error(`Missing ${fieldName} in ${configPath}`);
  }
  return value;
}

function extractWecomBlock(text) {
  const marker = '"wecom"';
  const start = text.indexOf(marker);
  if (start < 0) {
    throw new Error(`Missing wecom block in ${configPath}`);
  }

  const braceStart = text.indexOf("{", start);
  if (braceStart < 0) {
    throw new Error(`Invalid wecom block in ${configPath}`);
  }

  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(braceStart, index + 1);
      }
    }
  }

  throw new Error(`Unclosed wecom block in ${configPath}`);
}

function loadWecomConfig(filePath) {
  const text = readConfigText(filePath);
  const wecomBlock = extractWecomBlock(text);
  return {
    corpId: extractMatch(wecomBlock, /"corp_id"\s*:\s*"([^"]+)"/, "wecom.corp_id"),
    corpSecret: extractMatch(wecomBlock, /"corp_secret"\s*:\s*"([^"]+)"/, "wecom.corp_secret"),
    agentId: Number(extractMatch(wecomBlock, /"agent_id"\s*:\s*(\d+)/, "wecom.agent_id")),
    apiBaseUrl:
      extractMatch(wecomBlock, /"api_base_url"\s*:\s*"(https?:\/\/[^"]+)"/, "wecom.api_base_url").replace(/\/+$/, ""),
  };
}

async function getAccessToken({ apiBaseUrl, corpId, corpSecret }) {
  const url = new URL("/cgi-bin/gettoken", apiBaseUrl);
  url.searchParams.set("corpid", corpId);
  url.searchParams.set("corpsecret", corpSecret);

  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || !payload?.access_token) {
    throw new Error(`gettoken failed: ${JSON.stringify(payload)}`);
  }
  return payload.access_token;
}

async function sendTemplateCard({ apiBaseUrl, accessToken, agentId, userId }) {
  const url = new URL("/cgi-bin/message/send", apiBaseUrl);
  url.searchParams.set("access_token", accessToken);

  const body = {
    touser: userId,
    msgtype: "template_card",
    agentid: agentId,
    template_card: {
      card_type: "text_notice",
      source: {
        desc: "OpenClaw agent test",
        desc_color: 0,
      },
      main_title: {
        title: "Self-built app card test",
        desc: `Sent at ${new Date().toISOString()}`,
      },
      sub_title_text: "This message is used to verify template_card delivery for the self-built app path.",
      horizontal_content_list: [
        { keyname: "User", value: userId },
        { keyname: "Source", value: "OpenClaw Agent" },
        { keyname: "Card", value: "text_notice" },
      ],
      task_id: `openclaw-agent-card-test-${userId}-${Date.now()}`,
      jump_list: [
        {
          type: 1,
          title: "Open Zentao",
          url: "http://1.14.73.166",
        },
      ],
      card_action: {
        type: 1,
        url: "http://1.14.73.166",
      },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return {
    ok: response.ok && payload?.errcode === 0,
    response: payload,
  };
}

async function main() {
  const config = loadWecomConfig(configPath);
  const users = targetUsers.length > 0 ? targetUsers : ["xianmin", "lengleng"];
  const accessToken = await getAccessToken(config);
  const results = [];

  for (const userId of users) {
    const result = await sendTemplateCard({
      apiBaseUrl: config.apiBaseUrl,
      accessToken,
      agentId: config.agentId,
      userId,
    });
    results.push({ userId, ...result });
  }

  process.stdout.write(
    JSON.stringify(
      {
        configPath,
        users,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
