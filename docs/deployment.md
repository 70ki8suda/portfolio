# Cloudflare Workersへの公開

公開URLは https://70ki8suda.com 。`wrangler.jsonc` のCustom Domain設定でWorkerに割り当て、DNSとTLS証明書はCloudflareが管理する。既存の https://70ki8suda-portfolio.telekinesick.workers.dev も引き続き利用できる。

公式のCloudflare ViteプラグインでTanStack StartのSSRと静的アセットをビルドする。Worker名は `70ki8suda-portfolio`。Markdownはサーバービルドに含まれるため、記事の更新には再ビルド・再デプロイが必要。

## ローカルで確認する

Node.js 22.13.0以上を使用する。

Vite 7との互換性を保ちながら既知のサーバー関数の脆弱性を修正するため、Start 1.168.60とRouter 1.170.41を固定している。更新時はViteのpeer dependencyと `npm audit` を確認する。互換日付は同梱workerdがサポートする `2026-11-10` に固定。

```sh
npm ci
npm run test:unit
npm run build
npm run preview -- --port 4173 --strictPort
```

`build` は最初に `graph:update` を実行する。記事変更にAI判断が必要なら具体的なrequestを出して停止するため、執筆AIが[段落グラフの運用手順](content/paragraph-graph.md)に従ってreplyを生成・適用する。分類・タグ・ベクトル・公開JSONの差分を本文とともに検証・commitしてから、clean snapshotをビルドして公開する。生成後に差分が残るsnapshotをそのまま公開しない。更新とbuildは同じロックを共有し、同時に複数の公開を走らせない。

`preview` はビルド済みのアプリをローカルのWorkersランタイムで動かす。先に `build` を実行する。`npm run dev` もWorkersランタイムを使うが、開発用の再読み込みと下書き表示の挙動が異なる。

確認対象は `/`、`/blog`、`/blog/garys-economics-guide`、`/blog/solarpunk-introduction`、`/blog?tag=経済`、存在しない記事とページの404。記事の本文とメタデータがJavaScriptなしのHTTP応答にも含まれること、タグで絞れること、クライアント遷移でエラーが出ないことを確認する。下書きは一覧・直接URL・クライアントに配信するファイルへ公開しない。`BLOG_DRAFTS` と `BLOG_FIXTURES` は開発専用で、本番ビルドでは無効。

公開せずにWranglerの生成物を検証する場合:

```sh
npx wrangler deploy --dry-run
```

Viteが `dist/` と `.wrangler/deploy/config.json` を生成する。Wranglerは後者からビルド済み設定を選ぶため、`--config wrangler.jsonc` を付けない。生成物は編集・commitしない。

## 公開する

担当者がCloudflareの対象アカウントと同名Workerの有無を確認する。同名の別用途Workerを上書きしない。認証が必要なら担当者が `npx wrangler login` を実行する。APIトークンやローカルの認証設定はリポジトリに保存しない。

```sh
npm run deploy
```

このコマンドはビルド後に外部へ公開する。返された `workers.dev` URLとデプロイのバージョンを記録し、そのURLで上記のページ・SSR・タグ・404・静的アセットを再確認する。ローカルbuild成功と公開先での動作確認は別に記録する。

`public/` の内容は原則として公開対象だが、`public/.assetsignore` の `/media/` で旧動画・画像・クレジット（約5.9MB）をアップロード対象から除外する。ローカルのファイルは残す。Viteが `dist/client/.assetsignore` にコピーし、Wranglerが除外ルールを適用する。アプリが将来mediaを使う場合はこのルールも見直す。

## 復旧する

更新前に既存デプロイのバージョンを記録しておく。更新後に問題があれば、対象Workerと戻し先を確認して `npx wrangler rollback <VERSION_ID>` を実行し、公開URLを再検証する。初回公開には戻し先がないため、修正して再デプロイするか、新規作成したWorkerだけを対象に削除を判断する。

## 参照

- [Cloudflare: TanStack Start](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
- [TanStack Start: Hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- [Cloudflare: Static Assets configuration](https://developers.cloudflare.com/workers/static-assets/binding/)

## 動作確認のアクセス計測除外

本番のブラウザ・Orca/CUA・一時検証は、最初のdocumentより前にQAマーカーを設定するか、除外専用の設定ページで停止する。[Web AnalyticsのQA除外手順](web-analytics.md)を参照。別端末・別プロファイルは個別設定が必要。通常読者の計測確認では、不要なPVを送らずbeaconの有無とSPA送信試行を検証する。
