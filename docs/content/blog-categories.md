# ブログの一覧カテゴリー

記事の一覧上の分類は任意のfrontmatter `category` で指定する。話題タグ（`tags`）や段落グラフの概念タグ、graph編集分類とは別の情報。

| category | 一覧表示 | URL |
| --- | --- | --- |
| `future-research` | 未来研究 | `/blog` |
| `current-economy` | 時事経済 | `/blog?category=current-economy` |
| `engineering` | エンジニアリング | `/blog?category=engineering` |

新しい技術記事の下書き例:

```yaml
category: engineering
draft: true
graph: false
```

`category`未指定の記事は従来の所属を維持する。graph-editorialのcategoryが`current-affairs`なら時事経済、それ以外は未来研究。明示した一覧カテゴリーはこの互換処理より優先する。既存記事をタグ・単語・日時だけで再分類しない。

一覧は時事経済のみ公開日を表示し、未来研究・エンジニアリングでは省略する。詳細は時事経済が公開日、ほかは記録された`updatedAt`のみを表示する。更新日がなければ公開日を更新日と偽って表示しない。SEOの公開日・更新日は別々に保持する。

カテゴリー指定でgraph参加を決めない。下書きはどのカテゴリーでも非公開で、公開前には[通常の本文分類と鮮度更新](paragraph-graph.md)を実行する。技術記事にも長期的な概念探究があれば本文に基づいて適格性を判断し、カテゴリー全体を一括除外しない。

`tag`と`category`は併用でき、旧タグURLの互換は維持する。分類変更が必要なときは本文・記事目的に基づき、分類metadataを明示して変更する。
