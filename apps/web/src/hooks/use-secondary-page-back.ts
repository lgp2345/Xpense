import { useCanGoBack, useRouter } from "@tanstack/react-router";

export function useSecondaryPageBack(onFallback: () => void) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return () => {
    if (canGoBack) router.history.back();
    else onFallback();
  };
}
