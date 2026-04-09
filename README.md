# chatwork-mcp (Cloudflare Workers版)

> **非公式・実験的運用** — Chatwork公式MCPサーバーのCloudflareWorkers移植版です。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> [!WARNING]
> このプロジェクトは **[Chatwork株式会社](https://go.chatwork.com/)とは無関係の非公式ツール**です。
> 公式サポートは提供されません。APIの仕様変更により予告なく動作しなくなる場合があります。
> 自己責任でご使用ください。

---

## このリポジトリについて

Chatwork公式の [chatwork/chatwork-mcp-server](https://github.com/chatwork/chatwork-mcp-server) はローカル実行（stdio）方式のため、**claude.ai Web版のカスタムMCP連携に対応していません**。

このリポジトリは、**LBSコミュニティメンバーが claude.ai から直接Chatworkを使えるよう**、Cloudflare Workers上にリモートMCPサーバーとして構築したものです。インストール不要でURLを登録するだけで使えます。

### 公式版との違い

| 項目 | 公式版 | このリポジトリ |
|------|--------|--------------|
| 実行方式 | ローカル（npx） | Cloudflare Workers（リモート） |
| claude.ai対応 | ❌ | ✅ |
| Claude Desktop対応 | ✅ | ✅ |
| インストール | 必要 | 不要（URLだけ） |
| APIキー管理 | 環境変数 | URLパラメータ or ヘッダー |

---

## 概要

- **APIキーはサーバーに保存しません** — URLまたはヘッダーで毎回送信するだけ
- **Cloudflare Workers 上で動作** — サーバー管理不要、無料枠で運用可能

---

## 利用可能なツール

| ツール | 説明 |
|--------|------|
| `list_rooms` | 参加しているルーム一覧を取得 |
| `get_messages` | 指定ルームのメッセージを取得（未読 or 最新100件） |
| `send_message` | 指定ルームにメッセージを送信 |

> ツールは順次拡充予定です。

---

## セットアップ

### 前提条件

- Claude Desktop または claude.ai（Proプラン）
- Chatwork アカウントと API トークン

### 1. Chatwork APIトークンを取得

1. Chatwork にログイン
2. 右上のアイコン → **「サービス連携」** → **「API Token」**
3. 表示されたトークンをコピー

---

### 方法 A: claude.ai Web版（カスタムMCP） ← **LBSメンバーはこちら**

1. claude.ai → 左メニュー **「Settings」→「Integrations」→「Add custom integration」**
2. 以下のURLを入力（`YOUR_TOKEN` を実際のAPIトークンに置き換える）

```
https://chatwork-mcp.daichi-dev.workers.dev/mcp?token=YOUR_TOKEN
```

3. 「Connect」をクリック

> [!CAUTION]
> URLにAPIトークンが含まれます。このURLを**他人に共有しないよう**注意してください。

---

### 方法 B: Claude Desktop（設定ファイル）

設定ファイルの場所:

| OS | パス |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

以下を追加:

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

Claude Desktop を再起動すれば完了です。

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

- APIトークンはリクエスト時のみ使用（TLS/HTTPS 暗号化済み）
- サーバー側にトークンを保存・ログ出力しません
- ソースコードは完全公開 → [src/index.ts](./src/index.ts)

---

## 自分でデプロイする場合

```bash
git clone https://github.com/icloudaichi/chatwork-mcp.git
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
- このサーバーは実験的な運用であり、予告なく停止・変更する場合があります

---

## Related

- [chatwork/chatwork-mcp-server](https://github.com/chatwork/chatwork-mcp-server) — Chatwork公式MCPサーバー（ローカル実行版）
- [Chatwork API Documentation](https://developer.chatwork.com/)

---

## ライセンス

MIT License — 詳細は [LICENSE](./LICENSE) を参照
