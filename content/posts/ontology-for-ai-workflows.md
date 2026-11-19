---
title: "AIに業務を任せる前に、何を書いておくか — オントロジーの中身と、標準と製品の違い"
date: "2026-11-19"
updatedAt: "2026-11-19"
description: "業務にAIエージェントを組み込む話のなかで「オントロジー」という言葉が使われるとき、そこには対象、関係、制約、行為、権限、状態の変化といった、別々の種類の定義が含まれています。返金対応という一つの業務を仮の例にして、何をどう書くのかを順に確かめます。用語集、データベースのスキーマ、タクソノミー、ナレッジグラフ、セマンティックレイヤーとの違いと重なりを整理し、W3Cの標準（RDF、OWL、SHACL）と、Palantir Foundry、Microsoft Fabric IQという製品のオントロジーを、2026年11月時点の公式資料と公式の動画をもとに比べます。向く場面と要らない場面、費用、権限とデータ品質の限界も扱います。"
tags: [AIエージェント開発]
category: engineering
lang: ja
draft: true
graph: false
---

返金の依頼が届いたとします。担当者は注文を調べ、支払いの記録を確かめ、金額が大きければ上長に回し、承認が出たら返金の処理をして、顧客に連絡します。この仕事をAIエージェントに手伝わせようとすると、すぐに困ることがあります。「注文」はどの表のどの行なのか。「返金できる」のはどういう場合か。誰の承認が要るのか。処理したことは、どこに残るのか。

担当者はこれを知っています。ただ、その知識は表の定義と、社内の規程と、画面の作りと、人の頭に分かれて入っています。「オントロジー」という言葉が、業務へのAIの組み込みと一緒に語られるようになったのは、この分かれた知識を、人にも機械にも読める一か所の定義にまとめようという話だからです。

ところが、この言葉は使う人によって指すものがかなり違います。W3Cの標準を指す人もいれば、特定の製品の機能を指す人もいます。2026年11月時点の公式の仕様、ドキュメント、動画をもとに、中身を分けて確かめます。

## 目次

