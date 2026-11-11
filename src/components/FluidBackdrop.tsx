import { useEffect, useRef } from 'react';
import * as stylex from '@stylexjs/stylex';
import { fluid } from '../styles/fluid.stylex';
import { createFluidBackdrop, type FluidBackdropHandle } from '../scene/fluid/fluidBackdrop';
import type { GrassMode } from '../scene/fluid/grass';

interface FluidBackdropProps {
  paused: boolean;
  reducedMotion: boolean;
  mode: GrassMode;
  /** 0..1 */
  intensity: number;
}

/**
 * The hero's simulated picture: a wetland — jade water flowing among islands of grass that lean in its wind.
 * The simulation lives outside React: props reach it through a handle, and nothing it
 * does causes a render.
 */
export function FluidBackdrop({ paused, reducedMotion, mode, intensity }: FluidBackdropProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<FluidBackdropHandle | null>(null);
  const pausedRef = useRef(paused);
  const styleRef = useRef({ mode, intensity });

  useEffect(() => {
    pausedRef.current = paused;
    handleRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    styleRef.current = { mode, intensity };
    handleRef.current?.setStyle(mode, intensity);
  }, [mode, intensity]);

  useEffect(() => {
    if (!rootRef.current || !canvasRef.current) return;
    const handle = createFluidBackdrop(rootRef.current, canvasRef.current, { paused: pausedRef.current, reducedMotion, ...styleRef.current });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.dispose();
    };
  }, [reducedMotion]);

  return (
    <div ref={rootRef} data-testid="fluid-backdrop" data-state="idle" aria-hidden="true" {...stylex.props(fluid.root)}>
      <canvas ref={canvasRef} data-testid="fluid-canvas" {...stylex.props(fluid.canvas)} />
      <div {...stylex.props(fluid.veil)} />
    </div>
  );
}
