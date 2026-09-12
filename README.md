# Where spirit meets technology

A full-viewport artwork and portfolio for **70ki8suda**. Blue petals and flat yellow strokes fill the opening screen. The message imagines spirituality and technology coexisting in a sustainable, unhurried world: “Where spirit meets technology. A sustainable world where spirituality and technology coexist. Rooted in nature. Connected with care. Free to slow down.” Header and accessible controls sit over the artwork; selected work, practice, and contact remain below.

## Run locally

Use Node **22.12+** and npm. React and React DOM are pinned to the compatible, patched **19.2.8** release; exact transitive versions are recorded in `package-lock.json`.

```sh
npm ci
npm run dev
```

```sh
npm run typecheck
npm run build
npm run preview
```

The integrated artwork is in `src/scene/SignalScene.tsx`. Water-blue 3D petals intersect yellow **flat, solid-color geometric sunbeams**. Six infinite bands span the viewport edge to edge, with no interior end caps. Their directions are spaced at 30-degree intervals with a gentle angular drift; staggered width apertures make rays enter and disappear without truncating their length. Their animation clock is separate from the flower's intensity-scaled motion; no pointer movement is needed. No glow, light spill, circular graphics, frames, or tick marks. Screen-space rear/front shader layers create overlap without changing the petal's material or introducing perspective. Pointer motion adds a small graphic shift; intensity changes band width.

Behind the transparent scene, `NatureBackdrop` cuts between local underwater,
green-leaf, and sky footage. The clips are silent, compressed 720p excerpts;
the light veil keeps the foreground copy legible. Playback and cuts share the
artwork's pause control and suspend while hidden/offscreen. Reduced motion uses
the static underwater poster without loading video. Footage provenance,
editing details, and license restrictions are in [media credits](public/media/CREDITS.md).

## Implementation

- Vite, React, and strict TypeScript.
- **StyleX compiles at build time** through the official `@stylexjs/unplugin` Vite integration, before the React plugin. `runtimeInjection: false`; production styles are extracted into Vite’s CSS output. The HTML entry uses the plugin’s development CSS/HMR support.
- `src/styles/tokens.stylex.ts` defines the canvas, surfaces, text, borders, signal colors, depth, typography, and spacing as real `stylex.defineVars` tokens. Layout and components use `stylex.create` and `stylex.props`. Global CSS is limited to reset, baseline document styles, focus, and reduced motion.
- Base UI Radio/RadioGroup, Slider, and Button provide keyboard controls for scene state, intensity, and playback. Space Grotesk and DM Mono are bundled locally via Fontsource.
- The scene is lazy-loaded, with React Three Fiber / Three.js rendering, input handling, resource management, and a self-contained WebGL fallback.
- Shader materials are explicitly owned and disposed, retaining shared uniform references. This is important with R3F's uniform-prop copying: updating a detached numeric uniform does not update the GPU. The yellow-motion regression checks actual GPU time uploads as well as visible ink.

The scene contract, imported directly from `src/scene/SignalScene.tsx`:

```ts
export type SceneMode = 'bloom' | 'geometry' | 'interference';

export interface SignalSceneProps {
  mode: SceneMode;
  intensity: number; // 0..1
  paused: boolean;
}

// Default export: SignalScene
```

The scene fills a positioned parent. The UI supplies `interference`, `0.65`, and unpaused playback initially. When the system prefers reduced motion, the UI passes `paused: true`, labels the playback control accordingly, and keeps state/intensity controls usable. Paused controls update the artwork without animation and pointer motion is ignored. The scene suspends continuous rendering when paused, offscreen, or hidden, caps pixel ratio at 1.5, and handles unavailable WebGL and runtime rendering failures. Ordinary page scrolling remains available over the artwork.

## Content and design provenance

The approved [creative brief](CREATIVE_BRIEF.md) is the content boundary. Actual Nodex source files were fetched from GitHub by the coordinator and read in `references/nodex/`:

- [Manifesto](https://github.com/70ki8suda/nodex/blob/main/docs/design-system/manifesto.md)
- [Visual DNA](https://github.com/70ki8suda/nodex/blob/main/docs/design-system/visual-dna.md)
- [Brand core](https://github.com/70ki8suda/nodex/blob/main/docs/design-system/brand-core.md)
- [Theme philosophy](https://github.com/70ki8suda/nodex/blob/main/docs/design-system/theme-philosophy.md)

The portfolio translates their restraint, depth, luminous materials, precise geometry, and authoritative typography. It is an original composition. The Nodex panel is labeled as a visual interpretation of its design language, not a product screenshot. A living future is explicitly an experiment; its solarpunk copy expresses an aspiration, not environmental performance claims. External destinations are the known [Nodex repository](https://github.com/70ki8suda/nodex) and [70ki8suda profile](https://github.com/70ki8suda). There are no invented clients, awards, credentials, email addresses, or contact submissions.

Integration references: [StyleX’s Vite documentation](https://stylexjs.com/docs/learn/installation/vite/), [Base UI Radio](https://base-ui.com/react/components/radio), and [Base UI Slider](https://base-ui.com/react/components/slider).

## Browser verification

Install the test browser once:

```sh
npx playwright install chromium
npm test
```

If an existing Chrome install should be used instead, run `PLAYWRIGHT_CHANNEL=chrome npm test`. Tests start Vite on `127.0.0.1:4173`, and cover navigation, real outbound destinations, console errors, keyboard state/intensity changes, visible canvas changes, actual pause/resume, reduced-motion controls, mobile/tablet/wide overflow, and WebGL-unavailable/context-loss fallbacks. Headless rendering uses SwiftShader; it does not measure real-device GPU performance. Desktop/mobile captures, failure screenshots, and traces remain untracked.

Before sign-off, also visually inspect desktop/mobile composition; verify pointer/touch response, actual animation freeze/resume, WebGL fallback appearance, and hidden-tab behavior in the integrated scene. A passing TypeScript/build check alone does not prove the artwork renders.

## Ownership

- UI: package/build config, `index.html`, `src/App.tsx`, `src/main.tsx`, `src/components/**`, `src/styles/**`, tests, and this README.
- Scene: `src/scene/**` belongs to the scene worker.
- Coordinator: brief, reference snapshots, final integration, and independent verification.

Commit only explicitly owned paths. Keep `docs/superpowers`, generated build/test output, and reference snapshots out of UI commits. No publish, push, deployment, or hook trust changes are needed to run the project.
