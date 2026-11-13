# GitHubコメントと範囲注釈

記事全体の会話はgiscus/Announcementsの`article:<slug>`で継続する。範囲注釈は本サイトが作るselectorをgiscusのDiscussion本文に保存する。giscus標準だけで範囲一覧を取得できるわけではない。

## 対象の固定

`range:<slug>:<本文SHA256>:<canonical selector SHA256>`をstrict termにする。selectorは元段落anchor、DOM textのhash、UTF-16 offsets、exact、前後32 code points、本文版、renderer版を保持する。同文や強調・リンク跨ぎはDOMのtext nodeを基準にする。最大240 code points・3段落、JSON 3072 bytes、encoded marker 4096 bytes。復元URL6000 bytes・session込みiframe URL8000 bytesを超える場合は切り詰めず選び直す。

本文版や現在のDOMとの厳密一致がない引用は現在本文へ配置しない。旧版の引用とDiscussionは別の会話として閲覧できる。未投稿の選択や空Discussionを投稿済みハイライトとしない。同じtermのDiscussionが複数あれば全て番号別に残し、番号を指定して開く。編集・削除後の曖昧な自動再配置はしない。

OAuth復帰用の非秘密selectorはURLに保持する。認証queryのみ初期router処理前に除去し、sessionはgiscusの形式で保存する。storage拒否時はそのページのメモリだけを使う。sessionを出典・ログ・索引へ含めない。

## 公開索引

`.github/workflows/comment-index.yml`はDiscussion/コメントのイベント、毎時の補完、手動実行で動く。default mainの固定SHAの信頼したコードだけを実行する。

- 取得job: `contents:read`と`discussions:read`。組込み`GITHUB_TOKEN`で当repoのAnnouncementsを全page取得する。
- 公開job: `contents:write`とartifact取得用`actions:read`。この権限自体はbranch限定ではない。コードは固定の`comment-index` branchと2ファイルだけを扱う。
- 新secret・個人token・独自OAuthは不要。記事やmainを公開jobから編集しない。
- giscus Botの固定node ID、category、title、本文marker、strict SHA1とselectorhashを照合する。対象の破損は空結果へ落とさない。コメント本文は複製せず、selector・番号・実件数だけを公開する。
- Discussionとコメント・返信のID/更新時刻/件数を含む完全取得を2回照合。不一致は最大1回再取得し、さらに変化したら前回snapshotを保持する。原子的な同時点snapshotの保証ではない。
- source SHA、生成世代、開始終了時刻、artifact hashをmanifestへ固定し、公開前に共通readerで検査する。5MiB/5000会話を超えた結果は公開しない。
- workflow全体を直列化する。専用branchの取得時の親からcommitを作り、通常fast-forwardだけで更新する。競合・不明なmutation結果は再送しない。初回は専用orphan branchを作る。公開後にrefを読み戻す。

公開JSON: `https://raw.githubusercontent.com/70ki8suda/portfolio/comment-index/annotations.json`。ブラウザは受信量を制限し、表示・復帰時と5分間隔に同時1要求で読む。生成2時間超はstale、未来5分超/不正/欠損はunknown。通信失敗を完全0にしない。raw CDNのキャッシュとActionsの遅延があるため即時反映を保証しない。削除された引用が専用branchのGit履歴から消えるわけではない。

giscus匿名number GETはid/url/存在の確認だけに使う。title/body/category/authorは返らないため、それらの対応は検査済み公開索引に依存する。本文改変の検出は次回索引まで遅れうる。

## 確認と運用

ローカルの既存gh認証で読み取りだけ確認する場合:

```sh
npx tsx scripts/collect-comment-index.ts --local-readonly --output /tmp/annotations.json --source "$(git rev-parse HEAD)" --generation 0:1
```

このコマンドはDiscussion投稿・branch公開を行わない。Actionsの最小権限での実行証拠とは別である。公開処理は信頼したActions artifactだけを対象とする。障害時はAPI認可・ページ取得・manifest・前世代/親SHAを確認し、空索引の手作業作成やforce pushで通さない。

範囲・Unicode・旧版・重複・未知/0件・公開競合はunitとbrowser fixtureで検証する。ユーザー名義の試験投稿は行わない。実OAuth往復や投稿/編集/削除イベントを行っていない場合は、未認証login導線やfixture成功と分けて報告する。
