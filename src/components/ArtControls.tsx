import * as stylex from '@stylexjs/stylex';
import { Button } from '@base-ui/react/button';
import { PlaybackIcon } from './Icons';
import { controls } from '../styles/controls.stylex';

interface ArtControlsProps {
  paused: boolean;
  reducedMotion: boolean;
  onPausedChange: (paused: boolean) => void;
}

export function ArtControls({
  paused,
  reducedMotion,
  onPausedChange,
}: ArtControlsProps) {
  return (
    <div {...stylex.props(controls.root)} role="group" aria-label="Artwork controls">
      <Button
        onClick={() => onPausedChange(!paused)}
        disabled={reducedMotion}
        aria-label={reducedMotion ? 'Animation paused for reduced motion' : paused ? 'Resume animation' : 'Pause animation'}
        {...stylex.props(controls.pause, paused && controls.pauseActive)}
      >
        <PlaybackIcon paused={paused} />
        <span>{reducedMotion ? 'Reduced' : paused ? 'Resume' : 'Pause'}</span>
      </Button>
    </div>
  );
}
