import * as stylex from '@stylexjs/stylex';

export const color = stylex.defineVars({
  canvas: '#070d14',
  canvasDeep: '#050a10',
  surface: '#0c1620',
  surfaceRaised: '#12222f',
  surfaceGlass: 'rgba(13, 25, 36, 0.86)',
  text: '#eef2ee',
  textMuted: '#a7b6c2',
  textSoft: '#8194a5',
  border: 'rgba(173, 204, 224, 0.18)',
  borderFaint: 'rgba(173, 204, 224, 0.08)',
  cyan: '#9de2e6',
  cyanSoft: 'rgba(157, 226, 230, 0.1)',
  amber: '#e2ad86',
  inverse: '#0a151d',
});

export const type = stylex.defineVars({
  sans: '"Space Grotesk Variable", "Arial", sans-serif',
  mono: '"DM Mono", "SFMono-Regular", Consolas, monospace',
  micro: '0.625rem',
  label: '0.6875rem',
  body: '1rem',
  leading: '1.65',
});

export const space = stylex.defineVars({
  gutter: 'clamp(1.25rem, 4.5vw, 5.5rem)',
  section: 'clamp(5rem, 10vw, 10rem)',
  hairline: '1px',
  control: '2.75rem',
  maxWidth: '1800px',
});

export const depth = stylex.defineVars({
  panel: '0 18px 64px rgba(0, 0, 0, 0.28)',
  signal: '0 0 18px rgba(157, 226, 230, 0.18)',
  atmosphere: 'radial-gradient(ellipse at 75% 32%, rgba(28, 66, 82, 0.22), transparent 58%)',
});
