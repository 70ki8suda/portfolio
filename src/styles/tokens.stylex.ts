import * as stylex from '@stylexjs/stylex';

export const color = stylex.defineVars({
  canvas: '#f3f1eb',
  canvasDeep: '#e9e6de',
  surface: '#e9e7e1',
  surfaceRaised: '#faf8f3',
  surfaceGlass: 'rgba(250, 248, 243, 0.92)',
  text: '#24282b',
  textMuted: '#656b70',
  textSoft: '#656b70',
  border: 'rgba(36, 40, 43, 0.2)',
  borderFaint: 'rgba(36, 40, 43, 0.1)',
  cyan: '#366b87',
  cyanSoft: 'rgba(54, 107, 135, 0.075)',
  amber: '#a06851',
  inverse: '#f3f1eb',
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
  panel: '0 18px 64px rgba(55, 48, 38, 0.08)',
  signal: '0 0 18px rgba(54, 107, 135, 0.12)',
  atmosphere: 'radial-gradient(ellipse at 75% 32%, rgba(160, 104, 81, 0.06), transparent 58%)',
});
