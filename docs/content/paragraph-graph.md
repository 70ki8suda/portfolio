# 段落の地図を更新する

`/blog?view=graph` は長く育てるテーマの地図です。通常の記事一覧やタグとは別に、記事の frontmatter に `graph: true` を書いた公開記事だけが参加します。省略時は対象外、`draft: true` は常に対象外です。通常一覧は「未来研究」と「時事経済」に分かれ、地図の参加資格とは独立です。現在は Gary の経済観、ソーラーパンク入門、e/acc、Deep Utopia、資本主義リアリズムと精神性（solarpunk-capitalist-realism-and-spirituality）、ソーラーパンクとd/acc（solarpunk-and-dacc）、プルラリティ（plurality）、ラディカル・マーケット（radical-markets）、MasonとGabrielの資本主義論（postcapitalism-mason-gabriel）、風の谷とマタギドライヴ（kazenotani-and-matagi-drive）、侘び・寂び・無常（wabi-sabi-impermanence-solarpunk）、HickelとMcAfeeの成長・資源論とAI（less-is-more-and-more-from-less）、Graeberと能力主義・AI労働論（bullshit-jobs-meritocracy-and-ai）の13記事を選んでいます。時事の企業・株式調査と、概念を論じる本文のない音楽セレクションは一覧で読めます。

## AI執筆・改稿の完了手順

記事を書いたAIが、本文変更から公開準備まで次の入口を使います。人に新しい手順を引き渡すのではなく、執筆skillが検出・読解・構造化判断・機械生成を一連で完了します。

```sh
npm run graph:update -- --request /tmp/graph-update-request.json --ai-index-cache
# AI判断が必要と出たときだけ、執筆AIがrequest全文を読んでreplyを作る
npm run graph:update -- --request /tmp/graph-update-request.json --reply /tmp/graph-update-reply.json --ai-index-cache
npm run test:unit
npm run typecheck
npm run build
npx playwright test tests/paragraph-graph.spec.ts tests/graph-refresh.spec.ts tests/home-graph.spec.ts
```

`graph:update`は追加・改稿・公開状態・削除を検出します。必要判断がなければ、opt-in同期・孤児タグ除去・差分embedding・公開JSON生成・鮮度検査まで自動で行います。埋め込みが新鮮ならPythonもモデルも起動しません。新しい本文や削除があれば旧cacheを一時出力へ引き継いで差分だけ計算し、固定した共通基底へ追加・変更点を変換します。同一入力の既存座標は動かしません。embeddingはローカルで計算し、モデル取得も実行時はofflineです。下記の索引生成を明示実行する場合は、文脈を含む原稿を既存認証のCodex CLIへ渡します。

AI判断が必要なら、本文全文（表・リストを含む）、抽出段落、既存判断・人のoverride・既存タグ・概念定義をローカルrequestに出して非ゼロ終了します。requestは公開ディレクトリやリポジトリ内へ保存できません。`requestHash`は記事ファイル集合と内容、判断・タグ・概念・cache・公開成果物に束縛されます。待機中に前提が変わればreplyを拒否します。

### 構造化判断

requestの`replyShape`に従います。例えば対象が一記事なら、次のような形です。値は本文読解から記入し、この例を分類の代わりに使いません。

```json
{
  "requestHash": "requestからコピー",
  "articles": [{
    "slug": "対象slug",
    "sourceHash": "requestからコピー",
    "category": "long-term",
    "decision": "include",
    "reason": "本文の中心の問いと、判断を支える具体的な節・論点",
    "paragraphs": {
      "対象slug:p-ID": {"tags": ["ownership"], "stance": "author", "context": "筆者の仮定例。原典話者の実証結果ではない。"},
      "対象slug:p-別ID": {"tags": [], "excludeReason": "後続の表を案内する導入で、単独では概念を論じていない。"}
    }
  }]
}
```

