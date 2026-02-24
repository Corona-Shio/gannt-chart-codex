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

## 2026-02-23 22:56 JST - フィルターUIを属性追加型に刷新し複数選択対応
- 背景:
  - 既存のフィルターUIは単一選択のセレクト中心で、属性を段階的に追加して絞り込む操作に合っていなかった。
  - 要望として「+フィルターで属性を先に選び、横に属性フィルターボタンを追加し、各属性で複数選択したい」が提示された。
- 修正方針:
  - フィルター状態を単一値から「属性ごとの複数ID配列」に変更し、APIのCSV複数条件へそのまま接続する。
  - UIは「属性追加ポップアップ」+「属性チップごとのチェックボックス編集ポップアップ」に分離し、既存の並び替えポップアップ体験と揃える。
  - 外側クリックと Esc で閉じる挙動を統一し、同時多重表示は避ける。
- 実施内容:
  - `Filters` 型を `channelIds/assigneeIds/statusIds/taskTypeIds` の配列構造に変更。
  - タスク取得・可視判定・公開日バンド表示・新規作成時の初期チャネル/担当採用ロジックを配列フィルター対応へ更新。
  - `+フィルター` 押下時に属性選択ポップアップを表示し、選択した属性をチップとして横に追加するUIを実装。
  - 属性チップ押下でチェックボックス複数選択ポップアップを表示し、選択件数をチップラベルに反映。
  - フィルター関連ポップアップに外側クリック/Escクローズ処理を追加。
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
  - 値検索入力（プロパティ検索）と「含む/除外」演算子を追加すると、Notionライクな絞り込みにさらに近づく。

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

## 2026-02-23 22:27 JST - 操作エリアの簡素化と区切り改善
- 背景:
  - 表示開始日や並び替え周辺のUIで、要素の囲みやラベル重複が冗長に見えていた。
  - 区切り文字 `｜` はテキストではなく、視覚的な縦線として見せたい要望があった。
  - 表示範囲の `~` がフォント依存で崩れて見えるケースがあった。
- 修正方針（理由付き）:
  - 囲み装飾を撤去し、フラットな行レイアウトに戻して情報密度を適正化する。
  - 機能トリガーはラベルを減らし、`＋並び替え` / `＋フィルター` のボタン中心に統一する。
  - 区切りは高さを持つ縦線要素にして、意味区切りをシンプルに視認できるようにする。
  - 表示範囲は `[start - end]` に変更し、モノスペース系フォントで記号表示を安定化する。
- 実施内容（箇条書き）:
  - 操作エリアの囲みコンテナ（背景・枠）を撤去し、1行フラット構成へ変更。
  - 区切りを文字 `｜` から `height: 18px` の縦線要素へ置換。
  - 並び替え/フィルターの見出しを廃止し、`＋並び替え` と `＋フィルター` ボタンに集約。
  - 表示範囲の表記を `[{rangeStart} - {rangeEnd}]` に変更。
  - 表示範囲バッジにモノスペース系フォント指定を追加。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
- 検証コマンドと結果:
  - コマンド: `npm run lint`
  - 結果: No ESLint warnings or errors
- Git情報（branch / commit / push有無）:
  - branch: `main`
  - commit: このコミット
  - push: これから実施
- 次回メモ:
  - 区切り線の視認性は `height` と `line-strong` の色で最小調整できるため、必要に応じて微調整する。

## 2026-02-24 10:02 JST - 月/年月バッジの表示統一とスクロール連動の安定化
- 背景:
  - タイムライン月表示で「左端のみ年月」「各月は月表示」の要件があり、スクロール時の年月ラベルの揺れ・重なり見え方の不安定さを解消する必要があった。
  - 追加要件として、重なり時のフェード、月末基準の年月切替タイミング、境界ズレ（左側逃げ・下側はみ出し）の調整が求められた。
- 修正方針（理由付き）:
  - 位置を毎フレーム直接更新する方式は揺れやすいため、バッジ位置は `sticky` 固定にし、スクロール連動は「表示テキスト判定」のみに限定する。
  - 年月バッジと各月バッジの責務を分離し、重なり表示は専用マスクで制御して視覚的な一貫性を担保する。
  - 年月切替は「月全体比率」ではなく「左端に来た月末セルの隠れ量」で判定し、体感に近い切替へ寄せる。
- 実施内容（箇条書き）:
  - 月行を再構成し、各月グループへ同一デザインの月バッジを配置。年は左端固定の年月バッジ側のみ表示。
  - スクロール連動ロジックを `scrollLeft` 由来の月キー更新に整理し、`requestAnimationFrame` で更新頻度を制御。
  - 月末切替判定を `MONTH_END_SWITCH_HIDDEN_RATIO` ベースへ変更（最終調整値: `0.6`）。
  - 年月バッジ幅を `ResizeObserver` で計測し、重なり領域を「完全隠し + フェード」で制御するマスクを追加。
  - 左側逃げ対策としてマスク基準をテーブル境界に合わせ、下側はみ出し対策としてマスク高さを `25px` に調整。
  - 見た目調整用定数（`YEAR_MONTH_BADGE_LEFT_INSET` など）を追加し、微調整しやすい構成へ整理。
- 変更ファイル:
  - `/Users/nakashioyuu/gantt-chart/components/schedule-dashboard.tsx`
- 検証コマンドと結果:
  - コマンド: `npm run lint`
  - 結果: No ESLint warnings or errors
  - コマンド: `npm test`
  - 結果: 17 tests passed
- Git情報（branch / commit / push有無）:
  - branch: `main`
  - commit: `135b99d`
  - push: `origin/main` へ反映済み
- 次回メモ:
  - 切替タイミングは `MONTH_END_SWITCH_HIDDEN_RATIO`、重なり感は `YEAR_MONTH_BADGE_HIDE_PADDING` / `YEAR_MONTH_FADE_WIDTH` / `YEAR_MONTH_MASK_HEIGHT` で即時チューニング可能。
