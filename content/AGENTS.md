# ブログ記事の執筆・推敲

`posts/` の日本語記事を新規執筆・推敲するときは、[blog-japanese-writing](../.agents/skills/blog-japanese-writing/SKILL.md) を読んで適用する。このブログの標準の執筆スキルとする。

スキルは `humanizer-jp` を基に、平易さ、落ち着いた語り口、自然なリズム、控えめな比喩を重視する。情報量・出典・話者の区別を守り、特定の作家の固有の文体を再現しない。

記事の新規作成・本文改稿には、同スキルの「執筆・改稿後のグラフ分類」も適用する。AIが本文全体の主目的を読んで `content/graph-editorial.json` に分類・理由・本文hashを残し、人の override を保持する。テーマタグや日付・slugから参加を推定しない。曖昧なら `review` としてグラフには入れず、通常の公開可否は `draft` で別に扱う。

分類入力の取得、対象記事だけの `graph` 同期、段落タグ・embedding・公開JSONの差分更新と検証は、[段落グラフの運用手順](../docs/content/paragraph-graph.md)に従う。本文だけを更新して生成物を古いまま残さない。

下書き中の分類は任意で、`graph:sync-optin` は下書きには実行しない。公開前に `draft: false` の最終本文で分類とハッシュを更新してから同期する。`draft: true` は `graph` にかかわらず地図から除外される。
