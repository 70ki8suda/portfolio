import * as stylex from '@stylexjs/stylex';
import { color, space, type } from './tokens.stylex';

export const shared = stylex.create({
  label: {
    fontFamily: type.mono,
    fontSize: type.label,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  muted: { color: color.textMuted },
  soft: { color: color.textSoft },
  cyan: { color: color.cyan },
  amber: { color: color.amber },
  section: {
    marginInline: space.gutter,
    paddingBlock: space.section,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: color.border,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 24,
    marginBottom: { default: 56, '@media (max-width: 680px)': 36 },
  },
  sectionTitle: {
    fontWeight: 400,
    fontSize: 'clamp(2.25rem, 4.5vw, 4.75rem)',
    lineHeight: 1.08,
    letterSpacing: '-0.055em',
  },
  sectionIndex: {
    color: color.textSoft,
    display: { default: 'block', '@media (max-width: 460px)': 'none' },
  },
  textLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 12,
    minHeight: space.control,
    fontSize: 13,
    color: { default: color.text, ':hover': color.cyan },
    transitionProperty: 'color',
    transitionDuration: '180ms',
  },
  screenReaderOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
});
