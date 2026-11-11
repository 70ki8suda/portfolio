import * as stylex from '@stylexjs/stylex';
import { color, space } from './tokens.stylex';

export const controls = stylex.create({
  root: {
    position: 'relative',
    zIndex: 3,
    display: 'flex',
  },
  pause: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    minHeight: space.control,
    paddingInline: 10,
    backgroundColor: { default: 'transparent', ':hover': color.surface },
    color: { default: color.textMuted, ':hover': color.text },
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: 3,
    fontSize: 12,
    transitionProperty: 'background-color, color',
    transitionDuration: '180ms',
  },
  pauseActive: { color: color.amber },
});