- [オントロジーという言葉が指すもの](#what)
- [一つの業務で考える：返金の対応](#example)
- [隣の言葉との違いと重なり](#neighbors)
- [標準のオントロジー：RDF、OWL、SHACL](#standards)
- [製品のオントロジー：PalantirとMicrosoft](#products)
- [AIはそれを何に使うのか](#agent)
- [小さく始める手順](#steps)
- [向く場面、要らない場面、費用](#fit)
- [言いすぎになりやすい四つのこと](#limits)
- [参考資料](#sources)
- [参考動画と見どころ](#videos)

## オントロジーという言葉が指すもの {#what}

もとは哲学の言葉で、何が存在するのかを問う分野の名前です。計算機科学では、1980年代のAI研究で別の意味で使われるようになり、1990年代には、システムどうしの相互運用を意識した定義が広まりました。よく引かれるのはTom Gruberの定義で、オントロジーとは、ある分野の知識を表すための基本の部品をそろえたものだ、というものです。部品はふつう、クラス（ものの種類）、属性、関係の三つで、それぞれの意味と、矛盾なく使うための制約が添えられます（[Gruber、Encyclopedia of Database Systems](https://tomgruber.org/writing/definition-of-ontology)）。Gruber自身は、この定義は用語集から論理の体系まで含んでしまうほど広い、という批判があることにもふれ、実用上は「何に使うか」で決まる工学の道具だと述べています。

業務とAIの文脈では、行為の扱いが前に出てきます。Palantirは公式の解説動画で、オントロジーを「事業を構成する名詞と動詞」と呼び、判断のためにはデータ、ロジック、アクションの三つが要ると説明しています（[0:00〜](https://www.youtube.com/watch?v=YDAxITCNcko&t=0s)）。名詞にあたるのが対象と関係で、動詞にあたるのが行為です。Palantirの製品では、行為を記述するだけでなく、それを実行する機能までがオントロジーに含まれます。

この記事では、業務のオントロジーに書かれるものを七つに分けて扱います。

| 書くもの | 答える問い |
|---|---|
| 概念 | この業務で使う言葉は何を指すか |
| 対象 | どんな種類のものがあり、どんな属性を持つか |
| 関係 | 対象どうしはどうつながるか |
| 制約 | どういう状態が許され、どういう状態が許されないか |
| 行為 | 何を変えてよく、変えるときに何が起きるか |
| 権限 | 誰が見てよく、誰が変えてよいか |
| 状態の変化 | 対象はどの状態からどの状態へ移れるか |

この分け方は筆者の整理です。標準にも製品にも、このとおりの七分類があるわけではありません。分けておくと、ある道具がどこまでを受け持ち、どこから先は別の仕組みに任せているのかが見やすくなります。

## 一つの業務で考える：返金の対応 {#example}

ここから先は、筆者が作った仮の例を使います。小さな通販の会社で、返金の依頼を処理する仕事です。実在の会社の業務ではありません。

七つの欄を、この仕事で埋めてみます。

| 書くもの | 返金の対応での中身（仮の例） |
|---|---|
| 概念 | 「返金」は支払い済みの金額の全部または一部を顧客に戻すこと。ポイントでの補償は含まない |
| 対象 | 顧客、注文、支払い、返金依頼。返金依頼は金額、理由、状態、受付日を持つ |
| 関係 | 顧客は注文を持つ。注文は支払いを持つ。返金依頼は一つの注文に対して出される |
| 制約 | 返金額は0より大きく、その注文の支払い額を超えない。受付は納品から30日以内 |
| 行為 | 返金を承認する、差し戻す、返金を実行する。実行すると決済サービスに返金の指示が出て、顧客に通知が届く |
| 権限 | 担当者は依頼を見て、5万円以下なら承認できる。5万円を超えるものは責任者だけが承認できる。カード番号は誰にも見せない |
| 状態の変化 | 受付 → 承認待ち → 承認済み → 返金済み。差し戻しは承認待ちからだけ。返金済みからは戻れない |

埋めてみると、七つの欄がふだんは別々の場所にあることが分かります。対象と関係はデータベースの表にあります。概念は社内の用語集か、誰かの頭にあります。制約と権限は規程の文書と、業務システムのプログラムに分かれています。行為と状態の変化は、画面のボタンと、その裏の処理です。

人の担当者なら、研修と経験でこれらを結びつけます。AIエージェントには、結びつけた形で渡す必要があります。表の定義だけを渡しても、「5万円を超えたら責任者」は表のどこにも書いてありません。

## 隣の言葉との違いと重なり {#neighbors}

オントロジーの隣には、似た言葉がいくつもあります。先ほどの七つの欄のどこを受け持つかで並べると、違いが見えます。

| 言葉 | 主に受け持つもの | 返金の例でいうと |
|---|---|---|
| 用語集 | 概念 | 「返金」の定義の文章 |
| データベースのスキーマ | 対象、関係、一部の制約 | 返金依頼の表、注文への外部キー、金額は数値という型 |
| タクソノミー | 概念の上下関係 | 返金の理由を「不良」「誤配送」「顧客都合」に分け、さらに細かく分ける木 |
| ナレッジグラフ | 対象と関係の実例 | 「田中さんの注文1024に対する返金依頼77」という具体的なつながりの集まり |
| セマンティックレイヤー | 概念と指標の計算方法 | 「返金率」は返金済みの金額を売上で割ったもの、という一つの定義 |
| オントロジー | 上の定義の側をまとめ、制約を加える。製品によっては行為と権限まで | 七つの欄の全部、またはその一部 |

重なりは大きく、線の引き方は人や製品によって違います。そのうえで、区別しておくと役に立つ点が三つあります。

一つめは、スキーマとの違いです。スキーマは、データをどう保存するかの定義です。オントロジーは、業務でそれをどう呼び、どう扱うかの定義です。Gruberは、データベースの主キーは設計の都合で付けた識別子で、分野のなかの何かを指しているわけではない、という例を挙げています。Palantirのドキュメントは逆の方向から、オブジェクトの種類は表に、オブジェクトは行に、プロパティは列に、リンクは結合に対応する、という対応表を載せています（[Core concepts](https://www.palantir.com/docs/foundry/ontology/core-concepts/)）。実際には、スキーマの上に業務の名前と意味をかぶせる形になることが多い、ということです。

二つめは、ナレッジグラフとの違いです。オントロジーが型の定義で、ナレッジグラフはその型に沿った実例の集まり、という使い分けが一般的です。ただし、オントロジーを作ったからといって、データをグラフの形で持つ必要はありません。この点は後でMicrosoftの資料で確かめます。

三つめは、セマンティックレイヤーとの違いです。セマンティックレイヤーは、分析のための層として育ってきました。Snowflakeのセマンティックビューは、業務上の実体にあたる論理的な表と、その関係、ファクト、ディメンション、指標を定義するもので、列の名前が `amt_ttl_pre_dsc` のように読みにくくても「総売上」として扱えるようにし、「純売上」の計算式を一か所に決める、と説明されています（[Snowflake、Overview of semantic views](https://docs.snowflake.com/en/user-guide/views-semantic/overview)）。中心にあるのは、数字を正しく集計することです。セマンティックビューにも閲覧の権限はありますが、業務上の行為とその実行の認可は、ふつうこの層の仕事ではありません。

## 標準のオントロジー：RDF、OWL、SHACL {#standards}

オントロジーを書くための標準は、W3Cが20年以上かけて整えてきました。役割の違う三つを押さえておけば足ります。

RDFは、情報を「主語、述語、目的語」の三つ組で表すデータモデルです。「返金依頼77」「対象の注文」「注文1024」のように書きます。OWL 2は、その上でクラスや属性や個体を定義し、形式的に意味が決まるようにしたオントロジー言語です（[OWL 2 Overview](https://www.w3.org/TR/owl2-overview/)）。定義から新しい事実を導く推論ができます。SHACLは、RDFのデータが決めた条件を満たしているかを検証する言語で、条件を「シェイプ」として書きます（[SHACL](https://www.w3.org/TR/shacl/)）。

状況も確かめておきます。OWL 2の第2版は2012年12月、SHACLは2017年7月にW3C勧告になっており、現在も有効な標準です。後継の作業が進んでいて、RDF 1.2の中核の仕様は2026年11月16日付の勧告候補の草案、SHACL 1.2の中核は同じ日付の作業草案です（[RDF 1.2 Concepts](https://www.w3.org/TR/rdf12-concepts/)、[SHACL 1.2 Core](https://www.w3.org/TR/shacl12-core/)）。どちらも勧告にはなっていません。

返金の例の制約を、SHACLで書いてみます。次のコードは書き方を示すための例で、検証器にかけて確かめたものではありません。

```turtle
@prefix ex:  <https://example.com/shop#> .
@prefix sh:  <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:RefundRequestShape
    a sh:NodeShape ;
    sh:targetClass ex:RefundRequest ;
    sh:property [
        sh:path ex:forOrder ;          # 対象の注文は一つだけ
        sh:class ex:Order ;
        sh:minCount 1 ;
        sh:maxCount 1 ;
    ] ;
    sh:property [
        sh:path ex:amount ;            # 返金額は一つで、0より大きい数
        sh:datatype xsd:decimal ;
        sh:minExclusive 0 ;
        sh:minCount 1 ;
        sh:maxCount 1 ;
    ] ;
    sh:property [
        sh:path ex:status ;            # 状態は一つで、決まった値のどれか
        sh:in ( "受付" "承認待ち" "承認済み" "返金済み" "差し戻し" ) ;
        sh:minCount 1 ;
        sh:maxCount 1 ;
    ] .
```

これで書けたのは、返金依頼は注文を一つ持つ、金額を一つ持ち、それは正の数である、状態を一つ持ち、それは五つのどれかである、という三つです。「返金額は注文の支払い額を超えない」は、返金依頼から注文をたどって別の値と比べる必要があるので、この書き方では足りません。たとえばSPARQLを使う拡張や、アプリケーションの側の検査で補うことになります。

そして、この例が扱っていないものがあります。「承認待ちからしか差し戻せない」という状態の移り方。「5万円を超えたら責任者だけ」という権限。「返金を実行すると決済サービスに指示が出る」という行為。この例は、状態の移り変わりも、操作する人もデータとして表していません。RDFやOWLでそれらを記述し、SHACLで条件を検査することはできますが、SHACLが返すのは、渡されたデータが条件に合うかどうかの検証結果です。その結果を実際の承認や決済に効かせ、権限のない操作を拒み、何が起きたかを記録するには、実行する側の仕組みが別に要ります。RDF、OWL、SHACLが直接受け持つのは、七つの欄のうち、概念、対象、関係、制約の記述と検証だ、と考えるとおおよそ合っています。

標準を土台にしてエージェントの基盤を組む設計の例として、AWSの設計ガイドがあります。RDF、OWL、SPARQL、SHACLなどのW3C標準に沿い、既存のデータを移さずにオントロジー経由で問い合わせる仕組み（仮想ナレッジグラフ）と、OWLの推論器、SHACLの検証器を組み合わせ、エージェントにはMCPなどの口から使わせる、という構成です（[AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/semantic-layer-agentic-ai-ontology-reasoning-virtual-knowledge-graph/semantic-layer-agentic-ai-ontology-reasoning-virtual-knowledge-graph.html)）。設計の手引きであり、特定の導入の結果を報告するものではありません。

## 製品のオントロジー：PalantirとMicrosoft {#products}

同じ「オントロジー」という名前で、範囲の違うものを提供している製品が二つあります。どちらも、W3Cの標準をそのまま実装したものではありません。

### Palantir Foundry：行為まで含める

Palantirのドキュメントは、オントロジーを組織の「運用の層」と呼び、二種類の要素からなると説明しています。意味の要素（オブジェクト、プロパティ、リンク）と、動きの要素（アクション、関数、動的な権限）です（[Ontology overview](https://www.palantir.com/docs/foundry/ontology/overview/)）。

動きの要素の中心がアクションタイプです。オブジェクトやプロパティやリンクへの一まとまりの変更を定義したもので、変更に伴う副作用も含みます（[Action types](https://www.palantir.com/docs/foundry/action-types/overview/)）。副作用には通知と、外部のシステムにリクエストを送るWebhookがあります。返金の例なら、「返金を実行する」というアクションタイプが、返金依頼の状態を変え、決済サービスを呼び、顧客に通知する、という形になります。

制約と権限にあたるものもアクションの側にあります。送信条件（submission criteria）は、アクションを送信できる条件を、利用者の属性やパラメータの値を組み合わせて書くものです。ドキュメントの例は航空会社で、便に割り当てる機体を変えるアクションを、運航管理者のグループに属する利用者だけが、運用中の機体に対してだけ送信できるようにしています（[Submission criteria](https://www.palantir.com/docs/foundry/action-types/submission-criteria/)）。「5万円を超える返金は責任者だけ」は、この仕組みで書ける種類の条件です。読み取りの側には、行と列の単位で見える範囲を絞るセキュリティポリシーがあります（[Object and property security policies](https://www.palantir.com/docs/foundry/object-permissioning/object-security-policies/)）。

履歴については、アクションログという仕組みがあり、ログを設定したアクションタイプについて、成功した送信を一件ごとにオブジェクトとして記録し、変更されたオブジェクトと結びつけます（[Action log](https://www.palantir.com/docs/foundry/action-types/action-log/)）。

外のエージェントとの接続は、2026年に動きがありました。Ontology MCPは、アプリケーションに含めたオブジェクトタイプ、アクションタイプ、問い合わせ用の関数を、MCPのツールとして外部のエージェントに公開する機能で、2026年6月25日付の告知で一般提供になりました（[Announcements、2026年6月](https://www.palantir.com/docs/foundry/announcements/2026-06)）。名前の似たPalantir MCPは別物で、こちらはオントロジーの型を作ったり直したりする開発者向けの道具であり、オントロジーのデータは書き込めない、と区別されています（[Ontology MCP](https://www.palantir.com/docs/foundry/ontology-mcp/overview/)）。

### Microsoft Fabric IQ：意味と対応づけを中心にする

MicrosoftのFabric IQにもオントロジーという項目があります。ドキュメントの定義は、事業を機械が理解できる形で共有するための表現で、エンティティタイプ、プロパティ、関係、ルール、指標を定義し、それを実際のデータに対応づけるもの、です（[What is ontology (preview)?](https://learn.microsoft.com/en-us/fabric/iq/ontology/overview)）。2026年11月時点でプレビューの扱いで、以前の版の操作画面は2027年1月31日に終了すると書かれています。

Palantirと比べると、違いが三つあります。

一つめは、ルールの書き方です。Fabricのルールは自然言語で書きます。ドキュメントの例は「冷凍品を保管する冷蔵設備の温度が、その製品の上限を20分を超えて上回ったとき、コールドチェーンの例外とする」というもので、関係するエンティティタイプやプロパティに結びつけておきます（[Create and manage business rules](https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-use-rules)）。ドキュメントの説明では、ルールは、対応する利用側が推論のときに使える文脈として渡されます。ここからは筆者の読みです。ルールを定義しただけで、条件を満たさない操作が実行時に必ず拒まれるとは考えず、止める必要のある操作には、実行する側の検査を別に設計しておくのが安全です。

二つめは、データの持ち方です。オントロジーは定義と対応づけを持つ層で、それ自体は問い合わせのエンジンではなく、データは元のシステムに残る、とされています。グラフは任意の実行層で、関係を何段もたどる問いが大事な場合にだけ、必要なデータをグラフに載せます。ふつうの検索や集計や指標は、元のシステムで実行し続けられると書かれています。

三つめは、標準との行き来です。Fabricは、Turtle、RDF、OWLのファイルを空のオントロジーに取り込み、TurtleかRDFで書き出せます。ただし、取り込みの結果が「保持」や成功率100%と表示されても、元の意味がすべて残ったことは保証されず、OWLの制約（restriction）のような対応していない構文は個別に報告されない、という注意書きがあります（[Import and export ontologies](https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-import-export)）。標準で書いたものを製品に持ち込むと、落ちるものがある、ということです。

行為については、Fabricのオントロジーの定義の一覧に、アクションという項目はありません。公式の解説動画では、オントロジーを知識として読み込ませたオペレーションエージェントの側に、「地上作業員を割り当てる」「目視確認を依頼する」といったアクションを追加しています（[7:00〜](https://www.youtube.com/watch?v=S3x8VKjn43M&t=420s)）。該当する場面の画面では、アクションのパラメータはPower Automateのフローに値を渡すものと説明されており、承認が必要なアクションは実行の前にTeamsで依頼が届く、という表示があります。

### 三つを並べる

| 書くもの | RDF、OWL、SHACL | Palantir Foundry | Microsoft Fabric IQ（プレビュー） |
|---|---|---|---|
| 概念、対象、関係 | RDF、OWLのクラスとプロパティ | オブジェクトタイプ、プロパティ、リンクタイプ、インターフェース | エンティティタイプ、プロパティ、関係、名前空間 |
| 既存データとの対応 | R2RMLなど、別の仕様で対応づける | データセットをオブジェクトタイプに対応づける | データバインディング。データは元の場所に残る |
| 制約 | OWLの公理、SHACLのシェイプ | アクションの送信条件、型 | 自然言語のルール |
| 行為 | 記述はできる。実行は別の実装 | アクションタイプと関数、副作用 | オントロジーの外。エージェントの側に設定する |
| 権限 | 記述はできる。アクセス制御は別の実装 | セキュリティポリシー、送信条件 | Fabricの権限と、元のデータの行・列単位の制御に従う |
| 変更の履歴 | 記述はできる。履歴の生成と保存は別の実装 | アクションログ、編集履歴 | 名前付きの版の履歴（オントロジーの定義について） |

この表は、定義、検証、実行を区別するための筆者の整理です。左の列は、この記事で扱ったRDF、OWL、SHACLに限っています。「別の実装」は「できない」という意味ではなく、その仕様には実行の仕組みが含まれておらず、別の仕組みと組み合わせる、という意味です。製品の機能は変わるので、時点にも注意が要ります。

## AIはそれを何に使うのか {#agent}

エージェントの仕事を、参照、計画、実行、検証の四つに分けて、オントロジーがどこで効くのかを見ます。

**参照。** 質問に答えるために、どのデータを見るかを決める場面です。表と列の名前だけを見せるのと、業務の言葉とその対応づけを見せるのとでは、答えの正しさが変わりうる、という実験があります。data.worldの研究者らは、保険業の企業向けスキーマを使ったベンチマークで、GPT-4にSQLデータベースへ直接問い合わせさせたときの正答率が16%、同じデータをオントロジーと対応づけで表したナレッジグラフに対して問い合わせさせたときが54%だったと報告しました。SQLで問い合わせる構成と、ナレッジグラフにSPARQLで問い合わせる構成の比較で、同じ構成に説明文だけを足した比較ではありません（[Sequedaら、2023年](https://arxiv.org/abs/2311.07509)）。一つのスキーマと一つのモデルによる2023年の結果で、著者らはナレッジグラフの製品を持つ会社に属しています。向きを示す材料にはなりますが、ほかの業務やいまのモデルでの数字として使えるものではありません。

**計画。** 何ができるのかを知る場面です。エージェントは、与えられた道具の一覧から手順を組み立てます。Palantirの開発者会議のデモでは、プロジェクト管理の小さなオントロジーをMCPで外に公開し、Microsoft Copilot Studioで作ったアシスタントのツール一覧に、プロジェクトの作成、タスクの割り当て、予算の更新といったアクションが一つずつ並ぶ様子が映っています（[11:30〜](https://www.youtube.com/watch?v=QMKRMEuCoaU&t=690s)）。登壇者は、すべてのアクションがツールになる、と説明します。

このデモには、計画と道具の関係に関わる場面があります。登壇者はアシスタントにプロジェクトの削除を頼み、読み取りだけでなく書き込みもできるので実際に消える、と話します（[13:00〜](https://www.youtube.com/watch?v=QMKRMEuCoaU&t=780s)）。公開されている動画の該当場面の画面では、アシスタントは、いま使えるツールでできるのは一覧、予算の更新、タスクの割り当てで、削除の機能はない、と答えています。話と画面が合っていません。画面のアシスタントは、使える道具にないことを理由に、実行できないと説明しています。ただし、この応答から、実際のツールの設定や、削除が行われたかどうかまでは判定できません。

**実行。** 実際に何かを変える場面です。ここで行為の定義が効きます。エージェントが表を直接書き換えるのではなく、「返金を承認する」という決められたアクションを、決められたパラメータで呼ぶ。Palantirのドキュメントは、Ontology MCPについて、エージェントは定義済みのアクションだけを実行でき、どれを使えるかはアプリケーションの設定で絞る、と説明しています。後のDevCon 5の講演では、看護師役が音声のエージェントと手術室の予定を組み替える案を作り、本番のデータには触れない「シナリオ」という作業用の場所で検討し、管理者役が承認して初めて本番に反映する、という流れを見せています（[2:30〜](https://www.youtube.com/watch?v=dz20P3j3GMc&t=150s)）。登壇者は、紹介した機能の一部は当時まだ開発中だったと断っています。

**検証。** やってよいかを確かめ、やったことを後から確かめる場面です。実行の前には、送信条件やSHACLのような機械的な検査と、人の承認があります。Microsoftの動画では、滑走路の有効幅が25メートルを下回ったという通知がTeamsに届き、担当者が推奨された対応を進めるかどうかを選ぶ画面が映ります（[7:45〜](https://www.youtube.com/watch?v=S3x8VKjn43M&t=465s)）。実行の後には、履歴があります。

四つを通して言えるのは、オントロジーがエージェントに渡すのは賢さではなく、範囲だということです。何を指しているのか、何ができるのか、どこまでしてよいのか。モデルが推測で埋めていた部分を、定義で置き換えます。置き換えた分だけ、定義の正しさに結果が左右されるようになります。

## 小さく始める手順 {#steps}

返金の例に戻って、手順として並べます。特定の製品の操作手順ではなく、どの道具を使っても通る段階を、筆者がまとめたものです。

**1. 一つの業務の、最小のモデルを作る。** 会社全体の地図を描こうとしないことです。返金の対応なら、顧客、注文、支払い、返金依頼の四つの対象と、そのあいだの関係、そして七つの欄を埋めた表が出発点になります。古典的な手引きである「Ontology Development 101」も、最初の手順として分野と範囲を決めることを挙げ、オントロジーを作ることはそれ自体が目的ではない、と書いています（[Noy & McGuinness、2001年](https://protege.stanford.edu/publications/ontology_development/ontology101.pdf)）。

**2. 既存のデータに対応づける。** 「注文」は基幹システムの受注の表、「支払い」は決済サービスの取引の記録、というように、対象と属性を実際のデータに結びつけます。ここで、同じ顧客が二つのシステムで別の番号を持っている、受付日が空の行がある、といった問題が見つかります。Microsoftのドキュメントは、対応づけの前提として、データが整理され、必要な加工を済ませていることを挙げています（[Bind data](https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-bind-data)）。オントロジーはデータの汚れを直しません。

**3. AIに必要な文脈だけを渡す。** エージェントには、モデルの全部ではなく、その仕事に要る部分を見せます。返金の担当エージェントに、仕入れや人事の定義は要りません。Palantirの技術者は講演で、ほとんど同じ見た目のオブジェクトタイプが12個あるような状態を避け、共通する部分をまとめることが、人にもエージェントにも文脈の管理を楽にすると述べています（[4:00〜](https://www.youtube.com/watch?v=_b2qsKz_Ifk&t=240s)）。

**4. 許可した行為だけを実行させる。** エージェントに渡す道具は、「返金依頼を承認する」「差し戻す」のように、業務の単位で切ります。「返金依頼の表を更新する」という広い道具は渡しません。金額の上限や状態の条件は、道具の説明文に書くだけでなく、実行の側で機械的に検査します。

**5. 人の承認と、履歴を入れる。** 5万円を超える返金は、エージェントが案を作り、責任者が承認して初めて実行される、という形にします。誰が、いつ、何を根拠に承認したのかを、後から引ける形で残します。

**6. 変更と保守の手順を決める。** 規程は変わります。上限が5万円から10万円になったとき、定義のどこを誰が直し、誰が確かめ、いつから有効になるのか。定義に版を付け、本番に反映する前に試せる場所を用意します。Microsoftのオントロジーには名前付きの版の履歴があり、Palantirには複数の変更を一つのブランチで試してからまとめて反映する仕組みがあります（[Global Branching](https://www.palantir.com/docs/foundry/foundry-branching/overview/)）。道具が何であれ、定義の持ち主を決めておかないと、定義は現実からずれていきます。

## 向く場面、要らない場面、費用 {#fit}

**向く場面。** 同じ対象を複数のシステムが別の名前で持っていて、それをまたぐ仕事をエージェントにさせたいとき。エージェントに書き込みをさせる、つまり何かを変えさせるとき。同じ定義を、複数のエージェントや画面や分析で使い回したいとき。規程や権限が込み入っていて、文章の指示だけでは守らせきれないとき。

**要らない場面。** 一つの表、一つのシステムのなかで済む仕事。読むだけで、間違えても人がすぐ気づける仕事。文書を探して要約するのが中心で、対象や関係を定義する意味が薄い仕事。まだ業務そのものが固まっておらず、毎週やり方が変わる仕事。こうした場面では、よく書かれた指示と、少数の道具と、既存のスキーマで足りることが多く、オントロジーを作る手間のほうが大きくなります。

**費用。** 費用は三つの場所で発生します。最初に、業務を知る人と、データを知る人が、言葉の定義を合わせる時間です。「返金」にポイントでの補償を含むのかどうかは、道具が決めてくれません。次に、データを対応づけられる状態にする作業です。そして、いちばん見落とされやすいのが保守です。規程、組織、システムのどれかが変わるたびに、定義を直す人が要ります。

製品を使う場合は、依存の費用も加わります。行為や権限の定義は、製品ごとに書き方が違い、製品固有の実行や権限制御の意味まで、そのまま別の製品で再現できるとは限りません。Fabricの取り込みの注意書きが示すように、標準で書いた定義でさえ、製品をまたぐと一部が落ちます。

## 言いすぎになりやすい四つのこと {#limits}

**「グラフのデータベースが要る」。** 要るとは限りません。オントロジーは定義で、保存の形式とは別です。Microsoftのドキュメントは、グラフを任意の実行層とし、関係を何段もたどる問いが大事なときだけ使うものとしています。Palantirの対応表は、オブジェクトタイプが表に、リンクが結合に対応することを示しています。

**「オントロジーがあれば、文書の検索は要らない」。** 置き換えにはなりません。オントロジーが扱うのは、対象と関係として定義できる部分です。規程の本文、過去の問い合わせの記録、契約書のような文章は、別に探して読む必要があります。Microsoftは、事業の実体とデータの文脈を受け持つFabric IQと、方針や公式の文書の文脈を受け持つ別の仕組みを、並べて説明しています（[What is Fabric IQ?](https://learn.microsoft.com/en-us/fabric/iq/overview)）。

**「定義を与えれば、AIは間違えなくなる」。** 減らせる間違いと、減らせない間違いがあります。「注文」をどの表から取るか、という種類の取り違えは、対応づけで減らせます。定義そのものが古い、データが欠けている、定義にない状況に出会う、といった間違いは残ります。自然言語のルールは、定義しただけで実行時の拒否まで保証されるものとは扱わず、止める必要のある操作には、実行する側の検査を別に用意します。

**「アクションで絞れば、自動実行は安全」。** 絞ることは安全の条件の一つで、十分条件ではありません。Palantirのドキュメント自身が、限界をいくつも明記しています。AIP Logicでは、モデルが読むデータに対する行と列の単位のアクセス制御が効くのは読み取りのときで、モデルの出力や、モデルが組み立てた編集には及ばない（[AIP Logic](https://www.palantir.com/docs/foundry/logic/overview/)）。送信条件で「グループに属していない」という否定の条件を使うと、権限の一部しか持たないトークンで条件を通ってしまい、意図より広い権限を与えることがある。アクションログが記録するのは成功した送信だけで、失敗は記録されず、アクションを通さない変更も記録されない。外のモデルにMCPで接続する場合は、環境のデータを外部のクライアントに渡すことになるので、組織の方針に合うかを確かめるように、という注意もあります。

許可されたアクションの範囲のなかでも、エージェントは間違った対象に対して正しいアクションを実行できます。返金してよい依頼かどうかを取り違えれば、手続きとしては正しい返金が、間違った相手に出ます。金額の上限、人の承認、取り消しの手段、履歴の確認は、アクションを定義したあとにも要ります。

オントロジーは、業務について人が知っていることを、機械が使える形に書き出したものです。書き出す作業のなかで、定義が人によって違っていたことや、規程と実際の運用がずれていたことが見つかります。AIの導入をきっかけにこの言葉が広まっていますが、筆者の見るところ、手間の多くは、AIが登場する前からあった、業務の言葉をそろえる仕事です。

## 参考資料 {#sources}

**定義と標準**

- Tom Gruber, [Ontology](https://tomgruber.org/writing/definition-of-ontology)（Encyclopedia of Database Systems、2009年）
- Natalya F. Noy, Deborah L. McGuinness, [Ontology Development 101: A Guide to Creating Your First Ontology](https://protege.stanford.edu/publications/ontology_development/ontology101.pdf)（2001年）
- W3C, [OWL 2 Web Ontology Language Document Overview (Second Edition)](https://www.w3.org/TR/owl2-overview/)（勧告、2012年12月11日）
- W3C, [Shapes Constraint Language (SHACL)](https://www.w3.org/TR/shacl/)（勧告、2017年7月20日）
- W3C, [SHACL 1.2 Core](https://www.w3.org/TR/shacl12-core/)（作業草案、2026年11月16日）
- W3C, [RDF 1.2 Concepts and Abstract Data Model](https://www.w3.org/TR/rdf12-concepts/)（勧告候補の草案、2026年11月16日）

**Palantir**

- [Ontology overview](https://www.palantir.com/docs/foundry/ontology/overview/)、[Core concepts](https://www.palantir.com/docs/foundry/ontology/core-concepts/)
- [Action types](https://www.palantir.com/docs/foundry/action-types/overview/)、[Submission criteria](https://www.palantir.com/docs/foundry/action-types/submission-criteria/)、[Action log](https://www.palantir.com/docs/foundry/action-types/action-log/)
- [Object and property security policies](https://www.palantir.com/docs/foundry/object-permissioning/object-security-policies/)、[AIP Logic](https://www.palantir.com/docs/foundry/logic/overview/)
- [Ontology MCP](https://www.palantir.com/docs/foundry/ontology-mcp/overview/)、[Sample architecture](https://www.palantir.com/docs/foundry/ontology-mcp/sample-architecture/)、[Global Branching](https://www.palantir.com/docs/foundry/foundry-branching/overview/)
- [Announcements、2026年6月](https://www.palantir.com/docs/foundry/announcements/2026-06)（Ontology MCPとPalantir MCPの一般提供）

**Microsoft**

- [What is Fabric IQ?](https://learn.microsoft.com/en-us/fabric/iq/overview)、[What is ontology (preview)?](https://learn.microsoft.com/en-us/fabric/iq/ontology/overview)
- [Create and manage business rules in ontology (preview)](https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-use-rules)、[Bind data](https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-bind-data)
- [Import and export ontologies (preview)](https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-import-export)、[Get started with agent integration for ontology (preview)](https://learn.microsoft.com/en-us/fabric/iq/ontology/concepts-agent-integration)

**そのほか**

- Snowflake, [Overview of semantic views](https://docs.snowflake.com/en/user-guide/views-semantic/overview)
- AWS Prescriptive Guidance, [Semantic Layer for Agentic AI using Ontology, Symbolic Reasoning, and Virtual Knowledge Graph](https://docs.aws.amazon.com/prescriptive-guidance/latest/semantic-layer-agentic-ai-ontology-reasoning-virtual-knowledge-graph/semantic-layer-agentic-ai-ontology-reasoning-virtual-knowledge-graph.html)
- Juan Sequeda, Dean Allemang, Bryon Jacob, [A Benchmark to Understand the Role of Knowledge Graphs on Large Language Model's Accuracy for Question Answering on Enterprise SQL Databases](https://arxiv.org/abs/2311.07509)（2023年）

製品のドキュメントと動画は各社による説明で、機能の提供状況は2026年11月時点のものです。

## 参考動画と見どころ {#videos}

### Palantir — Palantir Ontology Overview（2025年11月）

```youtube
YDAxITCNcko
Palantir Ontology Overview
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=YDAxITCNcko)

- [0:00：オントロジーは事業の「名詞と動詞」](https://www.youtube.com/watch?v=YDAxITCNcko&t=0s)
- [0:40：判断に要る三つ。データ、ロジック、アクション](https://www.youtube.com/watch?v=YDAxITCNcko&t=40s)
- [3:00：言語モデルにオントロジーを文脈として渡す](https://www.youtube.com/watch?v=YDAxITCNcko&t=180s)

### Microsoft Mechanics — Operations Context for AI | Ontology in Fabric IQ（2026年4月）

```youtube
S3x8VKjn43M
Operations Context for AI | Ontology in Fabric IQ
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=S3x8VKjn43M)

- [1:15：既存のセマンティックモデルからオントロジーを生成する](https://www.youtube.com/watch?v=S3x8VKjn43M&t=75s)
- [4:45：オントロジーにルールを書き加える](https://www.youtube.com/watch?v=S3x8VKjn43M&t=285s)
- [6:00：オペレーションエージェントにオントロジーを読み込ませる](https://www.youtube.com/watch?v=S3x8VKjn43M&t=360s)
- [7:00：エージェントにアクションを追加する](https://www.youtube.com/watch?v=S3x8VKjn43M&t=420s)
- [7:45：Teamsに届く通知と、人による承認](https://www.youtube.com/watch?v=S3x8VKjn43M&t=465s)

### Palantir Developers — Product Launch: AIP Agents and Ontology-MCP | DevCon 4（2026年2月）

```youtube
QMKRMEuCoaU
Product Launch: AIP Agents and Ontology-MCP | DevCon 4
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=QMKRMEuCoaU)

- [2:00：デモ用の小さなオントロジー。プロジェクト、タスク、人、報告](https://www.youtube.com/watch?v=QMKRMEuCoaU&t=120s)
- [11:30：Copilot Studioのツール一覧に、アクションが並ぶ](https://www.youtube.com/watch?v=QMKRMEuCoaU&t=690s)
- [13:00：削除を頼む場面。説明と画面の応答が食い違う](https://www.youtube.com/watch?v=QMKRMEuCoaU&t=780s)
- [15:45：権限の考え方。サービス用の利用者か、利用者本人の権限か](https://www.youtube.com/watch?v=QMKRMEuCoaU&t=945s)

### Palantir Developers — Product Launch: Ontology Foundations | DevCon 5（2026年3月）

```youtube
dz20P3j3GMc
Product Launch: Ontology Foundations | DevCon 5
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=dz20P3j3GMc)

- [2:30：本番に触れずに案を試す「シナリオ」](https://www.youtube.com/watch?v=dz20P3j3GMc&t=150s)
- [4:05：管理者による承認と本番への反映](https://www.youtube.com/watch?v=dz20P3j3GMc&t=245s)
- [9:00：役割ごとに見える範囲を変えるセキュリティポリシー](https://www.youtube.com/watch?v=dz20P3j3GMc&t=540s)
- [14:20：複数の変更を、全部成功か全部取り消しかにする](https://www.youtube.com/watch?v=dz20P3j3GMc&t=860s)
