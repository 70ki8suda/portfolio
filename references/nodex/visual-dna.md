# Visual DNA

## Geometry First

The main UI skeleton should be built from:

- grids
- panels
- modular spacing
- precise edges
- deliberate radius choices
- disciplined typography

Interaction surfaces should feel engineered.

## Light And Material

Nodex does not use flat color fields by default.

Preferred material language:

- deep layered gradients
- low-opacity panel surfaces
- controlled glow
- thin border signals
- atmospheric depth

Glows should look optical, not neon toy-like.

## Token Translation

Visual DNA should eventually become implementation tokens.

The translation order should be:

1. atmosphere
2. surface hierarchy
3. border language
4. text contrast
5. accent signal colors
6. shadow and glow behavior

This order matters because Nodex feeling comes from the whole optical stack, not
from a single accent color.

## Token Families

Nodex design tokens should be grouped into the following families:

- `canvas`
  the global world color and background field
- `surface`
  panel, overlay, card, ghost, and muted surfaces
- `text`
  primary, muted, soft, signal, and inverse text colors
- `border`
  subtle, soft, and faint structural separators
- `accent`
  cyan, amber, and rare special-case signal colors
- `shadow`
  panel, node, hover, and playback depth layers
- `glow`
  local optical emphasis, never ambient noise everywhere

## Token Application Rule

Apply tokens in this order:

1. color
2. shadow
3. border
4. radius
5. spacing
6. size
7. typography

Reason:

Color and depth can be standardized with low layout risk.

Spacing, size, and typography are more likely to alter composition and should
only be migrated after visual regression coverage is stable.

## Solar / Nocturne Contrast

Token systems should preserve a clear contrast between the two themes.

`solar` should emphasize:

- air
- light diffusion
- horizon warmth
- soft ecological optimism

`nocturne` should emphasize:

- signal clarity
- night depth
- electrical precision
- cinematic contrast

But both themes must still feel like they come from the same manufacturer.

## Typography

Typography should combine:

- a confident contemporary body face
- a technical mono accent face

Usage pattern:

- body and headlines carry confidence and product clarity
- mono is used for metadata, kickers, coordinates, labels, and signal language

## Shape Language

Primary shapes:

- rectangles with purpose
- rounded panels with tension
- pills for small state surfaces
- grids and repeated slots

Avoid overly soft blob language in core interactions.

## Controlled Organic Accent

Organic beauty is allowed only as a peripheral accent.

It should feel like an anomaly discovered in the system.

Desired feeling:

- a flower at the edge of a machine space
- a quiet sign of life in an industrial field

Possible forms:

- a faint bloom silhouette at a corner
- a thin rose-like line drawing in a dead zone
- a subtle floral interruption on a splash or welcome surface
- a cinematic particle or petal hint in a transition

Do not:

- decorate every screen
- place floral motifs near dense controls
- make flowers part of core interaction metaphors

## Visual Density

Nodex should feel rich, but not cluttered.

The density target is:

- enough information to feel serious
- enough atmosphere to feel authored
- enough restraint to remain premium
