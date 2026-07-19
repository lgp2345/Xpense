const applicationOrigin = "https://xpense.local";

export function getSafeRedirectPath(value: string | undefined): string {
  if (!value?.startsWith("/")) {
    return "/";
  }

  try {
    const redirectUrl = new URL(value, applicationOrigin);

    if (redirectUrl.origin !== applicationOrigin) {
      return "/";
    }

    if (redirectUrl.pathname.replace(/\/+$/, "") === "/login") {
      return "/";
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  } catch {
    return "/";
  }
}
