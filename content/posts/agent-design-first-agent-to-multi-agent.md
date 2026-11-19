---
title: "エージェントに何を、どの順で足すか — 最初の一体、記憶、長い中断、MCP、複数エージェント"
date: "2026-11-19"
updatedAt: "2026-11-19"
description: "Xで「Googleの1時間のエージェント講座」として紹介された動画は、Google Cloud Techが2026年3月から7月に公開した9本の解説動画をつなげたものでした。9本の内容を、最初のエージェント、三層の記憶、何日も止まる仕事、MCPとAPIの違い、複数エージェントの順に整理し、ADKのドキュメントとMCPの仕様、公開されているサンプルコードで、動画の説明と現在の仕様を照らし合わせます。"
tags: [AIエージェント開発, 検証とテスト]
category: engineering
lang: ja
draft: false
graph: false
---

エージェントを一体作ったあと、次に何を足すかで迷うことがあります。会話が終わったあとに何を残すのか。人の返事を何日も待つあいだ、エージェントはどこにいるのか。外部の道具をどうつなぐのか。一体で足りなくなるのはどんなときか。

2026年11月にXで「Googleの1時間のエージェント講座」として紹介された約72分の動画は、この順に進みます。投稿に添付された動画は、Google Cloud TechがYouTubeで2026年3月から7月にかけて別々に公開した9本の解説動画の内容を、順につないだ編集物です。話者は4人います。この記事では9本の内容をその順に整理し、動画が使うGoogleのAgent Development Kit（ADK）のドキュメント、MCPの仕様、公開されているサンプルコードと照らし合わせます。

