export function ArrowIcon({ direction = 'diagonal' }: { direction?: 'diagonal' | 'down' | 'right' }) {
  const path = direction === 'down'
    ? 'M12 4v16m-6-6 6 6 6-6'
    : direction === 'right'
      ? 'M4 12h16m-6-6 6 6-6 6'
      : 'M5 19 19 5M5 5h14v14';

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function SignalMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3h18v18H3zM3 21 21 3M3 12h18M12 3v18" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function PlaybackIcon({ paused }: { paused: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {paused
        ? <path d="m5 3 7 5-7 5V3Z" stroke="currentColor" strokeWidth="1.3" />
        : <path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2" />}
    </svg>
  );
}
