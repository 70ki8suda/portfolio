# Where spirit meets technology

A full-viewport artwork and portfolio for **70ki8suda**. A procedural indoor farm — rice-growing units stacked in bright hydroponic racks — fills the opening screen. The message imagines spirituality and technology coexisting in a sustainable, unhurried world: “Where spirit meets technology. A sustainable world where spirituality and technology coexist. Rooted in nature. Connected with care. Free to slow down.” Header and accessible controls sit over the artwork; selected work, practice, and contact remain below. A Markdown blog lives at `/blog` (see [ブログ](#ブログ)).

## Run locally

Use Node **22.12+** and npm. React and React DOM are pinned to the compatible, patched **19.2.8** release; exact transitive versions are recorded in `package-lock.json`.

```sh
npm ci
npm run dev        # http://127.0.0.1:5173
```

```sh
npm run typecheck
npm run build      # client + SSR server into dist/
npm run preview    # serves the production build, http://127.0.0.1:4173
npm test           # unit (Vitest) then browser (Playwright) tests
```

The hero uses one WebGL2 canvas, drawn by `FluidBackdrop`. It is a close view along
ranks of stacked hydroponic growing units: fine moving rice blades, translucent resin frames,
transparent water channels and clear moving water. There is no floor or ceiling illustration,
video, plant model, or white layer laid over the left of the artwork. The earlier
clips remain in `public/media/` (see [media credits](public/media/CREDITS.md)), but
the homepage does not reference them.

### Space and rendering

`grass.ts` defines the rack dimensions and responsive camera. Structure, water
and blade roots use the same world coordinates and perspective projection.
Desktop shows the aisle between racks; mobile crops a rack above the copy.
Three parallel rack pairs, each eight bays long, reveal adjacent aisles and near ends.
The camera sits back from the units so their lateral arrangement is visible. Open backs
let neighboring rows appear between trays. Each outer pair uses 70% of the central
pair's blade budget. Nine draw calls composite the three pairs from outside inward;
all share the same simulation textures, with no additional render targets.
The structure uses procedural surfaces plus ray intersections with square-section
uprights. Their opaque satin-resin front and side faces and tray collars
share the same world geometry. Tray sides and near-end walls meet at the same
finite bounds; the camera range is not reduced to conceal the ends.

Each bay contains a rectangular cultivation raft with a low border. Open water
separates the rafts and runs along their edges. Shared module dimensions keep
blade roots inside each raft, while retaining far-to-near draw order. Every blade
is an instanced strip. The renderer draws surfaces behind the crop, the crop,
and the front frame in that order. These are rendering passes within one
scene, rather than independently positioned decorative layers.

Clear water shows the pale tray beneath it, with small ripples, refraction and
light reflections. It is not coloured by the solver's dye. The surface and
lighting are visual approximations: travelling waves, simplified reflections
and contact shading, rather than a full three-dimensional water solver or
physically traced lighting. Uprights use opaque satin-resin shading with bevel normals, broad highlights,
fine surface grain and recessed seams. Horizontal rails retain translucent
shading. These are procedural material approximations, not traced reflections.

### Motion

`fluidBackdrop.ts` retains a two-dimensional incompressible flow solver: velocity
advection, vorticity confinement, a pressure solve and projection. A transported
tracer records disturbed water; it affects ripple strength rather than ink
colour. The wind texture eases toward this velocity and slow procedural gusts.
Both water and grass respond to this flow and to pointer input.

Each blade is rebuilt from its instance number. Its segmented spine bends most
at the tip and keeps its root fixed; width tapers and the fragment shader softens
its edges. Intensity changes light immediately, including while paused, and
changes wind strength while running. The mode selector has been removed; the
scene uses the fixed `interference` style internally. The compact controls expose
only pause/resume; intensity is fixed at 0.65. Dragging the artwork turns the camera within
bounded angles; camera changes redraw the view even while paused or under reduced
motion, without advancing the simulation. Mouse/pen drag turns both axes; touch
pans horizontally while vertical gestures scroll the page. Focus the artwork and
use arrow keys to turn it, Home or double-click to reset. Hover stirs the flow;
held drags turn the camera instead. Copy and controls retain their own input.

### Lifecycle and budget

- The simulation uses a fixed step with bounded catch-up work and a rendering
  rate capped near 60 fps. It reduces quality under sustained frame pressure.
- Drawing-buffer and simulation dimensions are bounded independently; compact
  screens use smaller grids and fewer blade segments.
- Paused and reduced-motion states do not run a continuous animation or pointer
  simulation. Intensity can still redraw a static image.
- Offscreen and hidden states suspend work; becoming visible resumes it.
- Resizing preserves flow where possible, including when only tracer dimensions
  change. Context loss displays the CSS fallback and restoration rebuilds GPU
  resources. Unmounting releases listeners, frames and all GPU objects.
- `[data-testid="fluid-backdrop"]` exposes `running`, `paused`, `offscreen`,
  `hidden`, `static` or `unavailable`; the canvas sets `data-ready` after drawing.

Browser tests exercise motion, controls, failure recovery and resource lifetime.
Real-device mobile GPU performance has not been measured. Software rendering is
substantially slower and its screenshot timing can differ from hardware rendering.

## Implementation

- [TanStack Start](https://tanstack.com/start/latest/docs/framework/react/overview) (React, Vite, strict TypeScript) with file-based routes in `src/routes/`: `/` (the portfolio), `/blog`, `/blog/$slug`. Every page is server-rendered; `src/routes/__root.tsx` is the HTML document. `src/routeTree.gen.ts` is generated by the router plugin during `dev`/`build` and committed so `tsc` works on a fresh checkout.
- Browser-only work stays on the client: the canvas element is server-rendered empty, and the water and grass simulation starts in an effect.
- **StyleX compiles at build time** through the official `@stylexjs/unplugin` Vite integration, before TanStack Start and React. `runtimeInjection: false`; production styles are appended to the root stylesheet that Start links during SSR. In development, `src/components/DevStyleXInject.tsx` loads the plugin's `/virtual:stylex.css` and HMR runtime from the document head (the pattern from StyleX's SSR examples).
- `src/styles/tokens.stylex.ts` defines the canvas, surfaces, text, borders, signal colors, depth, typography, and spacing as real `stylex.defineVars` tokens. Layout and components use `stylex.create` and `stylex.props`. Global CSS is limited to reset, baseline document styles, focus, and reduced motion.
- Base UI Button provides keyboard control for playback. Space Grotesk and DM Mono are bundled locally via Fontsource.
- The artwork uses WebGL2 directly, with no rendering library; `fluidBackdrop.ts` owns every GPU object and its fallbacks. (`three` and `@react-three/fiber` are still listed in `package.json` but nothing imports them any more.)

The artwork's contract is the props of `FluidBackdrop` (`src/components/FluidBackdrop.tsx`), with `GrassMode` from `src/scene/fluid/grass.ts`:

```ts
export type GrassMode = 'bloom' | 'geometry' | 'interference';

interface FluidBackdropProps {
  paused: boolean;
  reducedMotion: boolean;
  mode: GrassMode;
  intensity: number; // 0..1
  camera: { pan: number; tilt: number }; // each -1..1, zero is the resting view
}
```

The artwork fills a positioned parent. The UI supplies `interference`, `0.65`, the resting camera, and unpaused playback initially. When the system prefers reduced motion, the UI passes `paused: true`, labels the playback control accordingly, and disables the playback button. Intensity and camera changes redraw the paused artwork without advancing animation; hovering does not stir the paused flow. The scene suspends continuous rendering when paused, offscreen, or hidden, caps pixel ratio at 1.5, and handles unavailable WebGL and runtime rendering failures. Ordinary page scrolling remains available over the artwork.

## ブログ

`/blog` は、リポジトリ内の Markdown ファイルだけで動く小さなブログです。データベース、管理画面、外部 CMS はありません。記事の追加・修正は、通常のコード変更と同じくコミットで行います。

最初のコンテンツとして、Garys Economics の人気上位10本と「Understand The Economy Course」全4本を、日本語の独自要約・解説記事として収録しています。既存の14記事の説明・具体例・留保を1本の詳細記事 `/blog/garys-economics-guide` に統合し、章ごとの目次と14本の動画埋め込みを付けています。旧記事URLは対応する章へ301リダイレクトします。人気順は2026年9月25日時点です。[対象動画・字幕の出典と確認範囲](docs/content/garys-economics-sources.md)を参照してください。記事は全文の書き起こし・翻訳ではありません。

### 記事を書く

1. `content/posts/` に `.md` ファイルを作ります。ファイル名がそのまま URL になります（`my-first-post.md` → `/blog/my-first-post`）。ファイル名は半角英小文字・数字・単一のハイフンのみです。
2. 先頭に frontmatter を書きます。

```md
---
title: "記事のタイトル"
date: 2026-09-25
description: 一覧と検索結果に出る 1〜2 文の要約。
tags: [economics, notes]
---

本文は `##` 見出しから始めます（記事タイトルがページの h1 になるため、本文の `#` も h2 として表示されます）。
```

| フィールド | 必須 | 内容 |
| --- | --- | --- |
| `title` | ○ | 記事タイトル |
| `date` | ○ | 公開日。`YYYY-MM-DD`（実在する日付のみ）。一覧は新しい順 |
| `description` | ○ | 要約。`<meta name="description">` にも使われます |
| `tags` | ○ | タグの配列（空配列 `[]` も可、重複不可）。一覧でタグ絞り込みができます |
| `draft` | | `true` で下書き。一覧に出ず、URL を直接開いても 404 |
| `lang` | | 本文の言語。`ja`（既定）または `en`。記事要素の `lang` 属性になります |
| `youtubeId` | | 解説する YouTube 動画の 11 文字の ID（例 `"bReS9FLpgT4"`）。**必ず引用符で囲む** |
| `sourceTitle` | `youtubeId` があれば ○ | 元動画のタイトル。プレイヤーの `title` とリンク文言に使用 |
| `sourcePublishedAt` | | 元動画の公開日 `YYYY-MM-DD` |
| `series` | | シリーズ名。`seriesOrder` と必ずセット |
| `seriesOrder` | | シリーズ内の順番（1 以上の整数）。同じシリーズで番号の重複は不可 |

未知のフィールド（例: `drafts` のような綴り間違い）や不正な値はエラーになり、開発サーバー・`npm run test:unit` がファイル名つきで原因を表示します。

YouTube 動画を解説する記事の例:

```md
---
title: "富とは何か：Understand the Economy 第1回を読む"
date: 2026-09-25
description: Gary's Economics の講座第1回の要点を日本語で解説します。
tags: [economics, garys-economics]
youtubeId: "bReS9FLpgT4"
sourceTitle: "Understand the Economy Part 1: What is wealth?"
sourcePublishedAt: 2024-01-01   # 元動画の実際の公開日に置き換える
series: Understand the Economy
seriesOrder: 1
---
```

動画はタイトル・要約の下に 16:9 のプレイヤーとして表示されます。`youtube-nocookie.com` の埋め込みで、遅延読み込み・自動再生なし・全画面可、下に元動画へのリンクと公開日が付きます。同じ `series` の記事が 2 本以上公開されると、記事下にシリーズの目次と「Part 1 of 4」のような表示が出ます。

### 使える Markdown

見出し、段落、強調、打ち消し線、リスト（入れ子・番号付き・チェックリスト）、リンク、自動リンク、画像、引用、コードブロック、表、脚注（GFM）。長いコードはブロック内で横スクロールし、ページ幅を広げません。

画像は `public/blog/` に置き、`![代替テキスト](/blog/image.png)` のようにサイトのルートから参照します。代替テキストは必ず書いてください。

安全のため、本文中の生 HTML（`<iframe>`、`<script>`、`style` 属性など）は描画されず無視されます。`javascript:` などの危険な URL も除去されます。動画は frontmatter の `youtubeId` または以下の専用ブロックで埋め込みます。任意の iframe HTML は許可しません。

### 長文記事の目次と動画

見出し末尾に `## 富とは何か {#wealth}` と書くと、`[富とは何か](#wealth)` で章へ移動できます。IDは英小文字で始まり、英小文字・数字・ハイフンのみを使います。同じ記事内で重複させないでください。

本文中の動画は、次のように `youtube` コードブロックへIDとタイトルを2行で書きます。通常のコードブロックとは異なり、安全なYouTubeプレイヤーに変換されます。不正なID・不足したタイトルは動画に変換されず、コードとして表示されます。公開日や出典の説明はブロックの前後に記載してください。

````md
```youtube
bReS9FLpgT4
Understand the Economy Part 1: What is wealth?
```
````

### プレビューする

```sh
npm run dev
# http://127.0.0.1:5173/blog を開く
```

保存すると自動で再読み込みされます。下書き（`draft: true`）も確認したいときだけ、次のように起動します。下書きには「Draft」と表示されます。

```sh
BLOG_DRAFTS=1 npm run dev
```

`BLOG_DRAFTS` は開発サーバー専用です。本番ビルドでは常に無視され、下書きは一覧にも個別 URL にも出ません。

### ビルドと確認

```sh
npm run test:unit   # frontmatter の検証（全記事を含む）
npm run build       # 型チェック + クライアント/SSR サーバーのビルド
npm run preview     # 本番ビルドを http://127.0.0.1:4173 で確認
npm test            # 単体テスト + ブラウザテスト
```

`dist/` がビルド結果です（`dist/client` が静的アセット、`dist/server/server.js` が SSR サーバーのエントリ）。存在しない記事・下書きの URL はステータス 404 を返し、タイトルと description は JavaScript なしでも HTML に含まれます。

### テスト用の記事

`content/posts/` には公開記事だけを置きます。Markdown 表示・下書きの非公開・動画埋め込み・シリーズ表示を確認する記事は `tests/fixtures/posts/` にあり、Playwright が `BLOG_FIXTURES=1` で起動する開発サーバーだけが読み込みます（本番ビルドには含まれません）。Markdown の書き方の例は `tests/fixtures/posts/fixture-markdown-field-guide.md` を参照してください。

## Content and design provenance

The approved [creative brief](CREATIVE_BRIEF.md) is the content boundary. Actual Nodex source files were fetched from GitHub by the coordinator and read in `references/nodex/`:

- [Manifesto](https://github.com/70ki8suda/nodex/blob/main/docs/design-system/manifesto.md)
- [Visual DNA](https://github.com/70ki8suda/nodex/blob/main/docs/design-system/visual-dna.md)
- [Brand core](https://github.com/70ki8suda/nodex/blob/main/docs/design-system/brand-core.md)
- [Theme philosophy](https://github.com/70ki8suda/nodex/blob/main/docs/design-system/theme-philosophy.md)

The portfolio translates their restraint, depth, luminous materials, precise geometry, and authoritative typography. It is an original composition. The Nodex panel is labeled as a visual interpretation of its design language, not a product screenshot. A living future is explicitly an experiment; its solarpunk copy expresses an aspiration, not environmental performance claims. External destinations are the known [Nodex repository](https://github.com/70ki8suda/nodex) and [70ki8suda profile](https://github.com/70ki8suda). There are no invented clients, awards, credentials, email addresses, or contact submissions.

Integration references: [StyleX’s Vite documentation](https://stylexjs.com/docs/learn/installation/vite/) and [Base UI Slider](https://base-ui.com/react/components/slider).

## Page transitions

Navigating between pathnames (home, blog list, posts, 404) plays the `DistortFade` shader from [`@vfx-js/transitions`](https://amagi.dev/vfx-js-transitions/) through `@vfx-js/core`'s `vfx.addTransition()` (both MIT). `src/components/PageTransitions.tsx` subscribes to the router; `src/transitions/` holds the adapter.

- The effect runs on a static, viewport-sized copy of the page in a fixed stage, never on the live DOM: right before the router commits, the old page is copied; the router then renders and restores scroll as usual; VFX-JS mixes the old copy into a copy of the new page; the stage is removed. Route context, focus, links, scroll restoration and embedded players are untouched. `@vfx-js/react`'s `<VFXTransition>` is not used: it needs a viewport-sized scrolling box and keeps the old page's React node, which under TanStack Router would render the new route.
- It is progressive enhancement. A navigation is a plain cut when: reduced motion is on; only the search or hash changed (tag filters, anchors); WebGL or the renderer is unavailable; a YouTube frame or video is on screen before or after; a visible canvas cannot be read (a WebGL canvas is only readable in the frame that drew it, so stills are taken when a link is pointed at, pressed or focused; leaving the homepage with back/forward usually has none); the copy's layout does not match the page; the new page takes longer than 1.5 s; or another navigation starts. The live page is always already navigated underneath, so a failure only drops the effect.
- Stable browsers have no html-in-canvas, so VFX-JS captures the copy with its dom-to-canvas fallback (it logs one `html-in-canvas not supported` warning per transition). The adapter covers that fallback's gaps: loaded web fonts are inlined, canvases are replaced by stills, sticky boxes are pinned, off-screen content is pruned. Pseudo-elements are not captured (the site uses none). The html-in-canvas path (Chrome Canary or a flag) is not tested.
- The stage is visual only and never captures input. Wheel, touch, or scrolling keys cancel an active effect immediately so the live page can scroll, including while capture is still pending.
- The renderer is a separate chunk loaded in the browser when idle; nothing runs on the server. One WebGL context is created at the first transition and reused. Its output canvas is hidden on completion or cancellation so its final frozen frame cannot cover live WebGL artwork on the destination page.
- `window` receives a `pagetransition` event (`detail.phase`: `start`, `end`, `skip` or `abort`, with a `reason`) that `tests/page-transitions.spec.ts` uses.

## Browser verification

Install the test browser once:

```sh
npx playwright install chromium
npm test
```

If an existing Chrome install should be used instead, run `PLAYWRIGHT_CHANNEL=chrome npm test`. Tests start a fresh dev server on `127.0.0.1:4173` (override with `PLAYWRIGHT_PORT=4180`; reuse an already-running server only with `PLAYWRIGHT_REUSE_SERVER=1`) and run one file at a time, because the WebGL suites time out under parallel SwiftShader load. Blog tests (`tests/blog.spec.ts`) use only test posts from `tests/fixtures/posts/` (Markdown features, a draft, video series), which the dev server loads only when `BLOG_FIXTURES=1` (set by the Playwright config); production builds never include them. Unit tests live next to the code (`npm run test:unit`): frontmatter validation in `src/blog/*.test.ts`, the ink, grass and scheduling formulas in `src/scene/fluid/*.test.ts`. `tests/fluid-backdrop.spec.ts` covers the backdrop in the browser: no video elements or media requests, the single canvas, the racks' palette and layout, autonomous motion, pause, pointer strokes bending the grass, reduced motion, offscreen/hidden, resize, context loss and restore, missing WebGL, and resource release on navigation. Browser tests cover navigation, real outbound destinations, console errors, keyboard playback controls, visible canvas changes, actual pause/resume, reduced-motion controls, mobile/tablet/wide overflow, and WebGL-unavailable/context-loss fallbacks. Headless rendering uses SwiftShader; it does not measure real-device GPU performance. Desktop/mobile captures, failure screenshots, and traces remain untracked.

Before sign-off, also visually inspect desktop/mobile composition; verify pointer/touch response, actual animation freeze/resume, WebGL fallback appearance, and hidden-tab behavior in the integrated scene. A passing TypeScript/build check alone does not prove the artwork renders.

## Ownership

- UI: package/build config, `src/App.tsx`, `src/router.tsx`, `src/routes/**`, `src/blog/**`, `src/components/**`, `src/styles/**`, tests, and this README.
- Blog content: `content/posts/**` and images under `public/blog/**`.
- Scene: `src/scene/**` belongs to the scene worker.
- Coordinator: brief, reference snapshots, final integration, and independent verification.

Commit only explicitly owned paths. Keep `docs/superpowers`, generated build/test output, and reference snapshots out of UI commits. No publish, push, deployment, or hook trust changes are needed to run the project.
