# Spotify 音楽グラフ

`/knowdes?media=music` は所有者がSpotify接続後に聴いて蓄積された曲のメタデータを、期間を選んで表示する。記事グラフとは別schemaで、曲→アルバム→収録アルバムのクレジットにあるアーティストの関係だけを使う。AI分析、再生回数・人気度等の派生統計、音楽再生は行わない。

操作は記事グラフに合わせてある。「音楽グラフを操作」を押すまでは地図は触れず、押すとパン・ピンチ・ホイール拡縮、「−」「＋」「全体」、期間の切り替え（30日／90日／180日）、背景クリックでの選択解除が使える。「ページ操作へ」かEscapeで戻る。「曲から選ぶ」と詳細ポップアップは従来どおり。

トップページ `/` にも同じ部品（`src/music/HomeMusic.tsx` が `MusicGraph` を再利用）を記事グラフの下に置く。画面の近くへ来るまで取得も描画もせず、離れると外す。「グラフを操作」を押すまではホイール・一本指の縦スクロールはページのもの。Spotifyロゴ、データ説明へのリンク、公開範囲は `/knowdes?media=music` と同じ。

## 接続前の設定

1. 所有者がSpotify Developer Dashboardでログインし、Premium要件と開発用アプリ作成可否を確認する。2026年Development Modeの新規制限は開発者あたり1 Client ID、利用者5人。別用途アプリを勝手に転用しない。
2. 専用アプリのWeb APIを選択。redirect URIは `https://70ki8suda.com/admin/music/callback` と完全一致。PKCEを使い、client secretは不要。scopeは `user-read-recently-played` だけ。
3. Cloudflare Accessで `/admin/music` とその配下を所有者だけに許可する。Worker自身も署名、issuer、audience、有効期間、固定owner subjectを検証する。アクセスできた最初の人を所有者にしない。
4. Cloudflare Configuration RuleのDisable RUMを `(http.request.uri.path eq "/admin/music" or starts_with(http.request.uri.path, "/admin/music/"))` に設定し、実配信にbeaconがないことを確認する。既存EU除外・QA除外は維持。
5. Worker設定 `SPOTIFY_CLIENT_ID`, `MUSIC_ORIGIN=https://70ki8suda.com`, `MUSIC_ACCESS_ISSUER`, `MUSIC_ACCESS_AUD`, `MUSIC_OWNER_SUB` を用意する。`MUSIC_TOKEN_KEY` は暗号学的乱数32bytesをbase64urlで生成し、Wrangler secretへ標準入力で渡す。値をチャット・repo・ログに出さない。RUM除外確認後だけ `MUSIC_ADMIN_PRIVACY_READY=1`。
6. 所有者が管理ページで公開範囲に同意しSpotifyへ接続する。一般閲覧者には接続変更権限がない。未設定時はfail closed。実ログイン・許可は本人操作。

## 保存と更新

SQLite Durable Object `MusicStore` 一つが暗号化トークン、OAuth一時状態、蓄積した音楽メタデータを保存する。

### 蓄積（`MusicState.library`、非公開）

- 対象は接続後に確認できた再生だけ。接続前へさかのぼって集めない。再接続・切断・停止系の失敗では蓄積を消す。
- 同期は1時間ごと。まず `recently-played?limit=50` の最新ページを読み、前回取り込んだ最新再生（`cursor`）より新しい再生がまだ残っていそうな場合だけ、応答の `cursors.before` で古いページへ進む。1回の同期は最大4リクエスト（`SYNC_PAGES`）。接続直後の初回は1ページだけ。
- Spotifyがどこまで古いページを返すかは保証されていない。短時間に多く聴いた分、同期が止まっていた間の分は欠けることがある。全履歴の保証はしない。
- 曲ごとに1件へまとめる。保存するのは公開用に許可した項目（名前、URL、ジャケットURL、クレジット）と、最後に聴いた時刻 `seen`（非公開。並べ替え・期限・期間絞り込みにだけ使う）。再生回数は数えない。
- 同じ曲を聴き直すと、その時点でSpotifyが返した内容に置き換える。個別の再取得APIは使っていないので、聴き直さない曲のメタデータは最後に聴いた時点のまま。その古さの上限が保持期間になる。
- 保持は「最後に聴いてから180日」（`RETENTION_DAYS`）かつ最大240曲（`LIBRARY_TRACKS`）。超えた曲と、参照されなくなったアルバム・アーティストは同期のたびに削除する。180日はこのサイトの運用値で、Spotify規約が定める数値でも、規約適合を保証する値でもない。規約（Developer Terms Section IV「古いデータを削除する」「無期限に保存しない」、Section V・Developer Policy I「必要な期間だけ保存し、切断時に削除する」）に沿わせるための上限として置いている。短くする場合は定数を変える。