分類はlong-term（長期探究）、current-affairs（時事判断）、curation（選集）、other、uncertainです。日付・slug・単語ではなく全文の主目的から判断します。includeの記事では全抽出段落を過不足なく返し、採用段落には1〜3概念とsource/author/critic/mixedのstance、具体的なcontextを必須とします。未採用は空タグと理由。excludeの記事のparagraphsは空です。新概念は必要なものだけ`concepts`配列（id/label/description/group）で追加できます。既存定義は上書きできません。

段落単独で探索する論点があるかも判断します。前の説明の出典時点、読者向けの留保、誤読防止だけの段落は、前後を読んで空タグと個別の`excludeReason`を記録します。「注意」「限界」といった見出し・単語の一致で除外しません。独立した批判、条件、比較、主張があれば採用を維持します。ノードから除いても記事本文・記事全文vector・文脈付き索引の全文と前後文脈には残します。対象集合を変えたら全queryの候補を再計算し、削除ノードを指す候補がないことと共通座標・基底の保持を確認します。

人の`override`はAI回答から受け取りません。保存済みの人の判断を常に保持し、有効判断に優先します。時事の企業・株式調査2記事と音楽選集の除外は継続します。uncertain/reviewは人の明示overrideがない限りbuildを停止し、無断でexcludeへ変換しません。全段落を除外して空の地図を成功扱いすることもありません。通常公開可否はdraftで決まりますが、未決着の判断を残して公開用buildを通すことはできません。

`npm run build`は同じ入口を呼んでから型検査とproduction buildを行います。既存の分類・タグ・vector・JSONの厳密な整合検査は入口内で維持しています。判断の正しさや関連候補の意味は、機械検査だけでは保証できません。公開前に新旧段落と候補を読み、変更リスクに応じた表示/E2Eと独立監査を行います。

### 文脈付き関連検索の更新

`content/graph-index-cache.json`は文脈索引の内部cacheです。存在しても公開検索を有効にしません。採用方式が品質基準を満たすまで公開graphは元vector近傍を保持します。旧reviewed-pair形式は読取互換のみ残し、旧`--ai-retrieval`の全pair生成は停止します。

通常の執筆完了では`--ai-index-cache`付き入口を使います。cacheがない構成は従来のgraphだけを更新します。初期化は`--init-index-cache`を明示し、replyの適用時にも付けます。初期化intent、cacheの不存在または元byte、全sources/override/生成物をrequest hashへ束縛し、知らないreplyを無視しません。初期化後はcacheが存在する限りbuild/checkも整合性を検査します。cache自体の削除は通常更新の手段ではなく、別の明示的変更として監査します。

新規・変更の索引だけ、既存認証のCodex CLIで生成・忠実性審査します。全文、前後、節、話者・留保を入力し、元文にない意味を足しません。AIは公開lock外で固定requestを処理し、反映時はlockを取り直してsnapshotを再照合します。CLI/model/prompt/schemaを固定し、新APIキー、追加agent、全pair判定、理由生成は使いません。CLI失敗・不合格は中間結果を保全して停止し、空結果として通しません。

元の全文はbodyHash辞書へ保存し、索引・元入力・忠実性receiptを変えず保持します。本文が変わった場合、直接の前後文脈が変わった索引は再生成します。それ以外は全文依存が既定です。執筆AIは`<request path>.index-cache.json`の未解決判断を読み、全5項目（対象・主張・問い・話者・留保）を支える節のcoverageと元版→現版のimpactを明示審査できます。表・箇条書き・除外段落を含む生の節本文も照合し、選択依存の変更は審査で上書きできません。中間版の審査を次版へ流用せず、判断不能なら全文から新索引・審査を作成します。構造化replyは`--index-cache-reply /tmp/...`で同じ入口へ渡します。自動CLIは未解決依存をfresh生成で解決します。

