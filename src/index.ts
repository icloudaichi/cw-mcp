// Chatwork MCP Server for Cloudflare Workers
// MCPプロトコル（Streamable HTTP）を手動実装
// APIキーはリクエストヘッダー X-Chatwork-Token で受け取る（サーバーに保存しない）

const CHATWORK_API = "https://api.chatwork.com/v2";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ============================================================
// Chatwork API ヘルパー
// ============================================================

async function callChatworkAPI(
  token: string,
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, string>
): Promise<unknown> {
  const res = await fetch(`${CHATWORK_API}${path}`, {
    method,
    headers: {
      "X-ChatWorkToken": token,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chatwork API error ${res.status}: ${text}`);
  }

  return res.json();
}

// ============================================================
// ツール定義
// ============================================================

const TOOLS = [
  {
    name: "list_rooms",
    description:
      "参加しているChatworkのルーム（グループチャット・DM）一覧を取得します。room_id、名前、種別、未読数などが含まれます。",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_messages",
    description:
      "指定したルームのメッセージを取得します。force=trueで既読含む最新100件、falseで未読のみ取得します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: {
          type: "string",
          description: "メッセージを取得するルームのID（list_roomsで確認できます）",
        },
        force: {
          type: "boolean",
          description:
            "true=最新100件を強制取得、false=未読メッセージのみ取得（デフォルト: false）",
        },
      },
      required: ["room_id"],
    },
  },
  {
    name: "send_message",
    description: "指定したルームにメッセージを送信します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: {
          type: "string",
          description: "送信先ルームのID（list_roomsで確認できます）",
        },
        body: {
          type: "string",
          description: "送信するメッセージ本文（Chatworkマークアップ記法が使えます）",
        },
      },
      required: ["room_id", "body"],
    },
  },
];

// ============================================================
// ツール実行
// ============================================================

async function handleToolCall(
  token: string,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "list_rooms": {
      const data = await callChatworkAPI(token, "/rooms");
      return JSON.stringify(data, null, 2);
    }

    case "get_messages": {
      const roomId = args.room_id as string;
      const force = args.force === true ? 1 : 0;
      const data = await callChatworkAPI(
        token,
        `/rooms/${roomId}/messages?force=${force}`
      );
      return JSON.stringify(data, null, 2);
    }

    case "send_message": {
      const roomId = args.room_id as string;
      const body = args.body as string;
      const data = await callChatworkAPI(
        token,
        `/rooms/${roomId}/messages`,
        "POST",
        { body }
      );
      return JSON.stringify(data, null, 2);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================================================
// MCPプロトコル処理
// ============================================================

async function handleMcpRequest(
  token: string,
  rpcRequest: JsonRpcRequest
): Promise<JsonRpcResponse> {
  let result: unknown;
  let error: { code: number; message: string } | undefined;

  try {
    switch (rpcRequest.method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "chatwork-mcp", version: "1.0.0" },
        };
        break;

      case "ping":
        result = {};
        break;

      case "tools/list":
        result = { tools: TOOLS };
        break;

      case "tools/call": {
        const params = rpcRequest.params as {
          name: string;
          arguments?: Record<string, unknown>;
        };
        const content = await handleToolCall(
          token,
          params.name,
          params.arguments || {}
        );
        result = {
          content: [{ type: "text", text: content }],
          isError: false,
        };
        break;
      }

      default:
        error = {
          code: -32601,
          message: `Method not found: ${rpcRequest.method}`,
        };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    error = { code: -32603, message: msg };
  }

  return {
    jsonrpc: "2.0",
    id: rpcRequest.id,
    ...(error ? { error } : { result }),
  };
}

// ============================================================
// Cloudflare Workers エントリーポイント
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-Chatwork-Token, Mcp-Session-Id, Authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    // CORS プリフライト
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ヘルスチェック用
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          name: "chatwork-mcp",
          version: "1.0.0",
          description:
            "Chatwork MCP Server - X-Chatwork-Token ヘッダーにAPIキーを設定してください",
        }),
        {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // MCPエンドポイント
    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    // APIキー確認
    const token = request.headers.get("X-Chatwork-Token");
    if (!token) {
      return jsonResponse(
        {
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message:
              "X-Chatwork-Token ヘッダーが必要です。ChatworkのAPIキーを設定してください。",
          },
        },
        401
      );
    }

    // JSONパース
    let rpcRequest: JsonRpcRequest;
    try {
      rpcRequest = (await request.json()) as JsonRpcRequest;
    } catch {
      return jsonResponse(
        { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } },
        400
      );
    }

    // notifications/* は204を返す（レスポンス不要）
    if (rpcRequest.method?.startsWith("notifications/")) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const response = await handleMcpRequest(token, rpcRequest);
    return jsonResponse(response);
  },
};
