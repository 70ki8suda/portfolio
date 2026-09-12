import * as stylex from '@stylexjs/stylex';
import { color } from './tokens.stylex';

export const nature = stylex.create({
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    backgroundColor: color.canvas,
    backgroundImage: 'linear-gradient(135deg, #ccd8cb, #d7e5e7 50%, #efe9d8)',
  },
  poster: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  video: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: 0,
  },
  veil: {
    position: 'absolute',
    inset: 0,
    backgroundImage: {
      default: 'linear-gradient(0deg, rgba(243,241,235,0.88), transparent 56%), linear-gradient(90deg, rgba(243,241,235,0.74), rgba(243,241,235,0.32) 38%, rgba(243,241,235,0.04) 68%), linear-gradient(180deg, rgba(243,241,235,0.84), transparent 18%)',
      '@media (max-width: 680px)': 'linear-gradient(0deg, rgba(243,241,235,0.94) 4%, rgba(243,241,235,0.7) 42%, rgba(243,241,235,0.12) 72%), linear-gradient(180deg, rgba(243,241,235,0.9), transparent 22%)',
    },
  },
});
