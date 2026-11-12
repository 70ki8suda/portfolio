import * as stylex from '@stylexjs/stylex';
import { color } from './tokens.stylex';

export const fluid = stylex.create({
  // A bright interior with beds of green: the whole backdrop until the first frame is drawn,
  // and for good when WebGL is unavailable. Nothing is laid over the canvas.
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    backgroundColor: color.canvas,
    backgroundImage: 'radial-gradient(ellipse 34% 20% at 52% 58%, rgba(88,160,70,0.55), transparent 100%), radial-gradient(ellipse 26% 10% at 46% 40%, rgba(120,180,96,0.4), transparent 100%), linear-gradient(180deg, #e6f0f6 0%, #f6f8f4 30%, #f1f3ee 100%)',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'block',
  },
});
