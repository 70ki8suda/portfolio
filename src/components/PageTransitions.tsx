import { useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';
import { createPageTransitions } from '../transitions/pageTransition';

/**
 * Connects the router to the VFX-JS page transition. Renders nothing, on the server
 * and in the browser, and loads the WebGL renderer only in the browser, on demand.
 */
export function PageTransitions() {
  const router = useRouter();

  useEffect(() => {
    const transitions = createPageTransitions();
    // Fires synchronously inside the commit, while the old page is still in the DOM.
    const offBeforeMount = router.subscribe('onBeforeRouteMount', (event) => {
      transitions.beforeCommit({ from: event.fromLocation?.pathname, to: event.toLocation.pathname });
    });
    // Scroll restoration listens to the same event and subscribed first.
    const offRendered = router.subscribe('onRendered', () => transitions.rendered());
    return () => {
      offBeforeMount();
      offRendered();
      transitions.dispose();
    };
  }, [router]);

  return null;
}
