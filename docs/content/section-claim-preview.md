# 主要主張のローカル比較

これは既存graph viewを使う開発用の比較で、本番データを置き換えません。対象はLess/More、d/acc、Garyの3記事全文です。旧claim pilotや検索品質実験とは別runです。

- データと評価証拠は `/tmp/section-claim-existing-graph/` に保存します。
- `GRAPH_CLAIM_PREVIEW=1 npm run dev -- --port 4268 --strictPort` で開発サーバーを起動します。
- `/blog?view=graph&preview=paragraphs` は旧3記事、`preview=claims` は主要主張です。切替時は選択とカメラを初期化します。
- スイッチは明示的に有効なdev serverだけに存在します。build/preview/本番では無効で、tmpファイルはpublic assetsへコピーしません。

## データ作成

`npx tsx scripts/claim-preview.ts --inventory` は現本文から全見出し・原文段落・表/箇条書きの位置を抽出します。無ID見出しには内部識別子だけを付け、公開記事に架空anchorを作りません。表/listの原文位置はUTF8 byte区間と本文hashに結び付けます。選択パネルには根拠全体と、実在する節/近傍段落へのリンクを表示します。

人が作成する `claims.json` version 2 は、全節coverageと、summary/speaker/conditions/evidenceを持ちます。原文文字列の機械照合だけで内容審査を済ませず、主要命題の欠落・話者混同・条件の一般化を全件確認します。原版と修正履歴を保全し、候補順位を見て本文を調整しません。

独立内容審査と評価起点の固定後にだけ、`--raw` で旧3記事データ、`--prepare` で新主張のembedding入力を作成します。`--prepare` は既存claim-vectors.jsonがあれば停止します。既存モデルを `scripts/embed-graph.py ... --offline --output /tmp/section-claim-existing-graph/claim-vectors.json` で実行し、`--assemble` でgraph-claims.jsonを作ります。共通referenceと記事座標を維持し、新しいprojectionの学習はしません。LLM pair判定・理由生成は実行しません。

候補は同じ3記事内の別記事に限り、既存E5のL2正規化済みvectorの内積を利用します。score >= 0.89を残し、上位最大5件。弱候補を補充しません。これは本番の全記事topKと同じ母集団・表示条件ではありません。タグは候補条件に使いません。summary候補が0件なのと、不正/欠損データの読み込み失敗は区別します。

品質比較は固定計画・起点・bundle対応・独立ラベルの手順に従い、実装testとは別に報告します。手動で線を追加しません。失敗しても閾値を下げず、本番の旧graphを維持します。