機械工程は固定E5の全chunk差分embedding、全queryの索引24+元vector24候補とfingerprint再計算、削除参照除去です。タグgateはありません。候補は内部計算で、関連性審査済みを意味しません。共通座標/基底は別に保持します。無変更時はモデル・Python・LLMを呼ばず、整合検査だけを行います。削除時も残るqueryの候補を更新し、再追加は現入力/hash/recipe/receiptの一致が必要です。

cacheとgraphは同じjournalで反映・復旧し、typecheck/build後も入力集合を照合します。通常buildはAIを起動せず、判断不足を具体的requestで示して停止します。AI中間作業先は`--retrieval-work /tmp/...`、一時排他lockは`/tmp/graph-retrieval-author-<repo hash>.lock`です。回収前に所有PID終了と履歴を確認します。これはgraphの`--recover`とは別です。

公開検索は採用方式のschemaを明示して別途有効化します。準備済みlocal形式は両原文と索引を表示し、関連性未審査を明記します。未審査候補を旧reviewed-pair receiptで認定せず、正当な0件と不正payloadを区別します。cosineを関連確率と表示しません。機械検査の成功だけで品質不採用の方式を公開しません。

### ローカルembedding環境

```sh
uv venv --python 3.12 /tmp/paragraph-graph-python
uv pip install --python /tmp/paragraph-graph-python/bin/python -r scripts/graph-requirements.txt
```

初回だけ既存の`graph:prepare`と`embed-graph.py`（offlineなし）で公式Hugging Faceの固定revisionを取得できます。通常の自動入口はoffline限定です。別の環境を使うなら`GRAPH_PYTHON=/path/to/python`または`--python /path/to/python`を指定します。未準備なら具体的な環境エラーで停止し、ベクトルを捏造しません。

### 同時編集・失敗・復旧

所有PIDを名前に含む非公開作業ディレクトリを準備し、`.graph-update.lock`へのリンクを原子的に作成して単一writer/buildのロックにします。ownerの保存に失敗した段階ではロックを公開しません。全生成を一時領域で検査し、入力ファイルの追加/削除も含めた再照合後に反映します。反映前のjournalを残し、途中例外はそれまでの反映を戻します。他人が書き替えたファイルにはrollbackを上書きせず、ロックとjournalを保持して停止します。通常のgraphチェックや旧CLIもロック中は読書きを拒否します。型検査後とbuild終了後にも入力集合を再照合し、途中で本文が変われば公開用buildを失敗させます。ロックの範囲はbuild終了までで、upload/deployの直列実行は公開担当の運用責任です。

プロセスが強制終了してロックが残った場合は、進捗とjournalを確認してから`npm run graph:update -- --recover`を使います。生きているwriterには使えず、対象がその後変更されていれば復旧を拒否します。手動でlockだけを消して半更新のまま公開しません。復旧後は入口と必要な検証を再実行し、検査済みcommitのclean snapshotから公開します。ロックを無視して直接ファイルを変更する外部エディタを禁止する機構ではないため、競合時は再判断します。ファイル照合とrenameの間の最小の競合窓までOSが排他する方式ではありません。公開は外部編集されないclean snapshotから行います。

旧`graph:classify-input`、`graph:sync-optin`、`graph:extract`、`graph:prepare`、`graph:build`は調査・復旧用に残します。通常の執筆完了では個別コマンドを手でつなぐ必要はありません。

## 境界とID

renderer と offline generator は `src/blog/paragraphs.ts` の同一AST walkを使います。本文の通常段落と引用段落を一度だけ抽出します。見出しは文脈に使い、箇条書き・表・コード・埋め込み・脚注定義はノード化しません。これらを本文の一部へ重複連結しません。URLだけ、画像だけ、コードだけの段落も対象外です。表やリストに説明を依存する短い導入は編集者が除外します。段落地図は記事全構造の代替ではありません。

アンカーは正規化した段落テキストの二重32bitハッシュです。挿入や移動で既存段落のIDは変わらず、同文重複には出現順サフィックスを付けます。衝突を検出すると停止します。本文の編集ではIDが変わり再タグ付けが必要です。古い段落URLを永久保持するものではありません。同文重複の挿入・削除で重複側のサフィックスがずれる制限もあります。既存の明示章アンカーは維持します。

