import * as stylex from '@stylexjs/stylex';
import { Button } from '@base-ui/react/button';
import { Slider } from '@base-ui/react/slider';
import { PlaybackIcon } from './Icons';
import { controls } from '../styles/controls.stylex';
import { shared } from '../styles/shared.stylex';

interface ArtControlsProps {
  /** 0..1 */
  intensity: number;
  paused: boolean;
  reducedMotion: boolean;
  onIntensityChange: (intensity: number) => void;
  onPausedChange: (paused: boolean) => void;
}

export function ArtControls({
  intensity,
  paused,
  reducedMotion,
  onIntensityChange,
  onPausedChange,
}: ArtControlsProps) {
  return (
    <div {...stylex.props(controls.root)} role="group" aria-label="Artwork controls">
      <Slider.Root
        value={Math.round(intensity * 100)}
        min={0}
        max={100}
        step={1}
        onValueChange={(value) => {
          if (typeof value === 'number') onIntensityChange(value / 100);
        }}
        {...stylex.props(controls.intensity)}
      >
        <div {...stylex.props(controls.sliderHeading)}>
          <Slider.Label {...stylex.props(shared.label)}>Intensity</Slider.Label>
          <span {...stylex.props(shared.label, controls.value)} aria-hidden="true">
            {Math.round(intensity * 100).toString().padStart(2, '0')}<span {...stylex.props(controls.percent)}> / 100</span>
          </span>
        </div>
        <Slider.Control {...stylex.props(controls.sliderControl)}>
          <Slider.Track {...stylex.props(controls.track)}>
            <Slider.Indicator {...stylex.props(controls.indicator)} />
            <Slider.Thumb {...stylex.props(controls.thumb)} />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
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
