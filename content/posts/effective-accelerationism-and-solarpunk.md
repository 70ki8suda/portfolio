---
title: "効果的加速主義（e/acc）入門 — ソーラーパンクと並べて読む、技術と未来の考え方"
date: "2026-11-11"
description: "e/accは、技術と市場の成長を速めることを良しとする思想です。2022年の原典、Marc Andreessenの宣言、提唱者Guillaume Verdonの対談、Vitalik Buterinのd/accを手がかりに、その主張と批判を整理し、ソーラーパンクとの共通点と違いを考えます。"
tags: [e/acc, ソーラーパンク, 技術と社会]
lang: ja
draft: false
graph: true
---

[ソーラーパンク入門](/blog/solarpunk-introduction)では、緑の未来都市の絵に描かれにくい発電設備や工場、維持管理の仕事、そして誰がどう決めるのかという問題を取り上げました。

同じく「未来は良くできる」と考えながら、別の方向を向いた思想があります。2022年ごろからSNSで広まった効果的加速主義、略してe/acc（イー・アック）です。技術と市場の成長は止めず、むしろ速めるべきだと主張し、AI規制をめぐる議論のなかで名前が知られるようになりました。

元動画は[記事の最後](#videos)に埋め込んでいます。

## 目次

- [e/accとは何か、何と混同しやすいか](#what)
- [原典の主張と、物理学の言葉の扱い方](#origin)
- [Andreessenの「テクノ楽観主義者宣言」](#andreessen)
- [提唱者Verdonは対談で何を語ったか](#verdon)
- [e/accへの批判](#critique)
- [d/acc：何を速めるかを選ぶ](#dacc)
- [ソーラーパンクと並べて考える](#compare)
- [e/accを読み解くための5つの問い](#questions)
- [参考動画と見どころ](#videos)

## e/accとは何か、何と混同しやすいか {#what}

e/accは、Xの匿名アカウント「@BasedBeffJezos（Beff Jezos）」とその周辺から生まれた考え方です。Beff Jezosは、物理学者Guillaume Verdonの別名です。2023年の対談では、計算機ハードウェア企業Extropicの創業者として紹介されています。[Lex Fridman Podcast #407：2:23〜](https://www.youtube.com/watch?v=8fEEbKJoNbU&t=143s)

名前が似ているため、次の言葉と混同されがちです。

| 言葉 | どういうものか | e/accとの関係 |
| --- | --- | --- |
| 効果的利他主義（EA） | 最も差し迫った問題と最善の解決策を研究し、実践する運動。感染症対策やAIの危険の研究にも取り組む | 名前はEAを意識したもの。原典は、汎用人工知能（AGI）の開発に反対するEAの一部とe/accを対比している |
| 一般の加速主義 | フランス現代思想やNick Landに由来し、左派・右派の多様な派生がある。社会の崩壊を暴力で早めようとする極右の用法もある | 原典は、資本主義を一種の知性とみる見方がLandにもあると注記する。一方で、世間で心配されている加速主義とは違うとも述べる |
| テクノ楽観主義 | 技術の進歩が暮らしを良くすると考える立場の総称 | e/accはその強い形の一つ。テクノ楽観主義者がみなe/accを名乗るわけではない |
| d/acc | Vitalik Buterinが提案した、防御や分散に役立つ技術を優先して速める考え方 | e/accへの応答として書かれた |

EAの定義は[運営団体の解説](https://www.effectivealtruism.org/articles/introduction-to-effective-altruism)、加速主義の系譜は[Wikipediaの概説](https://en.wikipedia.org/wiki/Accelerationism)、e/acc側の自己規定は[e/acc is leaderless](https://effectiveaccelerationism.substack.com/p/eacc-is-leaderless)によります。e/acc側は指導者がおらず右でも左でもないと述べますが、これは自己規定であり、名乗る人の考えにも幅があります。

## 原典の主張と、物理学の言葉の扱い方 {#origin}

2022年7月、Beff Jezosとbayeslordらの名義で原則のノートが公開されました。[Notes on e/acc principles and tenets](https://beff.substack.com/p/notes-on-eacc-principles-and-tenets)

ノートは、生命も知性も市場も、エネルギーを取り込んで秩序を保つ同じ適応の原理から説明します。そこから、多様な試みが競う市場は中央の計画より優れ、過剰な規制は進歩を遅らせると論じます。また、知性が生物の体にとどまる必要はないという立場もとります。同年12月のニュースレターの入門記事は、脱成長を批判し、エネルギー（短期的には核分裂）、人口と経済の成長、AGI、宇宙への進出を目標に挙げました。一方で、人類の繁栄を中心的な価値とする書き方もしています。[what the f* is e/acc](https://effectiveaccelerationism.substack.com/p/what-the-f-is-eacc)

物理学の言葉が多いので、主張全体が科学で裏づけられているように見えるかもしれません。読むときは三つの段階を分けておく必要があります。

| 段階 | 原典の例 | 性質 |
| --- | --- | --- |
| 物理学の主張 | エネルギーを取り込む構造は統計的に生まれやすい | 物理学の文献で検証される問題 |
| 社会への類推 | 市場も同じ原理で働く「知性」と見なせる | 類推。市場の働きは経済学や歴史で別に確かめる |
| 規範 | だから成長を速めるべきだ | 事実から直接は出てこない価値判断 |

自然界でエネルギーを多く使う構造が生まれやすいとしても、人間社会がそれを目指すべきかは別の問題です。

## Andreessenの「テクノ楽観主義者宣言」 {#andreessen}

e/accとよく並べて語られるのが、投資会社Andreessen Horowitzの共同創業者Marc Andreessenが2023年10月に公開した宣言です。[The Techno-Optimist Manifesto](https://a16z.com/the-techno-optimist-manifesto/)

e/accの公式文書ではありませんが、末尾の推薦人物の一覧に@BasedBeffJezosと@bayeslordが挙がっています。宣言は、技術と市場が豊かさを生むと述べ、核分裂や核融合によるエネルギーの拡大と、AIの開発を強く支持します。そのうえで、「持続可能性」「予防原則」「脱成長」「技術倫理」などを進歩の敵として名指ししました。

ただし、環境破壊を肯定した文書と要約するのは不正確です。Andreessenは、技術と環境は両立でき、停滞した社会のほうが環境を損なうと主張しています。また、自分はユートピア主義者ではないとも書いています。

## 提唱者Verdonは対談で何を語ったか {#verdon}

2023年12月、VerdonはLex Fridmanと約3時間対談しました。[公式transcript](https://lexfridman.com/guillaume-verdon-transcript/)

Verdonはe/accを、人間・技術・資本・情報が結びついた系の成長を後押しする、楽観的な運動だと説明します。中核の主張だけを持つ薄い枠組みで、ソフトウェアのように多くの派生（フォーク）があってよい、とも言います。Vitalikのd/accも派生の一つとして挙げ、e/accとEAの中間を探るものと評しました。これはVerdon側の評価です。[Lex Fridman Podcast #407：1:47:18〜](https://www.youtube.com/watch?v=8fEEbKJoNbU&t=6438s)

安全については、無謀だという見方に反論しています。AIを提供する者は結果に責任を負うべきで、責任を負う企業は信頼できるAIを選ぶから、市場がより安全なAIを選び出す、という考えです。第三者による評価も需要から生まれると見ています。反対するのは、研究費の比率を一律に定めるような規制や、既存の大企業と政府の結びつきです。[Lex Fridman Podcast #407：36:57〜](https://www.youtube.com/watch?v=8fEEbKJoNbU&t=2217s)

安全を重視しつつ、それを確保する仕組みとして市場を信頼する立場です。

## e/accへの批判 {#critique}

AIのリスクを重く見る書き手Zvi Mowshowitzは、実名特定を非難しつつ、Beff Jezosの描く未来は人間の生存に十分な重みを置いていないと批判しました。同時に、e/accを名乗る人の多くはそこまでの立場をとっていないとも書いています。[Based Beff Jezos and the Accelerationists](https://thezvi.substack.com/p/based-beff-jezos-and-the-accelerationists)

政治とメディアの研究者Dave Karpfは、テクノ楽観主義は政治思想ではないというAndreessenの自己規定に反論しました。未来を投資家や起業家に任せよという政策上の要求を伴い、投資会社の利害とも結びついている、という指摘です。主張の中身がすべて誤りだという批判ではありません。[Parsing the Political Project of Techno-Optimism](https://www.techpolicy.press/parsing-the-political-project-of-techno-optimism/)

## d/acc：何を速めるかを選ぶ {#dacc}

イーサリアムの共同創設者Vitalik Buterinは、2023年11月の論考でd/accを提案しました。[My techno-optimism](https://vitalik.eth.limo/general/2023/11/27/techno_optimism.html)

Vitalikは、技術の利益は大きく、遅らせることにも費用があると認め、多くの点でe/accに共感すると書きます。ただ、大気汚染の改善や太陽光パネルの進歩は、問題を重く見た人々の協調と投資の結果だと説明します。AIについては、監視による全体主義の固定化と、少数への権力集中の両方を警戒します。そこで、攻撃より防御が有利になり、権力を分散させる技術を意図して優先しようと提案しました。dには防御（defensive）、分散（decentralization）、選別（differential）などの意味が重ねられています。

論考の末尾には、ソーラーパンクの人にとってd/accはその一種であり、意図性と集団行動を重んじる点が共通する、という一節があります。これはVitalikによる位置づけであり、ソーラーパンク全体の合意を示すものではありません。

2025年の補足では、防御に加えて「栄える」ための未来像を加え、規制の手段として、損害を与えた者に責任を負わせるルールを第一に挙げました。方向を選ばず分散だけを進める態度は、防御が手薄になると批判しています。[d/acc: one year later](https://vitalik.eth.limo/general/2025/01/05/dacc2.html)

80,000 Hoursの対談では、技術の未来を、止まれない分かれ道にたとえています。また、通信のStarlinkが地上設備への依存を減らしたように、家や村ごとの太陽光発電で電力も自立できないかと問います。d/accへの批判として、誰が資金を出すのか、AIの進歩が速すぎて間に合わないのではないか、という二点を挙げ、応答しています。[80,000 Hours：1:20:42〜](https://www.youtube.com/watch?v=ommevJs80MQ&t=4842s)

## ソーラーパンクと並べて考える {#compare}

ここからは、既存のソーラーパンク入門で扱った暮らしや都市の視点から、e/accを見てみます。

### 重なるところ

[ソーラーパンク入門](/blog/solarpunk-introduction)では、Cole Hastingsの動画を、崩壊ではなく成功した未来を具体的に描こうとする試みとして読みました。e/accの入門記事も、人類の問題は手に負えないという悲観への反発から始まります。

建てることを重視する点も重なります。Alan Fisherは、緑の外観を好みながら工場や物流を見ない態度を批判し、環境を守る制度が住宅や交通の整備を妨げることもあると指摘しました。手続きが重なって何も建たないことへの不満は、Andreessenが官僚主義や拒否権の政治を敵に挙げたことと近いところがあります。

### 分かれるところ

| 問い | e/accの原典・宣言の傾向 | ソーラーパンク記事で問われたこと |
| --- | --- | --- |
| 何を豊かさと数えるか | エネルギーの利用量、成長、価格の低下 | 暮らしやすさ、生態系への負荷、公平さ |
| 誰が決めるか | 市場の競争と多様な試み | 住民や共同体による運営と責任の所在 |
| 誰のための未来か | 原典では、知性が生物の体を離れて広がることも視野に入る | いま街で暮らす人と、ほかの生き物 |
| 速く建てる理由 | 停滞は害であり、減速の費用は大きい | 足りない住まいや交通を、誰の負担で整えるか |

Alanの制度批判とe/accの規制批判は、似た不満から出発しても目的が違います。Alanが求めたのは、駅の近くの住宅を増やし、車なしで暮らせる人を増やす整備でした。e/accの文書が速めたいのは、技術と資本の成長全体です。何を速めたいかによって、規制の評価も変わります。

「分散」の意味も異なります。e/accの原典が想定するのは、多数の企業や集団が競い合うことです。DamiLeeが注目した共同体では、住民が役割と意思決定を分け合います。同じ分散という言葉でも、仕組みは別物です。

### d/accが置く問い

Vitalikが挙げた「意図性と集団行動」は、この違いの中心にあります。e/accは系の自然な成長に任せることを良しとし、d/accとソーラーパンクは、どの技術を誰が何のために使うかを選ぶことを重視します。

仮の例で考えます。ある村の各家庭に、太陽光発電と蓄電池が置かれたとします。送電網が止まっても、電気は止まりにくくなるでしょう。それでも、設備を誰が所有するのか、故障したら誰が直すのか、払えない家庭はどうなるのかは、設備の性能からは決まりません。

既存記事では、完成予想図には維持管理の時間が描かれていないと書きました。エネルギーと知性を増やせば多くのものが安くなるという展望も、何をつくれるかを語っています。それが誰の暮らしにどう届き、誰が保つのかは、別の問いとして残ります。このサイトのトップに置いた稲と水路の風景も、同じ二つの問いから眺めることができます。

## e/accを読み解くための5つの問い {#questions}

| 問い | 具体的に見るところ |
| --- | --- |
| 事実か、類推か、価値判断か | 物理学や経済学の説明が、どこで「だから速めるべきだ」に変わるか |
| 何を速めるのか | 技術全般か、特定の技術か。防御に役立つのか、攻撃にも使えるのか |
| 誰が責任を負うのか | 提供者の法的責任、第三者の評価、政府の規制のどれに頼るのか |
| 誰の利益と結びつくか | 主張する人の事業や投資と、提案する政策はどう関係するか |
| 誰の暮らしに届くのか | 安くなった技術や電力を誰が使えるか。維持の仕事を誰が担うか |

賛成するにしても反対するにしても、この5つを確かめると、どこで意見が分かれているのかが見えやすくなります。

## 参考動画と見どころ {#videos}

### Guillaume Verdon — Lex Fridman Podcast #407

```youtube
8fEEbKJoNbU
Guillaume Verdon: Beff Jezos, E/acc Movement, Physics, Computation & AGI | Lex Fridman Podcast #407
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=8fEEbKJoNbU)（[公式transcript](https://lexfridman.com/guillaume-verdon-transcript/)）

- [2:23：匿名アカウントBeff Jezosと本人の関係](https://www.youtube.com/watch?v=8fEEbKJoNbU&t=143s)
- [36:57：AIの安全、提供者の責任、規制への反対](https://www.youtube.com/watch?v=8fEEbKJoNbU&t=2217s)
- [1:47:18：e/accとは何か、フォークとd/acc](https://www.youtube.com/watch?v=8fEEbKJoNbU&t=6438s)

### Vitalik Buterin — 80,000 Hours

```youtube
ommevJs80MQ
Defensive acceleration & regulating AI when you fear government | Vitalik Buterin
```

[元動画をYouTubeで見る](https://www.youtube.com/watch?v=ommevJs80MQ)（[公式transcript](https://80000hours.org/podcast/episodes/vitalik-buterin-techno-optimism/)）

- [2:43：技術についての三つの見方](https://www.youtube.com/watch?v=ommevJs80MQ&t=163s)
- [1:16:18：d/accとは何か、防御が有利な世界](https://www.youtube.com/watch?v=ommevJs80MQ&t=4578s)
- [1:20:42：電力や食料を自立させる技術](https://www.youtube.com/watch?v=ommevJs80MQ&t=4842s)
- [1:34:56：d/accへの反論と応答](https://www.youtube.com/watch?v=ommevJs80MQ&t=5696s)
