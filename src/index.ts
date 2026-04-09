// cw-mcp — Chatwork MCP Server for Cloudflare Workers
// 公式 chatwork/chatwork-mcp-server の Cloudflare Workers 移植版
// APIキーはヘッダー(X-Chatwork-Token)またはクエリパラメータ(?token=)で受け取る（サーバーに保存しない）

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
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: Record<string, string>
): Promise<unknown> {
  const res = await fetch(`${CHATWORK_API}${path}`, {
    method,
    headers: {
      "X-ChatWorkToken": token,
      ...(body && method !== "GET"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body:
      body && method !== "GET"
        ? new URLSearchParams(body).toString()
        : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chatwork API error ${res.status}: ${text}`);
  }

  const text = await res.text();
  if (!text) return {};
  return JSON.parse(text);
}

// ============================================================
// ツール定義
// ============================================================

const TOOLS = [
  // ── 自分 ──────────────────────────────────────────────────
  {
    name: "get_me",
    description: "自分自身の情報を取得します。",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_my_status",
    description: "自分の未読数、自分宛ての未読の数、未完了タスク数を取得します。",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_my_tasks",
    description: "自分のタスク一覧を最大100件まで取得します。",
    inputSchema: {
      type: "object",
      properties: {
        assigned_by_account_id: {
          type: "string",
          description: "タスクを割り当てたアカウントIDで絞り込み（任意）",
        },
        status: {
          type: "string",
          enum: ["open", "done"],
          description: "タスクのステータスで絞り込み（任意）",
        },
      },
      required: [],
    },
  },
  {
    name: "list_contacts",
    description: "自分のコンタクト一覧を取得します。",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // ── チャットルーム ──────────────────────────────────────────
  {
    name: "list_rooms",
    description: "参加しているチャットルームの一覧を取得します。",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_room",
    description: "新しいグループチャットを作成します。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "グループチャット名（必須）" },
        members_admin_ids: {
          type: "string",
          description: "管理者権限のアカウントID（カンマ区切り、必須）例: '123,456'",
        },
        description: {
          type: "string",
          description: "チャットの概要（任意）",
        },
        icon_preset: {
          type: "string",
          description: "アイコンの種類（任意）: group/check/document/meeting/event/project/business/study/security/star/idea/heart/magcup/beer/music/sports/travel",
        },
        members_member_ids: {
          type: "string",
          description: "メンバー権限のアカウントID（カンマ区切り、任意）",
        },
        members_readonly_ids: {
          type: "string",
          description: "閲覧のみ権限のアカウントID（カンマ区切り、任意）",
        },
      },
      required: ["name", "members_admin_ids"],
    },
  },
  {
    name: "get_room",
    description: "チャットの情報（名前・アイコン・種類など）を取得します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
      },
      required: ["room_id"],
    },
  },
  {
    name: "update_room",
    description: "チャットの情報（名前・アイコン・説明など）を変更します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        name: { type: "string", description: "変更後のグループチャット名（任意）" },
        description: { type: "string", description: "変更後の概要（任意）" },
        icon_preset: { type: "string", description: "変更後のアイコン種類（任意）" },
      },
      required: ["room_id"],
    },
  },
  {
    name: "delete_or_leave_room",
    description:
      "グループチャットを退席または削除します。退席すると自分のタスク・ファイルが削除されます。削除は元に戻せません。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        action_type: {
          type: "string",
          enum: ["leave", "delete"],
          description: "'leave'=退席, 'delete'=削除",
        },
      },
      required: ["room_id", "action_type"],
    },
  },

  // ── メンバー ──────────────────────────────────────────────
  {
    name: "list_room_members",
    description: "チャットのメンバー一覧を取得します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
      },
      required: ["room_id"],
    },
  },
  {
    name: "update_room_members",
    description: "チャットのメンバーを一括で変更します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        members_admin_ids: {
          type: "string",
          description: "管理者権限のアカウントID（カンマ区切り、必須）",
        },
        members_member_ids: {
          type: "string",
          description: "メンバー権限のアカウントID（カンマ区切り、任意）",
        },
        members_readonly_ids: {
          type: "string",
          description: "閲覧のみ権限のアカウントID（カンマ区切り、任意）",
        },
      },
      required: ["room_id", "members_admin_ids"],
    },
  },

  // ── メッセージ ─────────────────────────────────────────────
  {
    name: "list_room_messages",
    description: "チャットのメッセージ一覧を最大100件まで取得します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        force: {
          type: "boolean",
          description: "true=既読も含む最新100件を取得、false=未読のみ（デフォルト: false）",
        },
      },
      required: ["room_id"],
    },
  },
  {
    name: "post_room_message",
    description: "チャットに新しいメッセージを投稿します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        body: { type: "string", description: "メッセージ本文" },
        self_unread: {
          type: "boolean",
          description: "true=自分が投稿したメッセージを未読にする（デフォルト: false）",
        },
      },
      required: ["room_id", "body"],
    },
  },
  {
    name: "read_room_messages",
    description: "チャットのメッセージを既読にします。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        message_id: {
          type: "string",
          description: "既読にする最後のメッセージID（省略時は最新まで全て既読）",
        },
      },
      required: ["room_id"],
    },
  },
  {
    name: "unread_room_message",
    description: "チャットのメッセージを未読にします。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        message_id: { type: "string", description: "未読にするメッセージID" },
      },
      required: ["room_id", "message_id"],
    },
  },
  {
    name: "get_room_message",
    description: "チャットの特定メッセージを取得します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        message_id: { type: "string", description: "メッセージID" },
      },
      required: ["room_id", "message_id"],
    },
  },
  {
    name: "update_room_message",
    description: "チャットのメッセージを更新（編集）します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        message_id: { type: "string", description: "メッセージID" },
        body: { type: "string", description: "変更後のメッセージ本文" },
      },
      required: ["room_id", "message_id", "body"],
    },
  },
  {
    name: "delete_room_message",
    description: "チャットのメッセージを削除します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        message_id: { type: "string", description: "削除するメッセージID" },
      },
      required: ["room_id", "message_id"],
    },
  },

  // ── タスク ────────────────────────────────────────────────
  {
    name: "list_room_tasks",
    description: "チャットのタスク一覧を最大100件まで取得します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        account_id: {
          type: "string",
          description: "担当者のアカウントIDで絞り込み（任意）",
        },
        assigned_by_account_id: {
          type: "string",
          description: "タスクを割り当てたアカウントIDで絞り込み（任意）",
        },
        status: {
          type: "string",
          enum: ["open", "done"],
          description: "タスクのステータスで絞り込み（任意）",
        },
      },
      required: ["room_id"],
    },
  },
  {
    name: "create_room_task",
    description: "チャットに新しいタスクを追加します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        body: { type: "string", description: "タスクの内容" },
        to_ids: {
          type: "string",
          description: "担当者のアカウントID（カンマ区切り）例: '123,456'",
        },
        limit: {
          type: "string",
          description: "期限のUnixタイムスタンプ（任意）",
        },
        limit_type: {
          type: "string",
          enum: ["none", "date", "time"],
          description: "期限の種類（任意）: none=期限なし, date=日付, time=日時",
        },
      },
      required: ["room_id", "body", "to_ids"],
    },
  },
  {
    name: "get_room_task",
    description: "チャットの特定タスクの情報を取得します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        task_id: { type: "string", description: "タスクID" },
      },
      required: ["room_id", "task_id"],
    },
  },
  {
    name: "update_room_task_status",
    description: "チャットのタスクの完了状態を変更します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        task_id: { type: "string", description: "タスクID" },
        body: {
          type: "string",
          enum: ["open", "done"],
          description: "変更後のステータス: 'open'=未完了, 'done'=完了",
        },
      },
      required: ["room_id", "task_id", "body"],
    },
  },

  // ── ファイル ─────────────────────────────────────────────
  {
    name: "list_room_files",
    description: "チャットのファイル一覧を最大100件まで取得します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        account_id: {
          type: "string",
          description: "アップロードしたアカウントIDで絞り込み（任意）",
        },
      },
      required: ["room_id"],
    },
  },
  {
    name: "get_room_file",
    description: "チャットのファイルの情報を取得します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        file_id: { type: "string", description: "ファイルID" },
        create_download_url: {
          type: "boolean",
          description: "true=30分有効なダウンロードURLを生成する（任意）",
        },
      },
      required: ["room_id", "file_id"],
    },
  },

  // ── 招待リンク ───────────────────────────────────────────
  {
    name: "get_room_link",
    description: "チャットへの招待リンクを取得します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
      },
      required: ["room_id"],
    },
  },
  {
    name: "create_room_link",
    description: "チャットへの招待リンクを作成します。既に作成済みの場合は400エラーになります。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        code: { type: "string", description: "リンクのパス部分（任意、省略時ランダム生成）" },
        description: { type: "string", description: "リンクの説明文（任意）" },
        need_acceptance: {
          type: "boolean",
          description: "true=管理者の承認が必要（任意）",
        },
      },
      required: ["room_id"],
    },
  },
  {
    name: "update_room_link",
    description: "チャットへの招待リンクを変更します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
        code: { type: "string", description: "変更後のリンクパス（任意）" },
        description: { type: "string", description: "変更後の説明文（任意）" },
        need_acceptance: {
          type: "boolean",
          description: "true=管理者の承認が必要（任意）",
        },
      },
      required: ["room_id"],
    },
  },
  {
    name: "delete_room_link",
    description: "チャットへの招待リンクを削除します。",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "ルームID" },
      },
      required: ["room_id"],
    },
  },

  // ── コンタクト申請 ────────────────────────────────────────
  {
    name: "list_incoming_requests",
    description: "自分へのコンタクト承認依頼一覧を最大100件まで取得します。",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "accept_incoming_request",
    description: "自分へのコンタクト承認依頼を承認します。",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string", description: "承認するリクエストID" },
      },
      required: ["request_id"],
    },
  },
  {
    name: "reject_incoming_request",
    description: "自分へのコンタクト承認依頼を拒否します。",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string", description: "拒否するリクエストID" },
      },
      required: ["request_id"],
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
  const s = (key: string) => String(args[key] ?? "");
  const b = (key: string) => (args[key] === true ? "1" : "0");

  // オプショナルパラメータのみ追加するヘルパー
  const optBody = (
    keys: Array<[string, string?]>
  ): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const [argsKey, apiKey] of keys) {
      if (args[argsKey] !== undefined && args[argsKey] !== "") {
        result[apiKey ?? argsKey] = String(args[argsKey]);
      }
    }
    return result;
  };

  let data: unknown;

  switch (name) {
    // ── 自分 ──
    case "get_me":
      data = await callChatworkAPI(token, "/me");
      break;

    case "get_my_status":
      data = await callChatworkAPI(token, "/my/status");
      break;

    case "list_my_tasks": {
      const params = new URLSearchParams();
      if (args.assigned_by_account_id) params.set("assigned_by_account_id", s("assigned_by_account_id"));
      if (args.status) params.set("status", s("status"));
      const qs = params.toString() ? `?${params.toString()}` : "";
      data = await callChatworkAPI(token, `/my/tasks${qs}`);
      break;
    }

    case "list_contacts":
      data = await callChatworkAPI(token, "/contacts");
      break;

    // ── チャットルーム ──
    case "list_rooms":
      data = await callChatworkAPI(token, "/rooms");
      break;

    case "create_room": {
      const body: Record<string, string> = {
        name: s("name"),
        members_admin_ids: s("members_admin_ids"),
      };
      Object.assign(body, optBody([
        ["description"],
        ["icon_preset"],
        ["members_member_ids"],
        ["members_readonly_ids"],
      ]));
      data = await callChatworkAPI(token, "/rooms", "POST", body);
      break;
    }

    case "get_room":
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}`);
      break;

    case "update_room": {
      const body = optBody([
        ["name"],
        ["description"],
        ["icon_preset"],
      ]);
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}`, "PUT", body);
      break;
    }

    case "delete_or_leave_room":
      data = await callChatworkAPI(
        token,
        `/rooms/${s("room_id")}`,
        "DELETE",
        { action_type: s("action_type") }
      );
      break;

    // ── メンバー ──
    case "list_room_members":
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}/members`);
      break;

    case "update_room_members": {
      const body: Record<string, string> = {
        members_admin_ids: s("members_admin_ids"),
      };
      Object.assign(body, optBody([
        ["members_member_ids"],
        ["members_readonly_ids"],
      ]));
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}/members`, "PUT", body);
      break;
    }

    // ── メッセージ ──
    case "list_room_messages": {
      const force = args.force === true ? "1" : "0";
      data = await callChatworkAPI(
        token,
        `/rooms/${s("room_id")}/messages?force=${force}`
      );
      break;
    }

    case "post_room_message": {
      const body: Record<string, string> = { body: s("body") };
      if (args.self_unread !== undefined) body.self_unread = b("self_unread");
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}/messages`, "POST", body);
      break;
    }

    case "read_room_messages": {
      const body = optBody([["message_id"]]);
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}/messages/read`, "PUT", body);
      break;
    }

    case "unread_room_message":
      data = await callChatworkAPI(
        token,
        `/rooms/${s("room_id")}/messages/unread`,
        "PUT",
        { message_id: s("message_id") }
      );
      break;

    case "get_room_message":
      data = await callChatworkAPI(
        token,
        `/rooms/${s("room_id")}/messages/${s("message_id")}`
      );
      break;

    case "update_room_message":
      data = await callChatworkAPI(
        token,
        `/rooms/${s("room_id")}/messages/${s("message_id")}`,
        "PUT",
        { body: s("body") }
      );
      break;

    case "delete_room_message":
      data = await callChatworkAPI(
        token,
        `/rooms/${s("room_id")}/messages/${s("message_id")}`,
        "DELETE"
      );
      break;

    // ── タスク ──
    case "list_room_tasks": {
      const params = new URLSearchParams();
      if (args.account_id) params.set("account_id", s("account_id"));
      if (args.assigned_by_account_id) params.set("assigned_by_account_id", s("assigned_by_account_id"));
      if (args.status) params.set("status", s("status"));
      const qs = params.toString() ? `?${params.toString()}` : "";
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}/tasks${qs}`);
      break;
    }

    case "create_room_task": {
      const body: Record<string, string> = {
        body: s("body"),
        to_ids: s("to_ids"),
      };
      Object.assign(body, optBody([["limit"], ["limit_type"]]));
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}/tasks`, "POST", body);
      break;
    }

    case "get_room_task":
      data = await callChatworkAPI(
        token,
        `/rooms/${s("room_id")}/tasks/${s("task_id")}`
      );
      break;

    case "update_room_task_status":
      data = await callChatworkAPI(
        token,
        `/rooms/${s("room_id")}/tasks/${s("task_id")}/status`,
        "PUT",
        { body: s("body") }
      );
      break;

    // ── ファイル ──
    case "list_room_files": {
      const params = new URLSearchParams();
      if (args.account_id) params.set("account_id", s("account_id"));
      const qs = params.toString() ? `?${params.toString()}` : "";
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}/files${qs}`);
      break;
    }

    case "get_room_file": {
      const params = new URLSearchParams();
      if (args.create_download_url) params.set("create_download_url", "1");
      const qs = params.toString() ? `?${params.toString()}` : "";
      data = await callChatworkAPI(
        token,
        `/rooms/${s("room_id")}/files/${s("file_id")}${qs}`
      );
      break;
    }

    // ── 招待リンク ──
    case "get_room_link":
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}/link`);
      break;

    case "create_room_link": {
      const body = optBody([["code"], ["description"], ["need_acceptance"]]);
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}/link`, "POST", body);
      break;
    }

    case "update_room_link": {
      const body = optBody([["code"], ["description"], ["need_acceptance"]]);
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}/link`, "PUT", body);
      break;
    }

    case "delete_room_link":
      data = await callChatworkAPI(token, `/rooms/${s("room_id")}/link`, "DELETE");
      break;

    // ── コンタクト申請 ──
    case "list_incoming_requests":
      data = await callChatworkAPI(token, "/incoming_requests");
      break;

    case "accept_incoming_request":
      data = await callChatworkAPI(
        token,
        `/incoming_requests/${s("request_id")}`,
        "PUT"
      );
      break;

    case "reject_incoming_request":
      data = await callChatworkAPI(
        token,
        `/incoming_requests/${s("request_id")}`,
        "DELETE"
      );
      break;

    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return JSON.stringify(data, null, 2);
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
          serverInfo: { name: "cw-mcp", version: "1.1.0" },
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

    // ヘルスチェック
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          name: "cw-mcp",
          version: "1.1.0",
          description:
            "Chatwork MCP Server (unofficial) — ヘッダー X-Chatwork-Token またはクエリパラメータ ?token= にAPIキーを設定してください",
          tools: TOOLS.length,
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // MCPエンドポイント以外
    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
    }

    // APIキー取得: ヘッダー優先、なければクエリパラメータ
    const token =
      request.headers.get("X-Chatwork-Token") ||
      url.searchParams.get("token");

    // GET /mcp → SSE接続確認（claude.ai Web版がここで疎通チェックする）
    if (request.method === "GET") {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      writer.write(encoder.encode("event: endpoint\ndata: /mcp\n\n"));
      writer.close();
      return new Response(readable, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: CORS_HEADERS,
      });
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

    // notifications/* は204を返す
    if (rpcRequest.method?.startsWith("notifications/")) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // initialize はトークンなしでも応答する
    if (rpcRequest.method === "initialize" || rpcRequest.method === "ping") {
      const response = await handleMcpRequest(token || "", rpcRequest);
      return jsonResponse(response);
    }

    // それ以外はAPIキー必須
    if (!token) {
      return jsonResponse(
        {
          jsonrpc: "2.0",
          id: rpcRequest.id,
          error: {
            code: -32600,
            message:
              "APIキーが必要です。URLに ?token=YOUR_API_KEY を追加するか、X-Chatwork-Token ヘッダーを設定してください。",
          },
        },
        401
      );
    }

    const response = await handleMcpRequest(token, rpcRequest);
    return jsonResponse(response);
  },
};
