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

## 2026-02-23 18:10 JST - チャンネル見出し行へ投稿日セル表示と配色強調を適用
- 背景:
  - チャンネルグループ時の見出し行で、公開日情報を左側テキストではなくタイムライン上の該当日セルに見せたい要望があった。
  - 併せて見出し行の視認性を上げるため、アクセントカラー強化と投稿日ヘッダー行との色統一が求められた。
- 修正方針:
  - 見出し行右側に日セルを描画し、チャンネルグループ時のみ `channel_id + release_date` で一致する公開日データの `script_no` をセル内に表示する。
  - 同日複数件にも対応するため、チャンネルごとの最大スタック数で見出し行高を動的に調整する。
  - チャンネルグループ時は公開日バンド行のトーンを使い、他グループ時は共通アクセント色を使う。
- 実施内容:
  - 見出し行の「公開日マーカー件数」テキスト表示を撤去。
  - 見出し行タイムライン側で、投稿日セル（脚本番号表示・hover title 付き）を描画。
  - `releaseMaxStackByChannel` を追加し、見出し行高さを公開日スタック数に連動。
  - `releaseToneByChannel` と `GROUP_HEADER_ACCENT_BG` を追加し、見出し行背景色を強調・統一。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
- 検証:
  - コマンド: `npm run lint`
  - 結果: ESLint warning/error なし
  - コマンド: `npm test`
  - 結果: 17 tests passed
- Git:
  - branch: `main`
  - commit: 未コミット（この記録時点）
  - push: 未実施（この記録時点）
- 次回メモ:
  - 見出し行の強調度は `GROUP_HEADER_ACCENT_BG` と `RELEASE_ROW_TONES` の調整で運用しやすい。

## 2026-02-23 17:29 JST - 公開日表示を縦線から該当行セル赤塗りへ変更
- 背景:
  - 公開日が縦の細い赤線で表示されており、どの脚本行に対応する公開日かが一目で追いづらかった。
- 修正方針:
  - 公開日表示を「チャンネル+脚本」に一致するタスク行のみへ限定し、該当日のセル背景を赤で塗る形に変更する。
  - 判定は `script_id` を優先し、互換のため `script_no` でもフォールバックできるようにする。
  - 視認性要望に合わせて赤色トーンを1段階強める。
- 実施内容:
  - 既存の全公開日縦線マーカー描画ブロックを削除。
  - `visibleReleaseDates` から `channel_id + script_id` / `channel_id + script_no` の日付セットマップを生成。
  - タスク行の日セル描画時に、一致公開日セルだけ `RELEASE_MATCH_DAY_BG` を適用。
  - 色指定を `#ef6a5a` に更新。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
- 検証:
  - コマンド: `npm run lint`
  - 結果: ESLint warning/error なし
  - コマンド: `npm test`
  - 結果: 17 tests passed
- Git:
  - branch: `main`
  - commit: 未コミット（この記録時点）
  - push: 未実施（この記録時点）
- 次回メモ:
  - 赤の強さは `RELEASE_MATCH_DAY_BG` で即時調整できるため、運用で見づらい場合は色だけ微調整する。

## 2026-02-23 16:42 JST - 表示期間に依存しないタスク常時表示への変更
- 背景:
  - ガントの表示期間設定によって、期間外タスクが一覧・ガントから見えなくなる状態だった。
  - 要件として、表示期間に関係なく全タスクを常に確認できる状態が必要だった。
- 修正方針:
  - タスク取得時に期間クエリを送らないようにして、データ取得を期間非依存にする。
  - クライアント側の可視判定から期間条件を外し、絞り込みはフィルタ条件（チャンネル/担当/ステータス/タスク種）のみに限定する。
  - 期間外タスクでもバー描画とドラッグ操作が破綻しないよう、タイムライン端へのクランプを補強する。
- 実施内容:
  - `loadTasks` のクエリから `rangeStart` / `rangeEnd` を削除。
  - リアルタイム更新時の `upsertTaskInState` 判定から期間条件を削除し、関数名を `isTaskVisibleWithCurrentFilters` に変更。
  - `barRange` を更新し、期間外開始/終了日は左端/右端にマップする処理へ変更。
  - バー移動/リサイズの基準値を日付文字列からインデックス（`baseStartIndex` / `baseEndIndex`）に変更。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
