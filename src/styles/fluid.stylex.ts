import * as stylex from '@stylexjs/stylex';
import { color } from './tokens.stylex';

export const fluid = stylex.create({
  // Ivory paper with washes of the three inks. This is the whole backdrop until the first
  // simulated frame, and for good when WebGL is unavailable.
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    backgroundColor: color.canvas,
    backgroundImage: 'radial-gradient(ellipse 34% 40% at 72% 36%, rgba(47,158,160,0.5), transparent 100%), radial-gradient(ellipse 30% 36% at 52% 58%, rgba(176,62,150,0.34), transparent 100%), radial-gradient(ellipse 26% 32% at 86% 64%, rgba(84,96,196,0.36), transparent 100%)',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'block',
  },
  veil: {
    position: 'absolute',
    inset: 0,
    backgroundImage: {
      // Landscape: the title's column stays paper; the meadow on the right is left alone.
      default: 'linear-gradient(90deg, rgba(243,241,235,0.8), rgba(243,241,235,0.42) 30%, rgba(243,241,235,0) 52%), linear-gradient(180deg, rgba(243,241,235,0.84), transparent 16%)',
      // Portrait: the meadow stands above the title and thins into the paper under it.
      '@media (max-width: 680px)': 'linear-gradient(0deg, rgba(243,241,235,0.95) 30%, rgba(243,241,235,0.82) 44%, rgba(243,241,235,0.3) 52%, rgba(243,241,235,0) 60%), linear-gradient(180deg, rgba(243,241,235,0.9), transparent 14%)',
      // Short phones: the title starts higher, and so does the paper.
      '@media (max-width: 680px) and (max-height: 640px)': 'linear-gradient(0deg, rgba(243,241,235,0.95) 54%, rgba(243,241,235,0.82) 64%, rgba(243,241,235,0.3) 71%, rgba(243,241,235,0) 78%), linear-gradient(180deg, rgba(243,241,235,0.9), transparent 12%)',
    },
  },
});
