# Task List

## Performance Backlog (2026-02-23)

- [ ] `GET /api/tasks` のクエリ最適化
  - ファイル: `/Users/nakashioyuu/gantt-chart/app/api/tasks/route.ts`
  - 内容:
    - DB側 `order` へ寄せる（アプリ側ソートの依存を下げる）
    - 取得列を見直し、不要なペイロードを削減
    - 将来のページング方式（cursor/offset）を決める
  - 完了条件:
    - 既存のソート結果と互換
    - 型チェックとテストが通る

- [ ] タイムライン描画のDOM削減
  - ファイル: `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
  - 内容:
    - 「タスク数 × 日数」で増えるDOMを削減
    - 仮想化（見えている行のみ描画）または背景グリッド共通化を導入
  - 完了条件:
    - 既存のドラッグ編集/リサイズ動作を維持
    - 大量データ時のスクロール体感を改善

- [ ] Realtime差分反映の強化
  - ファイル: `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
  - 内容:
    - 再取得より差分反映を優先する更新経路に統一
    - 重複イベント時の再取得をさらに最小化
  - 完了条件:
    - 追加・編集・削除のUI反映が即時
    - 同一操作での重複フェッチが発生しない
