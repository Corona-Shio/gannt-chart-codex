# Anime Production Scheduler (MVP)

アニメ制作チーム向けの `テーブル + ガントチャート` 同期型スケジューラです。

## Stack

- Next.js (App Router) + TypeScript
- Supabase (Auth / PostgreSQL / Realtime / RLS)

## セットアップ

1. 依存関係をインストール

```bash
npm install
```

2. 環境変数を設定

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. Supabaseへマイグレーション適用

- `supabase/migrations/0001_init.sql` を実行

4. 起動

```bash
npm run dev
```

## 実装済み機能

- 認証: Email OTPログイン
- タスクCRUD API
- テーブル + ガント同一Y軸表示
- チャンネルグループ表示 / ソート / フィルタ
- ガント空白ドラッグで新規タスク作成
- ガントバーのドラッグ移動 / 左右リサイズ
- 公開日マーカー表示（チャンネル + 脚本番号）
- 公開日登録フォーム
- リアルタイム購読（`tasks`, `release_dates`）
- マスタ管理（チャンネル / タスク種 / 担当者）
- RLSロール (`admin`, `editor`, `viewer`)
- 将来支払い機能向けの拡張テーブル定義

## API

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `GET /api/release-dates`
- `POST /api/release-dates`
- `PATCH /api/release-dates`
- `GET /api/masters/:resource`
- `POST /api/masters/:resource`
- `PATCH /api/masters/:resource`
- `GET /api/members`
- `PATCH /api/members`

`resource` は `channels | task_types | task_statuses | assignees`。

## テスト

```bash
npm test
```

## 開発メモ

- [スケジュール画面レイアウト方針（2026-02-23）](/Users/nakashioyuu/gantt-chart/docs/schedule-viewport-layout.md)