- 検証:
  - コマンド: `npm run test`
  - 結果: 17 tests passed
  - コマンド: `npm run lint`
  - 結果: ESLint warning/error なし
- Git:
  - branch: `main`
  - commit: 未コミット（この記録時点）
  - push: 未実施（この記録時点）
- 次回メモ:
  - 「公開日」は現在も表示期間で絞り込みしているため、要件変更があれば `/api/release-dates` と `loadReleaseDates` 側の方針を別途検討する。

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
  - commit: `a94cebb`
  - push: `origin/main` へ反映済み
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

## 2026-02-23 18:16 JST - グループ見出し行の縦スクロール固定化
- 背景:
  - グループビューで縦スクロール時に、現在見ているグループ名を見失いやすかった。
  - 次のグループ見出しが来るまで現在グループ見出しを上部固定する挙動が必要だった。
- 修正方針:
  - 既存のタイムライン上部ヘッダー（公開日/日付/曜日）の固定仕様を維持し、その直下にグループ見出し行を `sticky` で固定する。
  - 左固定列の挙動は維持し、横スクロールとの重なり順だけ最小限調整する。
- 実施内容:
  - グループ見出し行コンテナに `position: sticky` を追加。
  - 固定位置を `top: timelineHeaderHeight` とし、上部ヘッダー直下で止まるように設定。
  - `zIndex` を付与して、行内容との重なりを安定化。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
- 検証:
  - コマンド: `npm run lint`
  - 結果: ESLint warning/error なし
- Git:
  - branch: `main`
  - commit: 未コミット（この記録時点）
  - push: 未実施（この記録時点）
- 次回メモ:
  - 固定開始位置の微調整は `timelineHeaderHeight` の算出値（公開日バンド行高さを含む）を基準に行う。

## 2026-02-23 20:39 JST - マスター管理の公開日を表示範囲に依存させない
- 背景:
  - マスター管理の公開日一覧が、スケジュール表示範囲 (`rangeStart` / `rangeEnd`) に連動して欠落する状態だった。
  - マスター管理では常に全公開日を編集対象として表示する必要があった。
- 修正方針:
  - 公開日データは常に全件取得して state に保持する。
  - スケジュール表示側のみ、描画時に表示範囲でローカル絞り込みする構造に分離する。
- 実施内容:
  - `loadReleaseDates` の API パラメータから `rangeStart` / `rangeEnd` を除外し、`workspaceId` のみで取得するよう変更。
  - `upsertReleaseDateInState` から範囲外レコード除外ロジックを削除し、公開日 state を常に全件保持。
  - `visibleReleaseDates` に `rangeStart` / `rangeEnd` 条件を追加し、スケジュール描画時だけ範囲内データを利用。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
- 検証:
  - コマンド: `npm test`
  - 結果: 17 tests passed
  - コマンド: `npm run lint`
  - 結果: ESLint warning/error なし
- Git:
  - branch: `main`
  - commit: 未コミット（この記録時点）
  - push: 未実施（この記録時点）
- 次回メモ:
  - 公開日件数が増えた場合は、`ReleaseDateTable` のページングや検索条件追加を検討する。

## 2026-02-23 21:09 JST - 表示期間外タスクバーの非表示化
- 背景:
  - 表示期間に完全に含まれないタスクでも、端に1日分のバーが表示されていた。
- 修正方針:
  - 表示期間と重ならないタスクはバーを描画しない。
  - 表示期間と重なるタスクのみ既存のクランプ表示とドラッグ操作を維持する。
- 実施内容:
  - `barRange` に `isVisible` を追加し、`endDate < rangeStart || startDate > rangeEnd` を非表示判定にした。
  - タスクバー要素を `range.isVisible` 条件でレンダリングするように変更した。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
- 検証コマンドと結果:
  - コマンド: `npm run lint`
  - 結果: No ESLint warnings or errors
  - コマンド: `npm run test`
  - 結果: 17 tests passed
- Git情報（branch / commit / push有無）:
  - branch: `main`
  - commit: （この記録時点では未コミット）
  - push: （この記録時点では未実施）
- 次回メモ:
  - 表示期間外タスクを左側一覧ごと非表示にしたい要望が出た場合は、`group.items` 生成時の表示期間フィルタ追加を検討する。
