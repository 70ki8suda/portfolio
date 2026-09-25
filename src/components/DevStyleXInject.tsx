import { useEffect } from 'react';

/**
 * Development only: without an HTML entry, the StyleX dev stylesheet and its
 * HMR runtime are loaded from the document head. Production CSS is appended to
 * the built stylesheet by `@stylexjs/unplugin`.
 */
export function DevStyleXInject() {
  useEffect(() => {
    // @ts-expect-error Virtual module provided by @stylexjs/unplugin in dev.
    import('virtual:stylex:runtime');
  }, []);
  return <link rel="stylesheet" href="/virtual:stylex.css" />;
}
