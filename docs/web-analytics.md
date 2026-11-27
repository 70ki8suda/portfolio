# Web Analytics: 通常読者とQAの分離

通常読者にはCloudflareの自動挿入を使う。手動beaconを追加しない。管理画面の **Enable, excluding visitor data in the EU** を維持し、SPA計測も標準のままにする。siteTagはbeacon tokenではない。

## 手動QAを始める前に

https://70ki8suda.com/analytics-preferences/ を直接開き「このブラウザの計測を停止」を押す。「計測停止の設定済み」を確認してから「サイトへ戻る」で移動する。この設定ページ自体は下記のCloudflareルールで計測しない。

- Cookie `site_analytics_optout=1` を、host-only / `Path=/` / `SameSite=Lax` / HTTPSでは`Secure` / 最長1年間で保存する。個人IDは含まない。
- すでに開いているタブは再読み込みする。読み込み済みbeaconをCookieだけで停止することはできず、送信済み集計は取り消せない。
- 解除は同ページの「計測を再開」→「サイトへ戻る」。Cookie削除で解除される。ブラウザによる保存期間の短縮・Cookie削除・別端末・別ブラウザ・別プロファイルでは再設定が必要。
- 設定保存に失敗した表示なら、そのままQAを始めずブラウザのCookie設定を確認する。

## 自動テスト・Orca/CUA・一時live検証

**最初の対象documentを取得する前**に、いずれかを設定する。ページ表示後の`addInitScript`や`navigator.webdriver`だけには頼らない。

1. Playwright Testはrepoの`playwright.config.ts`から`X-Site-QA: 1`を継承する。設定を上書きする場合は`use.extraHTTPHeaders`をmergeする。手動作成したcontextにも届くことを専用回帰で確認している。
2. 設定を継承しないPlaywright/Orca/CUA/browser CLIは、初回navigation前に同ヘッダーをcontextへ設定するか、`site_analytics_optout=1`（domain `70ki8suda.com`, path `/`, secure, sameSite `Lax`）をcontextへ追加する。
3. ヘッダー/Cookieを事前設定できないUI操作では、**最初に上の設定ページへ直接移動**して停止を保存する。ホームを開いてから停止しない。新規セッション・別profileごとに確認する。
4. curl等は `-H 'X-Site-QA: 1'`、または専用UA `70ki8suda-QA/1.0` を使う。通常ブラウザUAを残す場合は末尾にこのmarkerを追加する。一般的なbot名全体を除外条件にはしない。

例（独立したPlaywrightスクリプト）:

```js
const context = await browser.newContext({
  extraHTTPHeaders: { 'X-Site-QA': '1' },
});
const page = await context.newPage();
await page.goto('https://70ki8suda.com/');
```

通常読者の計測自体を検証する場合だけ、マーカーなしの隔離contextを使用する。計測POSTの送信先`**/cdn-cgi/rum*`をnavigation前にinterceptして収集を防ぎ、script1個・SPA遷移後の送信試行を確認する。これはPV集計への到達証明ではない。除外側ではscript/送信試行とも0を確認する。不要な本番PVを増やさない。

## Cloudflare側の必須設定

Zone `70ki8suda.com` → Rules → Configuration Rules。
ルール名 `Exclude development and QA from Web Analytics`。
Action: **Disable Real User Monitoring (RUM)** ON (`disable_rum: true`)。
他のRUM有効化ルールを追加して上書きしない。既存のEU除外設定は変更しない。

```text
(http.host ne "70ki8suda.com") or
(http.request.uri.path eq "/analytics-preferences") or
(starts_with(http.request.uri.path, "/analytics-preferences/")) or
(concat("; ", http.cookie, ";") contains "; site_analytics_optout=1;") or
(any(http.request.headers["x-site-qa"][*] eq "1")) or
(http.user_agent contains "70ki8suda-QA/1.0")
```

Cookie条件はブラウザ標準の`; `区切りと完全なname/value境界を使う。任意のHTTPクライアントが別形式のCookie文字列を手書きする場合は専用ヘッダー/UAを使う。`http.request.cookies`のmapはPro以上が必要なので依存しない。

この設定はCloudflare zone側にありrepoのdeployだけでは作成されない。rule ID/Active/式/設定とEU除外を管理画面でread-after-write確認する。Configuration RuleはWeb Analytics側のルールより優先される。自動挿入を止めるため、HTMLのキャッシュ削除やブラウザでの後追いscript除去は使わない。

local/previewには手動beaconを含めない。custom domain以外のzone内hostnameは上記ルールで除外する。`workers.dev`は別zoneなので本ルールの対象外であり、自動挿入がないことを公開時に確認する。新しいpreview domainを導入するときも非計測を検証する。

## 公開時の確認

- 通常リクエストは`Accept: text/html`と通常UAを付けて比較する。`curl`の既定`Accept: */*`でscriptがなくても通常ブラウザ非計測とは判断しない。
- 同じHTML URLのnormal=1 / QA header=0 / QA UA=0 / Cookie=0 / 設定ページ=0、解除後normal=1を確認。通常→QA→通常を繰り返して混在キャッシュの影響も確認する。
- Cookieの先頭/中間/末尾と、似た名前・値`10`などの非一致も検査する。
- 320/390/PCで設定保存/解除/再読み込み/キーボード/横overflow、通常SPA navigationと単一beaconを確認する。
- EUの除外は管理画面の設定を維持し、地域を実際に変えていない検証をEU実通信の検証と呼ばない。任意ヘッダーで国情報を偽装して代用しない。
- READMEや保護された既存testは変更せず、設定・専用test・公開静的ページ・この文書だけを所有commitする。

過去集計は修復できない。マーカーなしのQA、Cookieを消したブラウザ、未知のbotを完全には区別できない。Web Analytics除外は、Cloudflareの別のedge/セキュリティアクセスログを消す機能ではない。

公式資料:
- [Configuration Rules settings](https://developers.cloudflare.com/rules/configuration-rules/settings/)
- [Web Analytics Rules](https://developers.cloudflare.com/web-analytics/configuration-options/rules/)
- [Automatic setupとEU除外](https://developers.cloudflare.com/web-analytics/get-started/)
- [SPA計測](https://developers.cloudflare.com/web-analytics/get-started/web-analytics-spa/)
