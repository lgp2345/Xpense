import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobile() {
  return useSyncExternalStore(
    (callback) => {
      const mediaQuery = window.matchMedia(MOBILE_QUERY);
      mediaQuery.addEventListener("change", callback);
      return () => mediaQuery.removeEventListener("change", callback);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
