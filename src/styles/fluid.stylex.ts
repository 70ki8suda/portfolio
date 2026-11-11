import * as stylex from '@stylexjs/stylex';
import { color } from './tokens.stylex';

export const fluid = stylex.create({
  // Ivory paper with washes of jade water and island green. This is the whole backdrop until the first
  // simulated frame, and for good when WebGL is unavailable.
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    backgroundColor: color.canvas,
    backgroundImage: 'radial-gradient(ellipse 30% 22% at 78% 70%, rgba(38,104,74,0.5), transparent 100%), radial-gradient(ellipse 22% 14% at 60% 44%, rgba(58,128,96,0.36), transparent 100%), radial-gradient(ellipse 46% 52% at 72% 50%, rgba(104,176,150,0.42), transparent 100%)',
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
      // Landscape: the title's column stays paper; the wetland on the right is left alone.
      default: 'linear-gradient(90deg, rgba(243,241,235,0.97), rgba(243,241,235,0.95) 32%, rgba(243,241,235,0.8) 45%, rgba(243,241,235,0.22) 55%, rgba(243,241,235,0) 68%), linear-gradient(180deg, rgba(243,241,235,0.84), transparent 16%)',
      // Portrait: the wetland lies above the title and thins into the paper under it.
      '@media (max-width: 680px)': 'linear-gradient(0deg, rgba(243,241,235,0.95) 30%, rgba(243,241,235,0.82) 44%, rgba(243,241,235,0.3) 52%, rgba(243,241,235,0) 60%), linear-gradient(180deg, rgba(243,241,235,0.9), transparent 14%)',
      // Short phones: the title starts higher, and so does the paper.
      '@media (max-width: 680px) and (max-height: 640px)': 'linear-gradient(0deg, rgba(243,241,235,0.95) 54%, rgba(243,241,235,0.82) 64%, rgba(243,241,235,0.3) 71%, rgba(243,241,235,0) 78%), linear-gradient(180deg, rgba(243,241,235,0.9), transparent 12%)',
    },
  },
});
