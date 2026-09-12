# SIGNAL / BLOOM — 70ki8suda

## Approved direction

A striking artist / creative-engineer portfolio, inspired by Nodex's precise,
cinematic, restrained and luminous design philosophy. The user explicitly wants
organic petals / fluid intersecting with interactive, geometrically transforming
visual effects. This is a portfolio artwork, not a dashboard or a literal clone
of the Nodex UI. Use one remarkable visual phenomenon and disciplined typography.

## Source material

Read the actual files from https://github.com/70ki8suda/nodex/tree/main/docs/design-system
using the authenticated GitHub CLI if needed:
`gh api repos/70ki8suda/nodex/contents/docs/design-system/manifesto.md -H 'Accept: application/vnd.github.raw+json'`

Key sources: manifesto.md, visual-dna.md, brand-core.md, theme-philosophy.md.
Nodex says engineered, luminous, quietly alive; a precise instrument in a larger
imagined world. Not generic SaaS, gamer RGB, chaotic collage, or decorative sci-fi.
Organic beauty should be a rare anomaly within geometry, not repeated decoration.
Deep blue-black, luminous off-white, controlled cyan and rare amber accents;
confident contemporary type with small technical mono metadata.

## Experience

- Editorial first screen: 70ki8suda identity, strong typography, a large live art
  field with real spatial depth and a legible minimal navigation.
- Geometric interference must visibly intersect the petal/fluid form, not merely
  sit behind a generic blob. Consider slicing planes, articulated lattice,
  faceted surfaces, contour bands, or angular wavefronts cutting through a bloom.
- Pointer/touch position changes the interference with smooth damping.
- Three states: organic bloom, geometry, interference. Interference is default.
- Base UI controls for state and intensity, plus an accessible pause control.
- Selected-work / practice / contact sections: honest content only. Nodex is the
  known real project. Label studies as experiments, do not invent clients,
  awards, employment, contact emails or production projects. Link GitHub profile
  and Nodex using verified URLs. No dead links or fake form submissions.
- No audio autoplay, flashing/strobing, scroll hijacking, or cursor replacement.
- Responsive, keyboard usable, reduced-motion aware, low pixel-ratio budget,
  WebGL unavailable fallback, pause when hidden where practical.

## Stack and contract

Vite, React, TypeScript, StyleX (real build-time integration and token layer),
Base UI, three, @react-three/fiber. Keep dependencies lean and pinned in lockfile.

Shared integration contract:

```ts
export type SceneMode = 'bloom' | 'geometry' | 'interference';
export interface SignalSceneProps {
  mode: SceneMode;
  intensity: number; // 0..1
  paused: boolean;
}
// default export from src/scene/SignalScene.tsx
```

SignalScene fills its positioned parent, owns its R3F Canvas / pointer handling,
implements reduced-motion and error fallback, and uses only React/three/R3F.
Its fallback must not depend on an external image. DOM outside the scene is
owned by the UI worker. Scene cannot intercept page scrolling.

## File ownership and safety

- Astra/UI: package/build config, index.html, src/App.tsx, src/main.tsx,
  src/styles, src/components, tests, README. Do NOT edit src/scene.
- Fable/scene: ONLY src/scene/**. No package/lockfile edits or dependency installs.
- Coordinator: this brief, integration fixes after workers stop, verification.
- Work in this Superset workspace only; preserve unrelated edits.
- Use apply_patch for source edits when available. No push, PR, publish, deploy,
  account changes, or blanket permission bypass. Commit only owned files after
  checks; never stage everything while another agent works.
- No docs/superpowers commits. Keep process proportional: this is a visual
  frontend prototype, not an API/auth/DB feature. No mandatory TDD for visual
  layout; validate via typecheck, production build and actual browser rendering.
- Never change the requested model or launch a weaker model as a fallback.

## Completion criteria

Production build + TypeScript checks pass. Scene visible in browser without
runtime/GLSL errors. Each control has observable effect, pause/reduced-motion
work, mobile layout fits, and the visual feels composed rather than generic.
Report exactly what was verified; do not present code inspection as browser proof.