## ベクトル・関係・配置

- モデルは[intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small)、MIT、revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`。384次元、CPU/offline、対称比較用の`query: `prefix。remote codeと外部本文APIは使いません。
- 段落と記事全文は同じモデル・pooling空間です。記事はタイトルと全節・箇条書き・表・引用・脚注・画像alt・リンク表示文字列・動画以外のコード本文を含み、URL/埋込動画IDを除きます。未知のHTMLは黙って落とさず停止します。記事のparagraph除外タグは記事全文の除外を意味しません。記事入力hashと抽出recipeを独立検査し、採用段落が不変でも表や末尾の変更で記事cacheを更新します。
- 480token非重複chunkごとにattention mask平均pool→L2、全chunkをtoken数加重平均→L2。512token制限で切り捨てません。記事cacheにはtoken数と連続した区間を保存し全被覆を検査します。等chunk平均は短い末尾を過大評価するため採用しません。採用段落平均では全文を表せません。独自の長文集約であり、モデルが全文を一度に理解したという意味ではありません。
- 初回のみ全記事+全段落の同一vectorを統合して共通UMAP（cosine、seed42、単thread）をfitし、同じ等方scaleへ変換。参照vector/座標/入力hash/recipeをローカルcacheへ固定保存します。追加点は元cosine距離の上位8参照点から逆距離4乗（epsilon1e-6）で補間します。標準UMAP.transformではありません。同じvectorは完全一致した参照座標へ、変更vectorは同じ記事IDでも新しく補間。並び順・batch・zoom・タグ・所属で座標を変えません。
- 新点は参照座標の凸包内に入り、未知の主題が地図の外へ広がることはありません。2D距離は近似です。比較試験では初期段落recall@10がPCA約13%、UMAP約37%。3記事holdoutで新点だけのrecall@10は固定補間約9〜13%、PCA約6〜10%でした。既存全体と新点を混同せず、近隣の取りこぼしを前提に元384次元cosineを併設します。これは当コーパスの試験で一般的な品質保証ではありません。
- 公開`semanticNeighbors`は全採用段落の別記事候補から元cosine上位5件、`articleNeighbors`は全文記事vector上位5件。タグgate/閾値なし、候補不足は全件、丸め前score降順/ID順tie、公開score6桁。方向付きtopKで、選択点のoutgoingだけを描画します。類似は賛同/因果/正しさではありません。
- 既存`edges`の0.89以上/共通タグ/上位3のsemantic、`conceptNeighbors`、同節前後sequence、正確な段落URLのexplicitは補助データとして保持します。概念タグや段落関係の本数を記事vectorの近さと混同しません。
- public v2は文章・帰属・座標・近隣だけでraw vectorsや基底参照vectorsを含みません。fingerprintは射影ID・辺・近隣score・元embeddingを含む成果物に束縛します。基底は`content/graph-vectors.json`内で既存transaction/復旧対象になります。

TS/Pythonは`projection-recipe.json`の同じモデル・抽出・fit設定を照合します。高速経路でも基底hashだけでなく期待recipeと各vectorから再計算した座標を検査し、座標だけの改変や異なる基底の混在を拒否します。

通常は`npm run graph:update`。基底欠損/破損/recipe不一致を暗黙fitで回避しません。初回移行や意図した全体再配置だけ、変更を監査できる状態で`npm run graph:update -- --refresh-projection`を使い、座標差分と近傍品質を確認します。通常更新では削除記事の参照vector/hashが固定基底内に残りますが、原文・公開ノード・近隣には残しません。削除した参照情報も除く必要がある場合は明示refreshを行います。

Pythonの投影・全token被覆検証: `python scripts/test_semantic_projection.py`。`graph:check`、`graph:editorial-check`、unit、意味座標/PCmobile/embedded/更新E2Eを実施。依存は`graph-requirements.txt`に固定します。

## 下書きと公開直前

下書きの分類は任意です。`graph: true` が残っていても `draft: true` なら抽出・生成・検索に出ません。公開するときは `draft: false` に変更した最終本文で `graph:update` を実行し、必要なrequestへのreplyを執筆AI自身が生成・適用します。公開状態も分類hashに含むため、下書き時の判断を公開用の鮮度証拠にはできません。未決着のreviewを残したまま公開用buildを通すことはできません。

記事を削除した場合は、その記事の編集分類・段落タグ・ベクトルを除き、他記事からの案内も整理します。残った本文を再分類し、変更された段落のID・タグ・ベクトルを更新したうえで、残るコーパスの座標と関係を再生成します。線の本数は記事の長さや少数の段落への集中にも左右されるため、記事どうしの近さの点数としては読みません。意味の線の閾値は0.89を維持しています。

対象記事を追加・削除したときは、実際の候補分布と記事間の集約結果を見直します。記事名に依存した説明や線の手動追加は不要です。

## 共通座標の探索

Reagraphのcustom固定座標を使い、記事も段落も保存座標×同じ倍率で描画します。円周配置・記事内反発・所属放射線・概念の別座標はありません。最初は記事点、拡大すると段落自身の位置が見えます。ノードを移動するドラッグはなく、ドラッグはパンです。色と選択highlightで帰属を示し、選択点から元cosine近隣へ線を表示します。本文抜粋・話者/context・元記事anchorを詳細に保持します。タグは検索・絞り込みの補助です。

近接ラベルは点を動かさず表示を抑制します。隠れた記事や同位置段落も「探す」と記事内段落一覧から選べます。`article`/`node`/`concept`URLを維持し、旧concept指定はタグ検索として扱います。通常一覧と記事ページは変更しません。

## 閲覧中の更新とトップ埋め込み

地図は初回に加え、可視時の30秒ごと、focus・visibility復帰・online・BFCacheのpageshowでHTTP再検証します。同じ成果物なら探索状態を保持します。別の成果物は記事・段落・概念・辺の参照整合を検査してから反映し、消えた選択は解除します。同一基底の更新ではworld中心とabsolute zoomを保ち、基底ID変更時だけ選択点または全体へ合わせます。検索や入力途中の日本語は保持し、関連線の選択だけを外します。更新取得が失敗したときは現在の地図を残して再試行できます。ページ全体のリロードは通常の更新手段にしません。

トップはHeroの直後に高さを持つembeddedコンテナを置き、その下にブログ一覧リンク、Contactが続きます。画面内に来てから地図コード/JSON/WebGLを読み、画面外では解放します。「graph viewを操作」で領域内のdrag/zoomを有効にし、「ページ操作へ」で通常スクロールへ戻せます。左右余白もページスクロール用に残します。全画面の`/blog?view=graph`と通常一覧のURLは従来どおりです。

スキーマ公開跨ぎは、先行互換版の旧JSがv2を検出した際にsession内一度だけページを再取得します。CDN遅延時はループせず一覧へ退避できます。先行版より古いタブにはこの自動移行がないため、一覧導線を残します。通常の同schema記事更新は画面全体を再読み込みしません。

### 内容の更新日

執筆AIは `graph:update` の前に `npm run posts:update-dates` を実行する。未来研究（時事経済以外）の `updatedAt` はGitで記録された本文変更日（日本時間）を基にし、公開日より前にはしない。初回公開は `date` と同日。本文が未commitなら当日を記録し、タグ・UI変更では維持する。`--check` は更新漏れの読み取り専用検査。Gitのないclean buildで日付を書き換えない。旧データで更新日が欠けている場合は詳細の日付表示を省き、公開日を最終更新日とは呼ばない。SEOの公開日と更新日も分ける。Gitの日付は内容変更の記録で、実際の配信開始時刻の精密な証明ではない。