元の動画は[記事の最後](#videos)に埋め込んでいます。ハーネス、ループ、グラフという言葉の使い分けは[別の記事](/blog/harness-loop-graph-engineering)で扱ったので、ここでは繰り返しません。

## 目次

- [9本の動画と、足していく順番](#map)
- [最初の一体：計画役、執筆役、検査役](#first)
- [ループは、何をもって止まるのか](#loop-stop)
- [記憶は三つの層に分ける](#memory)
- [何日も止まる仕事](#long-running)
- [MCPとAPIは、相手が違う](#mcp)
- [デモの画面に映っていた失敗](#mcp-demo)
- [複数エージェントにする理由](#multi)
- [足す前に確かめること](#order)
- [参考資料](#sources)
- [参考動画](#videos)

## 9本の動画と、足していく順番 {#map}

9本を、つなげられた順に並べると次のようになります。公開日は、つなげた順とは一致しません。

| 段階 | 動画 | 話者 | 公開日 | 長さ |
|---|---|---|---|---|
| 最初の一体 | AI agents explained: Build your first agent in 8 minutes | Smitha Kolan | 2026年6月10日 | 8分29秒 |
| 記憶（短期） | How to add short-term memory to your AI agent | Annie Wang | 2026年3月26日 | 6分3秒 |
| 記憶（永続） | How to add persistent memory to your AI agent | Annie Wang | 2026年4月8日 | 7分24秒 |
| 記憶（長期） | AI agent long-term memory with memory bank | Annie Wang | 2026年4月16日 | 6分43秒 |
| 長い中断 | Building long-running AI agents with ADK | Addy Osmani | 2026年6月16日 | 5分32秒 |
| 長い中断 | 3 patterns to build long-running AI agents | Addy Osmani | 2026年6月18日 | 5分59秒 |
| MCP | How to build an AI Agent and MCP Server (step-by-step) | Smitha Kolan | 2026年6月18日 | 7分54秒 |
| MCP | MCP vs API: Why traditional APIs are failing AI agents | Smitha Kolan | 2026年7月1日 | 12分25秒 |
| 複数エージェント | Intro to multi-agent systems with ADK | Greg Baugues | 2026年6月8日 | 11分52秒 |

どの動画もADKを題材にしていますが、扱う問いはADKに限りません。以下、この順に見ていきます。

## 最初の一体：計画役、執筆役、検査役 {#first}

Kolanさんは、エージェントを「答えるだけでなく、決めて行動するソフトウェア」と説明します。依頼を見て必要な手順を考え、APIを呼んだりコードを走らせたりし、結果を見て次にすることを決めます。[最初のエージェント：0:27〜](https://www.youtube.com/watch?v=Zqno_vux6d8&t=27s) 土台として挙げるのは、2022年のReActの論文です。モデルに一度で文章を出させるのではなく、考える、ツールを呼ぶ、結果を観察する、次を決める、という周期を回す考え方です。[最初のエージェント：0:50〜](https://www.youtube.com/watch?v=Zqno_vux6d8&t=50s)

続いて、エージェントの動き方を三つに分けます。決まった順に進む逐次型は予測しやすい代わりに融通がききません。その場の状態を見て次の手を選ぶ反応型は柔軟ですが、先の計画は立てません。計画型は、先に段取りを描いてから実行します。手順が決まっている仕事には逐次型、状況が動く仕事には反応型、依存関係のある多段の目標には計画型、というのがKolanさんの使い分けです。[最初のエージェント：1:31〜](https://www.youtube.com/watch?v=Zqno_vux6d8&t=91s)

題材は、ブログ記事を書くエージェントです。話題を渡すと、構成案を作り、それを本文にし、別の題名の候補を付けて返します。コードは次の部品でできています。[最初のエージェント：3:32〜](https://www.youtube.com/watch?v=Zqno_vux6d8&t=212s)

- **計画役（blog_planner）。** 話題からMarkdownの構成案を作ります。指示には、題名、短い導入、4〜6の節、結論、と出力の形を書きます。形を書いておくと出力が安定する、とKolanさんは説明します。
- **`output_key`。** 計画役の出力は、`blog_outline`という名前で共有の状態（state）に保存されます。動画は、次のエージェントがそれを自動で受け取れる、と説明します。ただし`output_key`が決めるのは保存先です。掲載されているコードで、検査役と執筆役の指示に書かれているのはキーの名前で、値を指示文に差し込む`{blog_outline}`の書き方は見当たりません。会話の履歴に頼らずに値が渡っているかどうかまでは、コードを読むだけでは確かめられません。
- **検査役（OutlineValidationChecker）。** 新しいものは書かず、構成案を調べるだけです。題名、導入、4〜6の節、結論がそろっていれば`ok`、欠けていれば`retry`と欠けている点を返すよう指示されています。
- **ループ（LoopAgent）。** 計画役と検査役を、最大3回まで繰り返す入れ物に入れます。執筆役（blog_writer）と、本文の検査役も、同じ形で組みます。
- **ツールとしてのエージェント（AgentTool）。** 二つのループをツールとして包み、いちばん上のエージェント（Blogger）に渡します。Bloggerが呼べるのはこの二つだけで、計画を呼び、執筆を呼び、最後に題名の候補を三つと短い紹介文を二つ付ける、という手順が指示に書かれています。[最初のエージェント：6:29〜](https://www.youtube.com/watch?v=Zqno_vux6d8&t=389s)

最初の例から、すでに部品は一つではありません。書く役と確かめる役が分かれ、役の出力は名前を付けて状態に保存されます。記憶の章に出てくる状態も、複数エージェントの章に出てくる`AgentTool`も、ここで一度使われています。

## ループは、何をもって止まるのか {#loop-stop}

動画の説明では、検査役が`ok`と言えばループは終わり、`retry`と言えば計画役がもう一度走ります。[最初のエージェント：4:50〜](https://www.youtube.com/watch?v=Zqno_vux6d8&t=290s)

ADKのドキュメントは、この点をもう少し厳密に書いています。`LoopAgent`は、いつ止まるかを自分では決めません。止まるのは、`max_iterations`で指定した回数に達したときか、内側のエージェントが「エスカレーション」の合図を出したときです。合図は、イベントの`escalate`を真にすることで、ツールやコールバックのなかで設定するか、用意されている`exit_loop`ツールを使います。ループの本体のコードを見ても、周回を終えるかどうかの判定に、エージェントが返した文章の中身は使われていません。なお本体には、呼び出しを一時中断する経路もあります。これは完了ではなく、あとで再開される中断です。

動画の説明欄からたどれるコードラボとリポジトリのコードでは、検査役はモデルを使う普通のエージェントで、`ok`または`retry`という文章を返し、それが状態に保存されるだけです。`exit_loop`のようなツールは渡されていません。次の引用は、該当する部分から説明文の行を省いたものです。

```python
class OutlineValidationChecker(Agent):
   def __init__(self):
       super().__init__(
           name="OutlineValidationChecker",
           model=MODEL,
           instruction="""
Check the outline in state `blog_outline`. If it has a title, intro, 4–6 sections, and a conclusion, respond exactly "ok".
Otherwise respond exactly "retry" and list missing pieces.
""",
           output_key="validation_result",
       )

robust_blog_planner = LoopAgent(
   name="RobustBlogPlanner",
   sub_agents=[blog_planner, OutlineValidationChecker()],
   max_iterations=3,
)
```

筆者はこのコードを実行していません。ドキュメントの説明とコードを読み合わせたかぎりでは、`ok`という文章だけではループは終わらず、止めているのは`max_iterations=3`のほうだと読めます。そのとおりなら、途中で中断やエラーがないかぎり、最初の構成案が合格でも、計画役と検査役は3周することになります。その場合、モデルの呼び出しは余分にかかり、合格した案があとの周で書き換えられることもありえます。

ここから引き出せる設計の要点は、ADKに限りません。終了の条件は、モデルが返す言葉のままにせず、実行する側の終了の合図に結び付ける、ということです。合格を知らせる手段と、あきらめる回数の上限の両方が要ります。停止条件と関門をエージェントの外に置く考え方は、[別の記事](/blog/harness-loop-graph-engineering#loop-first)で詳しく扱いました。

もう一つ、時点の違いがあります。2026年11月19日時点のADKのドキュメントは、`LoopAgent`などの定型のワークフローを、Python、TypeScript、Go、Kotlinでは非推奨とし、グラフ型のワークフローと動的なワークフローに置き換えられたと案内しています。動画の書き方はいまも読めますが、新しく書くなら、現行のグラフ型のワークフローでの設計を検討することになります。そのまま置き換えられるかどうかは確かめていません。

## 記憶は三つの層に分ける {#memory}

Wangさんの3本は、旅行の計画を手伝うエージェントを例に、記憶を一段ずつ足していきます。3本目の最後で、Wangさん自身が三つの層としてまとめています。[長期の記憶：5:43〜](https://www.youtube.com/watch?v=KZPo15M2DbM&t=343s)

| 層 | 残すもの | ADKでの置き場所 | 再起動 | 別の会話から |
|---|---|---|---|---|
| 作業中の記憶 | 一つの会話の発言の記録（イベント）と、すぐ使う値（状態） | セッション。既定は`InMemorySessionService` | 消える | 履歴と、接頭辞のない状態は読めない |
| 永続の記憶 | 同じ会話の続きと、利用者ごとの決まった事実 | `DatabaseSessionService`と、自分で用意する好みの表 | 残る | 好みの表は読める |
| 長期の記憶 | 過去の会話や画像・音声・動画から取り出した事実 | メモリーサービス（動画ではVertex AI Memory Bank） | 残る | 意味の近さで検索して読める |

### 作業中の記憶：イベントと状態

セッションは、一続きの会話です。Wangさんの最初のデモでは、1回目に「リスボンの2日間の旅行を計画して」と頼み、2回目に「2日目を計画して」と頼みます。2回目を新しいセッションで送ると、エージェントは都市も1日目の計画も知らない状態から始めます。同じセッションを使い回せば、前のやり取りを読んで続きを作れます。[短期の記憶：2:00〜](https://www.youtube.com/watch?v=vfVcDUCucSs&t=120s)

セッションの中身は二つあります。イベントは、利用者の発言とエージェントの返事をすべて並べた記録です。状態は、Wangさんの言い方では小さな付箋で、店の名前や予約番号のように、すぐ取り出したい値を置きます。一つの値を探すためにモデルに15件のメッセージを読み直させたくないから状態を使う、という説明です。[短期の記憶：2:55〜](https://www.youtube.com/watch?v=vfVcDUCucSs&t=175s)

状態は、エージェントどうしの受け渡しにも使います。動画の例では、一つ目のエージェントが店の名前だけを出力して`destination`というキーに保存し、二つ目のエージェントはその値を受け取って道順を答えます。公開されているコードでは、二つ目のエージェントの指示文に`{destination}`と書いてあり、実行のたびに状態の値がそこに差し込まれます。ブログのエージェントは保存までで、この差し込みは使っていませんでした。[短期の記憶：3:55〜](https://www.youtube.com/watch?v=vfVcDUCucSs&t=235s)

Wangさんが念を押すのは、書き込み方です。ツールのなかでセッションのオブジェクトを直接書き換えてはいけません。その変更はイベントの記録に残らず、あとで永続化の仕組みが保存できなくなります。ADKがツールやコールバックに渡す文脈（context）の状態に書けば、変更がイベントと一緒に記録されます。[短期の記憶：4:25〜](https://www.youtube.com/watch?v=vfVcDUCucSs&t=265s) ADKのドキュメントにも同じ注意があり、セッションを取り出して状態を直接書き換えると、イベントの追跡を迂回してデータを失うことがある、と書かれています。

### 永続の記憶：会話を保存する、利用者を覚える

メモリー上のセッションは、アプリを再起動すると消えます。2本目は、二つの別々の問題を直します。

一つは、会話そのものを保存することです。`InMemorySessionService`を`DatabaseSessionService`に差し替えると、発言、返事、状態の変更がデータベースに書かれます。再起動のあと、利用者が同じセッションIDで戻ってくれば、履歴と最新の状態が読み込まれて会話が続きます。エージェントの処理は書き換えず、セッションサービスの下の保存先だけを入れ替える、という点をWangさんは強調します。[永続の記憶：1:18〜](https://www.youtube.com/watch?v=HDqzJJhZsxw&t=78s)

もう一つは、会話をまたいで利用者を覚えることです。会話を保存しても、来週、新しいセッションIDで始まった会話には、読む履歴がありません。そこで、利用者のIDと項目名をキーにした小さな表を用意し、食事の制限や移動手段のような決まった事実を入れます。エージェントには、保存された好みを読むツールと、書き込むツールの二つを渡します。指示には順番を書きます。会話の最初に読む。それを使って計画する。新しい事実を聞いたら、終える前に保存する。[永続の記憶：3:07〜](https://www.youtube.com/watch?v=HDqzJJhZsxw&t=187s)

デモでは、菜食であることを保存させ、再起動をはさんだ新しいセッションで、エージェントがその行を読み出して計画に反映する様子を見せます。[永続の記憶：4:42〜](https://www.youtube.com/watch?v=HDqzJJhZsxw&t=282s)

ADKのドキュメントには、この用途に使える別の方法も載っています。状態のキーに`user:`という接頭辞を付けると、その値は一つのセッションではなく利用者に結び付き、同じアプリの、同じ利用者のすべてのセッションで共有されます。データベースを使うセッションサービスなら、再起動のあとも残ります。動画のように自分で表を持つ方法は、項目の形や検索の仕方を自分で決められます。筆者の見るところ、動画の方式では、「最初に必ず読む」という動作はモデルがツールを呼ぶことに頼っていて、読み出しを飛ばす可能性が残ります。状態の値を指示文に差し込む方法なら、モデルがツールを選ぶ必要はありません。ただし、渡された値をモデルが正しく使うかどうかは、どちらの方法でも別の問題です。

### 長期の記憶：意味で探せる保管庫

3本目は、セッションサービスとメモリーサービスの役割を分けるところから始まります。セッションサービスは進行中の会話を管理し、途中から再開できるようにします。メモリーサービスは長期の保管庫です。[長期の記憶：1:10〜](https://www.youtube.com/watch?v=KZPo15M2DbM&t=70s)

動画が挙げるメモリーサービスは二つです。`InMemoryMemoryService`は手元での試験用で、再起動で消え、検索はキーワードの一致です。Vertex AI Memory Bankはクラウドに保存し、意味の近さで検索します。動画の例では、「二輪の乗り物」で探すと、自転車についての記録が見つかります。[長期の記憶：1:28〜](https://www.youtube.com/watch?v=KZPo15M2DbM&t=88s) Wangさんは、これはただの表ではなく、内容を処理して役に立つ事実を取り出し、検索できるようにするサービスだ、と説明します。設定では、事実を取り出すモデルと、埋め込みを作るモデルを選び、「利用者の好み」「旅行の経験」のように保存する話題も決められます。[長期の記憶：2:14〜](https://www.youtube.com/watch?v=KZPo15M2DbM&t=134s)

記憶を入れる方法は二つあります。会話の終わりに`add_session_to_memory`を呼んでセッション全体を渡す方法と、画像や音声や動画のファイルを、短い説明と一緒に直接渡す方法です。[長期の記憶：3:04〜](https://www.youtube.com/watch?v=KZPo15M2DbM&t=184s) 取り出す側では、エージェントに`PreloadMemoryTool`を持たせます。このツールは毎回の応答の前に動き、利用者の新しいメッセージで保管庫を検索して、関係のある事実をプロンプトに差し込みます。エージェントの側に特別な処理は要りません。[長期の記憶：3:59〜](https://www.youtube.com/watch?v=KZPo15M2DbM&t=239s)

デモでは、建物の写真、海の動画、町の音声を渡した会話を保管庫に入れ、再起動をはさんだ新しい会話で、そこから取り出された好みに合う行き先が返る様子を見せます。[長期の記憶：4:25〜](https://www.youtube.com/watch?v=KZPo15M2DbM&t=265s)

現在のドキュメントと比べると、違いが二つあります。動画が扱うメモリーサービスは二つですが、現在のドキュメントには、会話の全文をベクトル検索の対象にする`VertexAiRagMemoryService`も載っています。また、動画が「Agent Engine」と呼ぶ基盤は、ドキュメントでは「Agent Platform」「Agent Runtime」という名前で書かれています。クラス名の`VertexAiMemoryBankService`は変わっていません。

三つの層は、足す順番でもあり、置き分けの基準でもあります。筆者の整理では、判断の軸は三つです。その情報は、会話が終わったあとも要るか。別の会話から読むか。項目名で引けるのか、意味で探す必要があるのか。予約番号は状態に、菜食という事実は利用者ごとの表に、「前に見せた建物のような場所」は保管庫に置くことになります。長期の層に入るのは、モデルが取り出した「事実」です。取り出しの段階で何が落ち、何が言い換えられたかは、元の会話と照らさなければ分かりません。

## 何日も止まる仕事 {#long-running}

Osmaniさんの2本は、会話より長い単位を扱います。よくあるエージェントのデモは、尋ねて答えが返ると終わります。10分や15分続いても、一つのコンテキストウィンドウのなかの出来事です。長く動くエージェントはその反対で、セッションをまたいで状態を保ち、数時間、数日、ときには数週間にわたって動きます。仕事の単位はプロンプトではなくワークフローだ、というのがOsmaniさんの言い方です。[三つの型：0:11〜](https://www.youtube.com/watch?v=l6KeLCuB90o&t=11s)

これが成り立つための条件として、Osmaniさんは三つを挙げます。[三つの型：0:57〜](https://www.youtube.com/watch?v=l6KeLCuB90o&t=57s)

1. **本当に眠れること。** 待っているあいだ、問い合わせを繰り返したり、スレッドを止めたまま計算資源を使い続けたりしません。Webhook、スケジュール、人の承認、ツールからの折り返しといった外からの出来事が届くまで、何も動いていない状態になります。
2. **状態が変わるたびに保存すること。** コンテナが落ちても、サーバーを入れ替えても、人が何日かけて返事をしても、止まったところから再開できるようにします。起きていない途中の手順を、モデルが起きたことにしてしまわないためでもあります。
3. **自分の仕事を自分で採点しないこと。** 同じエージェントにコードを書かせて、同じエージェントにレビューさせる使い方に、Osmaniさんは注意を促します。計画役、生成役、そして動いている結果を試す別の評価役、という三つの役に分ける形を勧めています。[三つの型：2:28〜](https://www.youtube.com/watch?v=l6KeLCuB90o&t=148s)

三つ目について、Osmaniさんは「Anthropicを含む複数の研究所の研究」を根拠に挙げます。Anthropicが2026年3月に公開した記事では、自分の作った成果物を評価させると、エージェントは、人が見れば明らかに平凡な出来でも自信を持って褒める傾向がある、と書かれています。この記事は留保も付けています。評価役を分けても、甘さがすぐに消えるわけではありません。評価役もモデルで、モデルの出力に寛大です。それでも、独立した評価役を疑い深くなるよう調整するほうが、生成役に自己批判をさせるよりずっとやりやすい、というのが記事の主張です。費用も書かれていて、レトロ風のゲームを作るツールを開発させた例では、一体で走らせた場合が20分で9ドル、三役の構成が6時間で200ドルでした。

### 入社手続きのデモ

もう1本は、Googleの開発者ブログの記事（2026年5月12日、Shubham SabooさんとEric Dongさん）と、公開されているサンプルの紹介です。題材は、新入社員の入社手続きを進めるエージェントです。歓迎の書類を送り、本人の署名を何日も待ち、IT部門のアカウント作成を別のエージェントに任せ、ノートPCの配達をまた何日も待ち、最後に初日の予定を送ります。[長く動くエージェント：0:17〜](https://www.youtube.com/watch?v=JsNbFnT0QCw&t=17s)

Osmaniさんは手元で動かした画面を見せます。新しい案件を始めると、エージェントは歓迎の書類を送るツールを呼び、そこで止まります。問い合わせのループも、動き続けるスレッドもなく、外からの出来事を待っているだけだ、という説明です。[長く動くエージェント：2:14〜](https://www.youtube.com/watch?v=JsNbFnT0QCw&t=134s) 社員の側の画面で署名のボタンを押すと、エージェントが起きて次の段階へ進みます。配達の確認も同じです。本番なら配送業者からの通知がAPIに届くところを、デモではボタンで代用しています。アカウントの作成や配達の確認も、サンプルのなかでは模擬の処理です。[長く動くエージェント：3:37〜](https://www.youtube.com/watch?v=JsNbFnT0QCw&t=217s)

仕組みは、ブログ記事のほうに書かれています。要点は四つです。

- **進み具合を、会話の履歴ではなく状態の値として持つ。** `START`、`WELCOME_SENT`、`DOCUMENTS_SIGNED`、`IT_PROVISIONED`、`HARDWARE_DELIVERED`、`COMPLETED`の六つの値を決め、いまの値を状態の`current_step`に置きます。
- **その値を、指示文に差し込む。** 指示文に`{current_step}`と書いておくと、実行のたびに状態の値が埋め込まれます。モデルは、古いメッセージを読み返さなくても、いまどの段階にいるかを知ることができます。
- **ツールが値を進める。** 書類を送るツールは、送ったあとに`current_step`を`WELCOME_SENT`に書き換えます。保存先を`DatabaseSessionService`にしておけば、この書き込みはディスクに残ります。
- **外からの出来事で起こす。** 署名が済むとWebhookが呼ばれ、保存されていたセッションを読み込み、`state_delta`で`current_step`を`DOCUMENTS_SIGNED`に進めたうえで、エージェントを1回走らせます。待っているあいだ、コンテナは0まで縮小していてかまいません。

ブログ記事は、この形にする理由として、会話の履歴をためていく方式が数日から数週間の仕事で壊れる点を三つ挙げています。履歴が関係のないやり取りで埋まり、モデルがいまの段階を取り違える。毎回の呼び出しで全履歴を読ませるので、トークンの費用がふくらむ。そして、3日待ったあとに大量の履歴を渡されたモデルが、出ていない承認を「覚えて」いたり、済んでいない手順を済んだものとして飛ばしたりする。

### 順番を守らせているのは何か

Osmaniさんは、エージェントは状態機械が決めた順に手順を進め、先へ飛ばすよう仕向けることはできない、と説明します。[長く動くエージェント：4:10〜](https://www.youtube.com/watch?v=JsNbFnT0QCw&t=250s) ブログ記事にも、状態機械が順番を強制するのでエージェントは手順を飛ばせない、とあります。

公開されているサンプルのコードを読むと、順番が書かれているのは指示文です。「`current_step`が`WELCOME_SENT`なら、署名を待っていると伝え、ほかのツールは呼ばない」といった規則が並んでいます。一方、ツールの関数は、呼ばれると次の値を書き込みますが、いまの値が正しい段階かどうかは確かめていません。たとえばアカウントを作るツールは、`current_step`が`DOCUMENTS_SIGNED`であることを調べずに、`IT_PROVISIONED`へ進めます。筆者はこのサンプルを実行していませんが、コードを読むかぎり、順番が守られるかどうかは、モデルが指示に従うことに頼っています。

順番を本当に強制したいなら、ツールの入り口で、いまの段階を確かめて、合わなければ断る処理を足すことになります。これは筆者の補足で、動画やブログ記事の内容ではありません。同じ通知が二度届いた場合に二度目を無害に受け流せるかどうかは、通知を受ける側で別に扱う問題です。

Osmaniさんは最後に、長く動くエージェントがぶつかる壁を三つ挙げ、それを越える手段をまとめています。壁は、コンテキストが劣化して毎回ゼロから始まること、永続する状態の仕組みがなく、外の構造なしではエージェントが漂ったり投げ出したりすること、自分で終わったかどうかを判定できないことです。手段は、計画・構築・評価を分けられるハーネス、計画や変更の記録をMarkdownのファイルとして持つ永続の記憶、そしてセッションやMemory Bankを提供する管理された基盤です。[三つの型：3:59〜](https://www.youtube.com/watch?v=l6KeLCuB90o&t=239s)

なお、ADKには「Resume」という別の機能もあります。ドキュメントによれば、通信の切断や停電などで止まったワークフローを、止まったところから再開するためのもので、Pythonでは1.16以降で使えます。入社手続きの例がしているのは、予定された待ち時間を状態とWebhookで扱うことで、予期しない中断からの復旧とは目的が違います。

## MCPとAPIは、相手が違う {#mcp}

Kolanさんの残りの2本はMCP（Model Context Protocol）を扱います。1本は手を動かす回、もう1本は考え方の回です。

### 仕組み

MCPは、エージェントが外部のツールと話すための標準の方法です。Kolanさんは通訳にたとえます。片側にモデルで動くエージェントがいて、もう片側に、検索のトレンドを調べる、データベースに問い合わせる、コードを走らせる、といった決まった仕事をするツールがあります。そのあいだにMCPが入ります。[MCPサーバーを作る：0:25〜](https://www.youtube.com/watch?v=wBnnA8aIxUs&t=25s)

流れは短いものです。ツールは別のプロセスとして動きます。エージェントはそこへ接続して「どんなツールがあるか」と尋ね、サーバーは、ツールの名前、引数、返すものの一覧を答えます。エージェントが名前と引数を指定して呼ぶと、ツールが動き、結果がJSONで返ります。[MCPサーバーを作る：0:55〜](https://www.youtube.com/watch?v=wBnnA8aIxUs&t=55s)

Kolanさんはこの分け方の利点を四つ挙げます。ツールが落ちてもエージェントは巻き込まれない（分離）。ツールをどの言語で書いてもよい（相互運用）。ツールが自分をスキーマで説明するので、エージェントは実行時に使い方を知ることができる（発見）。エージェントのコードを書き直さずに、ツールを足したり入れ替えたりできる（拡張）。[MCPサーバーを作る：1:41〜](https://www.youtube.com/watch?v=wBnnA8aIxUs&t=101s)

実装の回では、前のブログのエージェントに、Googleトレンドを調べるMCPサーバーをつなぎます。サーバーは一つのPythonファイルで、Kolanさんは四つの部分に分けて説明します。[MCPサーバーを作る：3:43〜](https://www.youtube.com/watch?v=wBnnA8aIxUs&t=223s)

1. 普通のPythonの関数`trends`を、ADKの`FunctionTool`で包む。関数の引数と説明文から、スキーマが自動で作られます。
2. MCPのサーバーのオブジェクトを作る。
3. 二つの処理を書く。一覧を返す処理は、ADKのツールの情報をMCPの形式に変換して返します。呼び出しを受ける処理は、名前を確かめ、引数を関数に渡し、戻り値をJSONの文字列にして返します。
4. サーバーを標準入出力につなぎ、起動する。

エージェントの側では、このサーバーを起動するコマンドを指定したツールセットを、計画役と執筆役の隣に並べるだけです。エージェントから見ると、手元の関数を呼ぶのと変わりません。[MCPサーバーを作る：6:23〜](https://www.youtube.com/watch?v=wBnnA8aIxUs&t=383s)

### APIとの違い

考え方の回の主張は、題名ほど対立的ではありません。Kolanさんの説明では、APIはプログラムどうしの取り決めで、両方が相手に何を期待するかを正確に知っていることを前提にしています。モデルにとって、それは中身の札がない鍵付きの棚のようなもので、どの引き出しを開け、どんな形の鍵を使うかを、誰かが教えなければなりません。[MCPとAPI：1:51〜](https://www.youtube.com/watch?v=185XGEMefgc&t=111s) MCPはその前提を逆にして、ツールに何ができ、どんな入力を取り、何を返すかを、モデルが決まった方法で知ることができるようにします。Kolanさんの比喩では、変わらない取扱説明書の代わりに、機械が読める生きた地図を渡すことです。[MCPとAPI：2:57〜](https://www.youtube.com/watch?v=185XGEMefgc&t=177s)

| | API | MCP |
|---|---|---|
| 呼び出す側 | ほかのプログラム、または利用者 | クライアントを介したモデル |
| 何ができるかを知る方法 | 開発者がドキュメントを読んで組み込む | 接続先に一覧を尋ねる |
| いつ何を呼ぶかの判断 | アプリのコードに書く | モデルが、渡された説明をもとに決める |
| 取り決めの中身 | エンドポイントと、要求・応答の形 | ツールの名前、説明、入出力のスキーマ |

この表は、動画の説明を筆者が並べ直したものです。比べているのは、動画が想定する、サービスごとにAPIを個別に組み込む作り方と、モデルにツールの選択を任せるMCPの使い方で、二つの技術の一般的な分類ではありません。APIにも機械が読める仕様を付けることはできますし、MCPで実際に接続するのはクライアントのソフトウェアで、モデルにどこまで判断を任せるかは作り方によります。Kolanさんの言葉では、APIは二つのアプリケーションのあいだのコード上の契約で、MCPはモデルとその環境のあいだの意味上の取り決めです。[MCPとAPI：4:24〜](https://www.youtube.com/watch?v=185XGEMefgc&t=264s)

動画が強調するのは、MCPがAPIを置き換えないことです。APIは土台として残り、システムを実際に動かしています。MCPが置き換えるのは、モデルとAPIのあいだの中間の層で、MCPサーバーは、いまあるAPIを、モデルが理解できる形に変える役をします。「MCP対API」ではなく「APIの上のMCP」だ、というのがKolanさんのまとめです。[MCPとAPI：7:04〜](https://www.youtube.com/watch?v=185XGEMefgc&t=424s)

動画の途中には、APIだと統合ごとに書いていたページ送り、認証、エラー処理、回数制限の扱いが、MCPなら要らなくなる、という言い方も出てきます。[MCPとAPI：3:30〜](https://www.youtube.com/watch?v=185XGEMefgc&t=210s) 上のまとめと合わせて読めば、これらの処理が消えるわけではありません。サービスごとの接続の処理をMCPサーバーの側にまとめられる、ということで、接続の認証や時間切れ、エラーの扱いは、クライアントの側にも残ります。トレンドのサーバーのコードにも、タイムアウトや代わりのデータ源を扱う処理が百行以上あります。

課題として、Kolanさんは三つを挙げます。サーバー、クライアント、ツールが同じ標準に合わせるという普及の問題。モデルがプロトコルを通じてツールを直接呼べるようになると、意図しないメールの送信やファイルの削除を防ぐ、はっきりした権限の層が要るという安全の問題。そして、エンドポイントと経路で考える習慣から、能力と文脈で考える習慣への切り替えです。[MCPとAPI：8:49〜](https://www.youtube.com/watch?v=185XGEMefgc&t=529s)

### 現在の仕様と違うところ

MCPの仕様は日付で版が分かれていて、2026年11月19日時点の最新は2026-07-28版です。動画の説明と比べると、三つの点が違います。

**接続の方法。** 動画は、モデルがサーバーに「WebSocketやHTTPのような」標準の方法でつながると説明します。[MCPとAPI：6:01〜](https://www.youtube.com/watch?v=185XGEMefgc&t=361s) 仕様が標準として定めているのは二つで、クライアントが起動した子プロセスと標準入出力でやり取りするstdioと、一つのエンドポイントへのHTTPのPOSTでやり取りするStreamable HTTPです。それ以外の経路を独自に実装することは認められていますが、WebSocketは標準の一覧にありません。

**最初の握手。** 実装の回のコードは、接続のはじめに初期化のやり取り（ハンドシェイク）をする書き方です。2026-07-28版は、このやり取りをなくしました。プロトコルの版とクライアントの能力は、要求ごとに運ばれます。接続に結び付いたセッションもなくなり、呼び出しをまたいで状態を持ちたいサーバーは、自分で発行した識別子をツールの引数として受け取ります。古い版の相手と話すための手順は仕様に書かれていますが、動画のコードがそのまま最新の版の書き方だとは考えないほうがよいでしょう。

**安全の扱い。** 動画は、権限や認証の仕組みは仕様に入りつつある、と述べます。[MCPとAPI：9:30〜](https://www.youtube.com/watch?v=185XGEMefgc&t=570s) 仕様を読むと、守る責任の多くは、プロトコルではなく実装する側に置かれています。認可は任意の機能で、HTTPで使う場合の手順はOAuth 2.1をもとに定められていますが、stdioではこの手順を使わず、環境から資格情報を受け取るよう書かれています。ツールについては、呼び出しを拒める人を常にあいだに置くべきだとされ、ツールが自分の振る舞いについて付ける注記は、信頼できるサーバーのものでないかぎり信用してはならない、とあります。仕様自身が、これらの原則をプロトコルの水準で強制することはできない、と断っています。ADKのドキュメントも、MCPのツールセットには`tool_filter`を必ず指定して、モデルに見せるツールを必要なものだけに絞るよう勧めています。

## デモの画面に映っていた失敗 {#mcp-demo}

実装の回の終わりに、ADKの画面でエージェントを動かす場面があります。画面では「Write about evaluating agents.md」と入力されていて、続いてトレンドのツールの呼び出し、計画役の呼び出しが並びます。この場面の直前に、Kolanさんは、これでエージェントは内容を作り上げる代わりに、書き始める前に実際のトレンドを取得できる、と説明しています。[MCPサーバーを作る：6:23〜](https://www.youtube.com/watch?v=wBnnA8aIxUs&t=383s)

この場面で、ツールの応答の中身が数秒だけ画面に表示されます（7分11秒ごろ）。筆者がフレームを止めて読んだかぎり、内容は次のとおりです。

```json
{"content":[{"type":"text","text":"{\n  \"status\": \"error\",\n  \"message\": \"trends failed: requests.api.get() got multiple values for keyword argument 'timeout'\"\n}"}],"isError":false}
```

表示されたこの応答は、トレンドのデータを返していません。画面では、そのあと記事が書き上がります。エージェントの指示には、トレンドのツールが失敗したり時間切れになったりしても、そのまま妥当な構成案と下書きを続ける、という一文があり、失敗しても執筆を続けることが許されています。画面にはトレンドの呼び出しが複数並んでいて、最終的な記事が別の取得結果を使ったかどうかは、この画面からは判定できません。

この数秒には、設計の論点が二つ含まれています。

一つは、失敗の伝え方です。応答の外側は`"isError": false`で、エラーの内容は、成功した応答の本文のなかの文字列として入っています。サーバーのコードがそう書かれているためで、関数が失敗を辞書として返し、呼び出しを受ける処理がそれをそのまま文字列にして返します。MCPの仕様は、ツールの実行中の失敗を`isError: true`を付けた結果として返す形を定めていて、クライアントはそれをモデルに渡して、モデルが自分で直せるようにするべきだ、としています。このデモで見える範囲では、本文のなかの`"status": "error"`を失敗と読み取るのはモデルです。アプリケーションの側で本文を検査する作りにすることもできます。

もう一つは、失敗したあとの振る舞いです。「失敗しても続ける」は、デモが止まらないための実用的な指示です。ただ、取得に失敗したまま書き進めた場合、それだけだと、できあがった記事を読む人には、裏付けのデータが届かなかったことが伝わりません。続けるのなら、取得できなかったことを出力に書かせるか、状態に記録して後段が確かめられるようにする、という手当てが考えられます。これは筆者の考えで、動画の主張ではありません。

## 複数エージェントにする理由 {#multi}

Bauguesさんの動画は、ADKの入門を、何もないところから複数エージェントまで一息に進めます。エージェントの定義は短く、「タスクを完了するために、ループのなかでツールを使うLLM」です。[複数エージェント入門：0:13〜](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=13s)

進め方は三段です。まず、モデルと名前と指示だけのエージェントを作り、コマンドラインと、ブラウザの画面の両方で試します。[複数エージェント入門：2:22〜](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=142s) 次に、ツールを足します。モデルの知識には学習の締め切りがあり、いまの日時は答えられません。現在の日時を返すPythonの関数を書き、エージェントのツールの一覧に入れると、答えられるようになります。[複数エージェント入門：4:11〜](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=251s) 続いて、ADKに組み込みのGoogle検索のツールを持つエージェントを作り、あるテレビ番組の次の放送日と、今期のこれまでの内容を尋ねます。

ここで問題が出ます。検索して集めた情報にもとづく答えが、出典の一覧つきで返ってきますが、Bauguesさんによれば、出典のURLのいくつかは開くと404になります。実際に検索はしていても、モデルはURLを作ってしまうことがある、という説明です。[複数エージェント入門：8:06〜](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=486s)

直し方は、エージェントをもう一体足すことです。URLを確かめるエージェントは、URLを渡すとそのページの文章を返すツールを持ち、受け取った主張とURLについて、「確認できた」「確認できなかった」「判断できない」のいずれかを返します。Bauguesさんはこれを、モデルに別のモデルの出力を判定させる方法（LLM as a judge）と呼びます。[複数エージェント入門：8:32〜](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=512s) そのうえに調査役のエージェントを置き、検索役と確認役の二体を、ツールとして持たせます。調査役への指示は、検索役で情報と出典のURLを探し、確認役で主要な主張を出典に照らし、確認できた情報だけを答え、確認できなかった主張はそう断る、というものです。[複数エージェント入門：9:25〜](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=565s)

Bauguesさんが挙げる利点は、制御です。一体ごとの仕事を絞れるので、性能、記憶、費用を管理しやすくなります。エージェントごとに別のモデルを使うこともできます。簡単な仕事には安くて速いモデルを、推論の要る仕事には高価で高性能なモデルを、という割り当てです。たくさんのツールを持たせた一体のエージェントより、どんな仕事を、どの程度の確かさで、どれだけの費用でこなすかを決めやすい、というのが結論です。[複数エージェント入門：11:02〜](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=662s)

9本を通して見ると、エージェントを分ける理由は一つではありません。筆者の整理では、四つの別々の理由が出てきます。

- **書く役と確かめる役を分ける。** ブログの検査役、Osmaniさんの評価役、Bauguesさんの確認役がこれにあたります。確認役は、ページを取得するという、検索役にはない手段を持っています。確かめる側が、作る側と違う材料に当たれることが要点です。
- **一体が抱える文脈を小さくする。** 入社手続きの例では、状態の値と手順の規則ですでに埋まっている調整役の指示文に、ITのアカウント作成まで入れず、専用のエージェントに任せます。
- **仕事ごとにモデルを選ぶ。** Bauguesさんの挙げる費用の管理です。
- **道具の制約を避ける。** これは動画では説明されない理由です。ADKのドキュメントによれば、Google検索のような組み込みのツールは、原則として、ほかのツールと同じエージェントに入れられません。回避策の一つ目として挙げられているのが、そのツールを持つエージェントを`AgentTool`で包んで、別のエージェントに渡す方法です。

最後の点には、動画の説明との食い違いが一つあります。検索のエージェントのコードには`bypass_multi_tools_limit=True`という設定があり、Bauguesさんはこれを、ツールの呼び出しが1回に制限されているのを外す設定だ、と説明します。[複数エージェント入門：6:16〜](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=376s) ADKのソースコードの説明では、この設定は、検索のツールを同じエージェントのなかでほかのツールと一緒に使えるようにするためのものです。

分けることには費用がかかります。確認役は主張ごとにページを取得してモデルを呼ぶので、一体で答える場合より、時間もトークンも増えます。動画のなかでも、検索を足しただけで応答が目に見えて遅くなる様子が映っています。複数エージェントのトークンの費用については、[別の記事](/blog/harness-loop-graph-engineering#cost)でAnthropicの公表している数字を紹介しました。確認役が「確認できた」と返すことも、ページがあって主張と合っているとモデルが判定した、という意味で、判定そのものの正しさは別に確かめる必要があります。

## 足す前に確かめること {#order}

9本の内容を、機能を足す順に並べ直します。右の二つの列は、動画と資料をもとにした筆者の整理です。

| 足すもの | 足すきっかけ | 先に決めること |
|---|---|---|
| 検査役とループ | 出力の形が、ときどき欠ける | 合格を実行側に知らせる合図と、あきらめる回数 |
| 状態 | エージェントどうしで値を渡したい。履歴を読み返させたくない | キーの名前と、だれが書くか。書き込みは文脈を通す |
| 永続するセッション | 再起動で会話が切れる | 保存先と、セッションIDをどう持ち回るか |
| 利用者ごとの記憶 | 新しい会話で、同じことを聞き直している | 項目の一覧。いつ読み、いつ書くか |
| 長期の記憶 | 項目名では引けない過去の内容を使いたい | 何を取り出して残すか。取り出された事実をだれが確かめるか |
| 状態機械とWebhook | 人や外部の返事を、何時間も何日も待つ | 段階の一覧。各ツールが受け付ける段階。同じ通知が二度来たときの扱い |
| MCPサーバー | 同じツールを、複数のエージェントやクライアントから使う | モデルに見せるツールの範囲、承認の置き場所、失敗の返し方 |
| 別のエージェント | 作った本人には確かめられない。文脈が一体に収まらない | 役ごとの入力と出力。確かめる側が使う材料 |

どの行でも、足す前に書いておくものは似ています。終わったと言える条件、失敗したときに何が返るか、そして、それを実行する側が読める値として持つことです。ブログのループでは`ok`という文章が、入社手続きでは指示文の規則が、トレンドのサーバーでは本文のなかの`"status": "error"`が、その条件を表していました。三つは同じ仕組みではありません。`ok`は、掲載コードを読むかぎり、ループを終える合図につながっていません。入社手続きの順番は、モデルが指示に従うことに頼っています。トレンドの失敗は、標準の失敗の合図ではなく本文の文字列として返されています。言葉で表した条件が、実行する側の制御に結び付いているかどうかは、一つずつ確かめる必要があります。

## 参考資料 {#sources}

9本の動画は入門向けの短い解説で、現在のADKのドキュメントやMCPの仕様とは違う点があります。この記事のコードは、公開されているサンプルからの引用で、筆者は実行していません。

**きっかけの投稿**

- [@DAIEvolutionHub の投稿](https://x.com/DAIEvolutionHub/status/2123069607129092320)（X、2026年11月18日）

**動画（Google Cloud Tech）**

- Smitha Kolan, [AI agents explained: Build your first agent in 8 minutes](https://www.youtube.com/watch?v=Zqno_vux6d8)（2026年6月10日）
- Annie Wang, [How to add short-term memory to your AI agent (Sessions & State Explained)](https://www.youtube.com/watch?v=vfVcDUCucSs)（2026年3月26日）
- Annie Wang, [How to add persistent memory to your AI agent](https://www.youtube.com/watch?v=HDqzJJhZsxw)（2026年4月8日）
- Annie Wang, [AI agent long-term memory with memory bank](https://www.youtube.com/watch?v=KZPo15M2DbM)（2026年4月16日）
- Addy Osmani, [Building long-running AI agents with ADK](https://www.youtube.com/watch?v=JsNbFnT0QCw)（2026年6月16日）
- Addy Osmani, [3 patterns to build long-running AI agents](https://www.youtube.com/watch?v=l6KeLCuB90o)（2026年6月18日）
- Smitha Kolan, [How to build an AI Agent and MCP Server (step-by-step)](https://www.youtube.com/watch?v=wBnnA8aIxUs)（2026年6月18日）
- Smitha Kolan, [MCP vs API: Why traditional APIs are failing AI agents](https://www.youtube.com/watch?v=185XGEMefgc)（2026年7月1日）
- Greg Baugues, [Intro to multi-agent systems with ADK](https://www.youtube.com/watch?v=0Z0GUDakR_A)（2026年6月8日）

**サンプルコードと解説**

- Google Codelabs, [Build an AI Agent with Google ADK](https://codelabs.developers.google.com/build-ai-agent-google-adk)
- Smitha Kolan, [awesome-ai-agents](https://github.com/smithakolan/awesome-ai-agents)（ブログのエージェントと、トレンドのMCPサーバー）
- Google Codelabs, [Building Stateful and Personalized Agents with ADK](https://codelabs.developers.google.com/codelabs/agent-memory/instructions)
- Annie Wang, [memory_agent](https://github.com/cuppibla/memory_agent)（記憶の3本のコード）
- Shubham Saboo, Eric Dong, [Build Long-running AI agents that pause, resume, and never lose context with ADK](https://developers.googleblog.com/build-long-running-ai-agents-that-pause-resume-and-never-lose-context-with-adk/)（Google Developers Blog、2026年5月12日）
- GoogleCloudPlatform, [new-hire-onboarding](https://github.com/GoogleCloudPlatform/generative-ai/tree/main/agents/adk/new-hire-onboarding)（入社手続きのサンプル）

**ADKのドキュメント（2026年11月19日に確認）**

- [Loop agents](https://adk.dev/agents/workflow-agents/loop-agents/)、[loop_agent.py](https://github.com/google/adk-python/blob/main/src/google/adk/agents/loop_agent.py)
- [Session](https://adk.dev/sessions/session/)、[State](https://adk.dev/sessions/state/)、[Memory](https://adk.dev/sessions/memory/)
- [Resume stopped agents](https://adk.dev/runtime/resume/)
- [Model Context Protocol tools](https://adk.dev/tools-custom/mcp-tools/)
- [Tool limitations](https://adk.dev/tools/limitations/)、[google_search_tool.py](https://github.com/google/adk-python/blob/main/src/google/adk/tools/google_search_tool.py)

**MCPの仕様（2026-07-28版）**

- [Transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

**そのほか**

- Shunyu Yao ほか, [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)（2022年）
- Prithvi Rajasekaran, [Harness design for long-running application development](https://www.anthropic.com/research/harness-design-long-running-apps)（Anthropic、2026年3月24日）

## 参考動画 {#videos}

### 最初の一体 — Smitha Kolan（2026年6月）

```youtube
Zqno_vux6d8
AI agents explained: Build your first agent in 8 minutes
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=Zqno_vux6d8)

- [0:27：エージェントとは何か](https://www.youtube.com/watch?v=Zqno_vux6d8&t=27s)
- [1:31：逐次型、反応型、計画型](https://www.youtube.com/watch?v=Zqno_vux6d8&t=91s)
- [3:32：計画役と`output_key`](https://www.youtube.com/watch?v=Zqno_vux6d8&t=212s)
- [4:23：検査役とループ](https://www.youtube.com/watch?v=Zqno_vux6d8&t=263s)
- [6:29：ループをツールとして包む](https://www.youtube.com/watch?v=Zqno_vux6d8&t=389s)

### 短期の記憶 — Annie Wang（2026年3月）

```youtube
vfVcDUCucSs
How to add short-term memory to your AI agent (Sessions & State Explained)
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=vfVcDUCucSs)

- [2:00：新しいセッションで記憶が切れる例](https://www.youtube.com/watch?v=vfVcDUCucSs&t=120s)
- [2:55：イベントと状態](https://www.youtube.com/watch?v=vfVcDUCucSs&t=175s)
- [4:25：状態は文脈を通して書く](https://www.youtube.com/watch?v=vfVcDUCucSs&t=265s)

### 永続の記憶 — Annie Wang（2026年4月）

```youtube
HDqzJJhZsxw
How to add persistent memory to your AI agent
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=HDqzJJhZsxw)

- [1:18：データベースに保存するセッション](https://www.youtube.com/watch?v=HDqzJJhZsxw&t=78s)
- [3:07：利用者ごとの好みの表と二つのツール](https://www.youtube.com/watch?v=HDqzJJhZsxw&t=187s)
- [4:42：再起動をはさんだデモ](https://www.youtube.com/watch?v=HDqzJJhZsxw&t=282s)

### 長期の記憶 — Annie Wang（2026年4月）

```youtube
KZPo15M2DbM
AI agent long-term memory with memory bank
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=KZPo15M2DbM)

- [1:10：セッションサービスとメモリーサービス](https://www.youtube.com/watch?v=KZPo15M2DbM&t=70s)
- [3:04：記憶を入れる二つの方法](https://www.youtube.com/watch?v=KZPo15M2DbM&t=184s)
- [3:59：応答の前に記憶を差し込むツール](https://www.youtube.com/watch?v=KZPo15M2DbM&t=239s)
- [5:43：三つの層のまとめ](https://www.youtube.com/watch?v=KZPo15M2DbM&t=343s)

### 長く動くエージェントのデモ — Addy Osmani（2026年6月）

```youtube
JsNbFnT0QCw
Building long-running AI agents with ADK
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=JsNbFnT0QCw)

- [0:17：入社手続きのエージェント](https://www.youtube.com/watch?v=JsNbFnT0QCw&t=17s)
- [2:14：ツールを呼んで止まる](https://www.youtube.com/watch?v=JsNbFnT0QCw&t=134s)
- [3:37：配達の通知で起きる](https://www.youtube.com/watch?v=JsNbFnT0QCw&t=217s)
- [4:21：ふつうのチャットボットとの三つの違い](https://www.youtube.com/watch?v=JsNbFnT0QCw&t=261s)

### 長く動くエージェントの三つの型 — Addy Osmani（2026年6月）

```youtube
l6KeLCuB90o
3 patterns to build long-running AI agents
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=l6KeLCuB90o)

- [0:57：成り立つための三つの条件](https://www.youtube.com/watch?v=l6KeLCuB90o&t=57s)
- [2:28：自分の仕事を採点させない](https://www.youtube.com/watch?v=l6KeLCuB90o&t=148s)
- [3:59：三つの壁](https://www.youtube.com/watch?v=l6KeLCuB90o&t=239s)

### MCPサーバーを作る — Smitha Kolan（2026年6月）

```youtube
wBnnA8aIxUs
How to build an AI Agent and MCP Server (step-by-step)
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=wBnnA8aIxUs)

- [0:55：一覧を尋ね、呼び出す](https://www.youtube.com/watch?v=wBnnA8aIxUs&t=55s)
- [1:41：四つの利点](https://www.youtube.com/watch?v=wBnnA8aIxUs&t=101s)
- [3:43：サーバーのコードの四つの部分](https://www.youtube.com/watch?v=wBnnA8aIxUs&t=223s)
- [6:50：ADKの画面で動かす](https://www.youtube.com/watch?v=wBnnA8aIxUs&t=410s)

### MCPとAPI — Smitha Kolan（2026年7月）

```youtube
185XGEMefgc
MCP vs API: Why traditional APIs are failing AI agents
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=185XGEMefgc)

- [1:51：APIは札のない鍵付きの棚](https://www.youtube.com/watch?v=185XGEMefgc&t=111s)
- [4:24：コード上の契約と、意味上の取り決め](https://www.youtube.com/watch?v=185XGEMefgc&t=264s)
- [7:04：APIの上のMCP](https://www.youtube.com/watch?v=185XGEMefgc&t=424s)
- [8:49：普及、安全、考え方の切り替え](https://www.youtube.com/watch?v=185XGEMefgc&t=529s)

### 複数エージェント入門 — Greg Baugues（2026年6月）

```youtube
0Z0GUDakR_A
Intro to multi-agent systems with ADK
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=0Z0GUDakR_A)

- [0:13：エージェントの定義](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=13s)
- [4:11：最初のツール](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=251s)
- [8:06：出典のURLが作られてしまう](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=486s)
- [8:32：URLを確かめるエージェント](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=512s)
- [11:02：分けることで得られる制御](https://www.youtube.com/watch?v=0Z0GUDakR_A&t=662s)
