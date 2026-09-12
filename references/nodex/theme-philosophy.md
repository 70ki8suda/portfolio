# Theme Philosophy

## Shared Rule

Light and dark themes are not separate brands.

They are two atmospheric states of the same world.

The underlying geometry, spacing, hierarchy, and motion rules should stay
aligned.

## Light Theme

Working theme name: `solar`

Emotional reference:

- solarpunk
- air
- optimistic engineering
- ecological calm
- horizon light

Characteristics:

- bright but not plain white
- breathable
- cinematic
- gently radiant
- hopeful without becoming cute

The light theme should feel like tools used in a better future.

### Solar Token Direction

`solar` should not collapse into plain white SaaS surfaces.

It should keep atmosphere while raising visibility.

Token guidance:

- `canvas`: warm light with a faint sky cast, never pure #ffffff
- `panel`: translucent bright surfaces with soft depth, not flat cards
- `overlay`: pale glass with horizon tint
- `text primary`: dark graphite, not pure black
- `text secondary`: softened slate-blue neutrals
- `border`: fine structural lines with a cool technical tint
- `accent cyan`: cleaner and airier than the dark theme version
- `accent amber`: solar warmth, used sparingly for emphasis
- `glow`: diffused, sunlit, atmospheric

Interaction feel:

- bright but not sterile
- open, breathable, and optimistic
- visually calm under heavy information density

## Dark Theme

Working theme name: `nocturne`

Emotional reference:

- slick cyberpunk
- nocturnal industrial space
- signal light
- restrained electric atmosphere

Characteristics:

- dark but not muddy
- high contrast without cheap RGB overload
- precise
- premium
- slightly dangerous, never chaotic

The dark theme should feel like a highly refined instrument in a city at night.

### Nocturne Token Direction

`nocturne` should not become generic cyberpunk.

It must stay luxurious, controlled, and sharply engineered.

Token guidance:

- `canvas`: deep blue-black, not neutral black
- `panel`: layered dark surfaces with slight optical separation
- `overlay`: dense night glass with signal contrast
- `text primary`: cool luminous white, never harsh
- `text secondary`: muted electro-slate
- `border`: fine electric lines that define structure without noise
- `accent cyan`: signal color, precise not playful
- `accent amber`: warning / playback / energy punctuation
- `glow`: cinematic, local, and intentional

Interaction feel:

- nocturnal
- high-contrast
- controlled
- premium
- slightly dangerous without chaos

## Theme Accent Rule

Light theme may carry a softer atmospheric bloom.

Dark theme may carry a quieter, more isolated poetic accent.

In both themes, decorative anomalies must stay peripheral and rare.

## Shared Token Invariants

Even when theme values diverge, these structural rules must remain shared:

- spacing scale
- radius scale
- type hierarchy
- control sizing
- panel layering logic
- border discipline
- motion timing categories

Theme should alter mood, not layout identity.

## First Token Categories

When implementation is extracted into `packages/themes`, start with these token
groups:

- `color.canvas`
- `color.surface`
- `color.text`
- `color.border`
- `color.accent`
- `shadow.panel`
- `shadow.node`
- `shadow.signal`
- `glow.accent`

Recommended theme IDs:

- `solar`
- `nocturne`