### 表示（公開API）

- `/api/music?period=30|90|180`（既定30、不正値は30）。その期間に聴いた曲を新しい順に最大36曲（`DISPLAY_TRACKS`）と、そのアルバム・クレジットアーティスト（最大64）だけ返す。蓄積全体は返さない。
- 応答は allowlist schema のみ、`no-store`。`seen`、再生回数、カーソルは出さない。ノードはID順に並べ、聴いた順序も出さない。期間そのもの（30/90/180日のどれに入るか）は分かる。
- 閲覧からSpotify同期は起動しない。最後に同期が成功してから24時間を超えたら、蓄積があっても表示しない（古い内容を最新として見せない）。
- 一時的な失敗では蓄積は残し、表示だけ止める。次に同期が成功すれば再表示する。

更新は原則1時間。alarmは外部通信の前に次回予約を保存し、切断・再認可後に旧通信結果が戻っても世代照合で破棄する。失敗時は古い表示を隠す。正常な0件、未設定、切断、更新中、再認可待ち、429、通信不正を分ける。429はRetry-Afterを守り、解釈不能・過大値では同期を停止する。token失効は無限再試行しない。

管理画面の切断はalarm・有効認証情報・一時認可・蓄積した履歴（`library`、`cursor`）・公開メタデータを消す。再認可でもquota待ちを回避しないため非個人のcooldownは保持する。Spotifyの許可自体の取消しは本人のSpotifyアプリ管理で行う。

CloudflareのSQLite復旧コピーは最大30日残る場合がある。即時物理消去と称さない。MusicStoreを過去へ復元してはならない。災害復旧は新しい空のオブジェクト/暗号鍵・停止状態から開始し、本人の新規OAuthを必要とする。

## 開発・検証

`MUSIC_GRAPH_PREVIEW=1 npm run dev` の明示的なローカルserveだけで合成データを使用する。127.0.0.1の `/api/music` に限定し、production build/previewには合成レスポンスを入れない。`tests/music-graph.spec.ts` も同環境変数で実行する。通常起動の未接続状態を偽の音楽で置き換えない。

実Spotifyの曲名、画像、履歴をAIモデル・レビュー用スクリーンショットへ渡さない。UI検証は合成データ、実接続検証は所有者本人のブラウザと、内容を出さないschema/状態/リンク形式の機械検査に分ける。実機でなければemulationと記録する。本番QAは初回requestから `X-Site-QA: 1`（詳細は [Web Analytics](web-analytics.md)）。

公式ロゴ `public/spotify-logo.svg` はSpotifyの[配布デザイン素材](https://developer.spotify.com/documentation/design)の黒いフルロゴを無加工で使用。アートはトリミングせず、名称とSpotifyへのリンクを維持する。

参照: [Recently Played](https://developer.spotify.com/documentation/web-api/reference/get-recently-played)、[Policy](https://developer.spotify.com/policy)、[2026 migration](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)、[PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)、[Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)。公開前に現行要件とDashboardで利用可否を再確認する。

### 停止と障害時の運用

設定フラグを外すだけでは、既に予約したDO alarmの停止にはならない。通常停止は設定が有効なうちに管理画面で切断し、公開状態がdisconnectedになったことを確認してから設定を外す。設定破損で管理画面が使えない場合は、所有者認証を復旧して切断するまで「同期停止済み」と報告しない。

解釈不能・30日超のRetry-Afterで永続停止した場合、通常の再接続では解除しない。Spotifyの制限状態と指示を所有者が確認し、待機期限が不明なら再試行しない。根拠ある再開指示を受けた場合のみ、旧DOを復元せず新しい停止状態のstore identityで再構成し、旧store切断の確認後に新しいOAuthを行う。制限回避のためにstoreを切り替えてはならない。
