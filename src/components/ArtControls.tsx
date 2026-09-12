import * as stylex from '@stylexjs/stylex';
import { Button } from '@base-ui/react/button';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Slider } from '@base-ui/react/slider';
import type { SceneMode, SignalSceneProps } from '../scene/SignalScene';
import { PlaybackIcon } from './Icons';
import { controls } from '../styles/controls.stylex';
import { shared } from '../styles/shared.stylex';

const modes: { value: SceneMode; label: string; number: string }[] = [
  { value: 'bloom', label: 'Bloom', number: '01' },
  { value: 'geometry', label: 'Geometry', number: '02' },
  { value: 'interference', label: 'Interference', number: '03' },
];

interface ArtControlsProps extends SignalSceneProps {
  reducedMotion: boolean;
  onModeChange: (mode: SceneMode) => void;
  onIntensityChange: (intensity: number) => void;
  onPausedChange: (paused: boolean) => void;
}

export function ArtControls({
  mode,
  intensity,
  paused,
  reducedMotion,
  onModeChange,
  onIntensityChange,
  onPausedChange,
}: ArtControlsProps) {
  return (
    <div {...stylex.props(controls.root)} aria-label="Artwork controls">
      <div {...stylex.props(controls.modes)}>
        <span id="scene-mode-label" {...stylex.props(shared.label, controls.caption)}>Change the state</span>
        <RadioGroup
          aria-labelledby="scene-mode-label"
          value={mode}
          onValueChange={onModeChange}
          {...stylex.props(controls.modeGroup)}
        >
          {modes.map((item) => (
            <Radio.Root
              key={item.value}
              value={item.value}
              nativeButton
              render={<button type="button" />}
              {...stylex.props(controls.mode, mode === item.value && controls.modeActive)}
            >
              <span {...stylex.props(controls.modeNumber)} aria-hidden="true">{item.number}</span>
              {item.label}
            </Radio.Root>
          ))}
        </RadioGroup>
      </div>
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
        aria-pressed={paused}
        {...stylex.props(controls.pause, paused && controls.pauseActive)}
      >
        <PlaybackIcon paused={paused} />
        <span>{reducedMotion ? 'Reduced motion' : paused ? 'Resume' : 'Pause'}</span>
      </Button>
    </div>
  );
}
