import { useState, useEffect, useCallback, useRef } from 'react';
import { parseUrl, type RouteMatch } from '../utils/routes';

export interface UseRouterResult {
  /** Current parsed route */
  route: RouteMatch;
  /** Navigate to a new URL (pushes to browser history) */
  navigate: (url: string, replace?: boolean) => void;
  /** Whether current route change came from popstate (back/forward) */
  isPopState: boolean;
}

/**
 * Custom hook that bridges browser URL ↔ application state.
 *
 * - On mount: parses window.location.pathname
 * - navigate(): pushes/replaces history and updates route state
 * - popstate listener: re-parses URL on back/forward
 * - isPopState flag: lets consumers avoid pushing duplicate entries
 */
export function useRouter(): UseRouterResult {
  const [route, setRoute] = useState<RouteMatch>(() =>
    parseUrl(window.location.pathname + window.location.search)
  );
  const [isPopState, setIsPopState] = useState(false);
  const isPopStateRef = useRef(false);

  const navigate = useCallback((url: string, replace = false) => {
    if (replace) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
    isPopStateRef.current = false;
    setIsPopState(false);
    setRoute(parseUrl(url));
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      isPopStateRef.current = true;
      setIsPopState(true);
      setRoute(parseUrl(window.location.pathname + window.location.search));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return { route, navigate, isPopState };
}
