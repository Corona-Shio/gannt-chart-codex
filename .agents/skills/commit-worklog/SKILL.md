---
name: commit-worklog
description: Record completed work into a single reusable log document when tasks finish, especially at commit/push timing. Use when the user asks to summarize completed work, keep an operation history, document implementation policy, or leave reusable handoff notes.
metadata:
  author: local
  version: "1.0.0"
---

# Commit Worklog

作業完了時の内容を、単一ドキュメントへ継続追記するための運用スキル。

## Trigger

以下に該当する依頼で使う:

- 「今回の作業を記録して」
- 「コミット/プッシュ内容をまとめて」
- 「修正方針を残して」
- 「次回も使える形でドキュメント化して」

## Output Destination

- 既定の保存先: `/Users/nakashioyuu/gantt-chart/docs/worklog.md`
- 原則としてこの1ファイルに追記する（分割しない）

## Workflow

1. 現在の変更内容とGit情報を取得する
   - `git status --short`
   - `git branch --show-current`
   - `git log --oneline -n 5`（直近コミット確認）
2. 対象作業の範囲を決める
   - 通常は「今回の依頼で実施した修正」単位
   - 連続コミットは同一テーマなら1エントリにまとめてよい
3. `docs/worklog.md` にテンプレート形式で追記する
4. 追記内容を確認し、重複や古い表現を整理する
5. ユーザーへ追記完了を報告し、必要ならコミット/プッシュまで実行する

## Required Entry Fields

各エントリに必ず以下を含める:

- 日時（JST）
- 背景
- 修正方針（理由付き）
- 実施内容（箇条書き）
- 変更ファイル
- 検証コマンドと結果
- Git情報（branch / commit / push有無）
- 次回メモ

## Writing Rules

- 事実ベースで簡潔に書く（主観的な感想を避ける）
- 「何をしたか」より「なぜその判断か」を優先して残す
- パスやコマンドは再実行できる粒度で記載する
- 未完了項目は「次回メモ」に明示する
