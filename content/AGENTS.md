# ブログ記事の執筆・推敲

`posts/` の日本語記事を新規執筆・推敲するときは、[blog-japanese-writing](../.agents/skills/blog-japanese-writing/SKILL.md) を読んで適用する。このブログの標準の執筆スキルとする。

スキルは `humanizer-jp` を基に、平易さ、落ち着いた語り口、自然なリズム、控えめな比喩を重視する。情報量・出典・話者の区別を守り、特定の作家の固有の文体を再現しない。

記事の新規作成・本文改稿・削除・公開状態の変更後は、同スキルの「執筆・改稿後のグラフ分類」を必ず実行する。執筆AI自身が `npm run graph:update` を呼び、未判断のrequestが出たら本文全文・既存判断・概念定義を読み、構造化replyを作って `npm run graph:update -- --reply /tmp/graph-reply.json` で適用する。ユーザーへ判断ファイル作成を委ねて完了にしない。

AIは本文の主目的を読み、人のoverrideを保持する。テーマタグや日付・slugから参加を推定しない。未決着のreviewは人の明示overrideがない限り公開buildを停止する。機械工程は分類hash・graph同期・段落タグ・embedding差分・公開JSONの検証まで入口が実行する。詳細は[段落グラフの運用手順](../docs/content/paragraph-graph.md)を参照する。

下書きの分類は任意。`draft: true` はgraph値にかかわらず地図から除外される。公開前は `draft: false` の最終本文で同じ入口を実行し、必要な判断をAI自身が完了する。
