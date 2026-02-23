# 開発作業ログ（単一ドキュメント）

このドキュメントは、作業完了時（特にコミット・プッシュ時）に更新する共通ログです。  
以降の作業もこの1ファイルに追記し、分散したメモを作らない方針とします。

## 運用ルール

1. 1作業（または1コミットまとまり）ごとに1エントリを追記する
2. コミット/プッシュした場合は必ずコミットIDとブランチを記録する
3. 「何をしたか」だけでなく「なぜその方針にしたか」を残す
4. 次回に再利用しやすいよう、検証結果と未解決事項も残す

## 記録テンプレート

```md
## YYYY-MM-DD HH:mm JST - タイトル
- 背景:
- 修正方針:
- 実施内容:
  - 
- 変更ファイル:
  - `path/to/file`
- 検証:
  - コマンド:
  - 結果:
- Git:
  - branch:
  - commit:
  - push:
- 次回メモ:
```

## 作業ログ

## 2026-02-23 16:26 JST - マスター管理ビューのセクション高さと余白の安定化
- 背景:
  - マスター管理ビューで、下段テーブルの内容量やビュー切替に応じてセクションサイズや余白が伸縮して見え方が不安定だった。
  - 特にマスター選択タブ周辺が縦方向に引き伸ばされる挙動を解消する必要があった。
- 修正方針:
  - 画面全体は `auto + minmax(0, 1fr)` の縦配分を維持し、下段セクションは常に残り高を使う。
  - マスター管理ビューはヘッダ/タブとテーブル領域を分離し、テーブル領域だけを内部スクロールさせる。
  - 上段カードには最小高を与えて、スケジュール/マスター切替時の見た目の高さ差を抑える。
- 実施内容:
  - `components/schedule-dashboard.tsx` に `TOP_PANEL_MIN_HEIGHT` と `TOP_PANEL_DETAIL_MIN_HEIGHT` を追加。
  - 上段カードを `minHeight` + `alignContent: "start"` に変更し、`schedule`/`masters` での情報ブロック高さを揃えるよう調整。
  - マスター管理セクションを `display: flex; flex-direction: column; minHeight: 0;` に変更。
  - マスター管理内に `overflow: auto` の専用コンテナを設け、テーブル群のみスクロールさせる構造へ変更。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
- 検証:
  - コマンド: `npm run lint`
  - 結果: エラー/警告なし
  - コマンド: `npm test`
  - 結果: 17 tests passed
- Git:
  - branch: `main`
  - commit: 未コミット（このエントリ時点）
  - push: 未実施
- 次回メモ:
  - 実機確認で上段高さをさらに揃えたい場合は `TOP_PANEL_MIN_HEIGHT` / `TOP_PANEL_DETAIL_MIN_HEIGHT` をデザイン基準で微調整する。

## 2026-02-23 16:20 JST - 作業記録運用の標準化とSkill追加
- 背景:
  - コミット/プッシュ後に作業内容と修正方針を継続記録できる運用が必要になった。
- 修正方針:
  - 記録先を単一ドキュメントに固定し、記載項目をテンプレート化して再利用性を確保する。
  - 記録作業を毎回実行できるよう、専用Skillを追加する。
- 実施内容:
  - `docs/worklog.md` を作成し、運用ルールと記録テンプレートを定義。
  - 既存作業（レイアウト調整・方針文書化）のログを初期投入。
  - `.agents/skills/commit-worklog/SKILL.md` を新規作成。
  - `.gitignore` を調整し、`.agents/skills/commit-worklog/SKILL.md` のみ追跡対象化。
  - README に `docs/worklog.md` へのリンクを追加。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/docs/worklog.md`
  - `/Users/nakashioyuu/gantt-chart/.agents/skills/commit-worklog/SKILL.md`
  - `/Users/nakashioyuu/gantt-chart/.gitignore`
  - `/Users/nakashioyuu/gantt-chart/README.md`
- 検証:
  - コマンド: `git status --short --untracked-files=all`
  - 結果: 変更対象ファイルのみが表示されることを確認
- Git:
  - branch: `main`
  - commit: 未コミット（このエントリ時点）
  - push: 未実施
- 次回メモ:
  - この変更をコミット/プッシュした後、commit ID をこのエントリに追記する。

## 2026-02-23 16:04 JST - スケジュール画面の縦領域最適化
- 背景:
  - 画面下に余白が残り、ガント領域が狭く見えていた。
  - 横スクロールバーが最下段コンテンツにかぶって見える状態があった。
- 修正方針:
  - 外側余白とセクション間余白は維持しつつ、ガント領域を残り高さに追従させる。
  - 固定 `vh` 高さ指定をやめ、`1fr` + `minHeight: 0` ベースのレイアウトへ統一する。
- 実施内容:
  - `main` レイアウトを `auto + minmax(0, 1fr)` に変更（スケジュールタブ時）。
  - ガントスクロール領域の `maxHeight: "68vh"` を廃止し `flex: 1` 化。
  - スクロールバー重なり対策として `scrollbarGutter: "stable"` と `paddingBottom` を追加。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
- 検証:
  - コマンド: `npm run lint`
  - 結果: エラー/警告なし
- Git:
  - branch: `main`
  - commit: `037ff46`
  - push: `origin/main` へ反映済み
- 次回メモ:
  - OS/ブラウザ差によるスクロールバー見え方の差分があれば `paddingBottom` の値を再調整する。

## 2026-02-23 16:05 JST - レイアウト方針ドキュメント化
- 背景:
  - 上記修正を再現可能にするため、判断基準を明文化する必要があった。
- 修正方針:
  - 実装結果だけでなく、選択理由と変更時の注意点をセットで残す。
- 実施内容:
  - レイアウト方針を `/docs/schedule-viewport-layout.md` に作成。
  - README から参照できるようリンクを追加。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/docs/schedule-viewport-layout.md`
  - `/Users/nakashioyuu/gantt-chart/README.md`
- 検証:
  - コマンド: `npm run lint`
  - 結果: エラー/警告なし
- Git:
  - branch: `main`
  - commit: `2ac1f1c`
  - push: `origin/main` へ反映済み
- 次回メモ:
  - 今後の関連修正はこの `docs/worklog.md` に継続追記する。
