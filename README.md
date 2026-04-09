# chatwork-mcp

> **Unofficial** MCP Server for Chatwork — Cloudflare Workers で動作します。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> [!WARNING]
> このプロジェクトは **[Chatwork株式会社](https://go.chatwork.com/)とは無関係の非公式ツール**です。
> 公式サポートは提供されません。APIの仕様変更により予告なく動作しなくなる場合があります。
> 自己責任でご使用ください。

---

## 概要

Claude Desktop から Chatwork の閲覧・送信ができる MCP サーバーです。

- **APIキーはサーバーに保存しません** — リクエスト時にヘッダーで送信するだけ
- **Cloudflare Workers 上で動作** — サーバー管理不要、無料枠で運用可能
- **3つのツール** — ルーム一覧 / メッセージ取得 / メッセージ送信

---

## 利用可能なツール

| ツール | 説明 |
|--------|------|
| `list_rooms` | 参加しているルーム一覧を取得 |
| `get_messages` | 指定ルームのメッセージを取得（未読 or 最新100件） |
| `send_message` | 指定ルームにメッセージを送信 |

---

## セットアップ

### 前提条件

- [Claude Desktop](https://claude.ai/download) がインストールされていること
- Chatwork アカウントと API トークン（取得方法は下記）

### 1. Chatwork APIトークンを取得

1. Chatwork にログイン
2. 右上のアイコン → **「サービス連携」** → **「API Token」**
3. 表示されたトークンをコピー

### 2. Claude Desktop の設定ファイルを編集

**設定ファイルの場所:**

| OS | パス |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

**以下を追加:**

```json
{
  "mcpServers": {
    "chatwork": {
      "url": "https://chatwork-mcp.daichi-dev.workers.dev/mcp",
      "headers": {
        "X-Chatwork-Token": "ここにChatwork APIトークンを貼る"
      }
    }
  }
}
```

### 3. Claude Desktop を再起動

---

## 使い方

```
Chatworkのルーム一覧を表示して
```

```
LBSグループのroom_idを教えて
```

```
room_id 123456789 の未読メッセージを確認して
```

```
room_id 123456789 に「お疲れ様です！」と送って
```

---

## セキュリティ

- APIトークンはリクエストヘッダーで送信されます（TLS/HTTPS 暗号化）
- サーバー側にトークンを保存・ログ出力・記録する処理は一切ありません
- 各自のトークンは自分のChatworkアカウントにのみアクセスできます
- ソースコードは完全公開です → [src/index.ts](./src/index.ts)

---

## 自分でデプロイする場合

本サーバーを自分の Cloudflare アカウントにデプロイすることもできます。

```bash
git clone https://github.com/daichi-dev/chatwork-mcp.git
cd chatwork-mcp
npm install
npx wrangler login
npx wrangler deploy
```

---

## 免責事項

- 本ツールは Chatwork 株式会社の公式製品・サービスではありません
- Chatwork API の利用は [Chatwork API 利用規約](https://go.chatwork.com/ja/terms/) に従ってください
- 本ツールの使用によって生じたいかなる損害についても、作者は責任を負いません
- API の仕様変更等により、予告なく機能しなくなる場合があります

---

## ライセンス

MIT License — 詳細は [LICENSE](./LICENSE) を参照
