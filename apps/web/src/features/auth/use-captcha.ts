import type { CaptchaChallengeResponse } from "@xpense/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export type CaptchaDependency = {
  getCaptcha: () => Promise<CaptchaChallengeResponse>;
};

export function useCaptcha({ getCaptcha }: CaptchaDependency) {
  const [challenge, setChallenge] = useState<CaptchaChallengeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (requestInFlight.current) {
      return;
    }

    requestInFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      setChallenge(await getCaptcha());
    } catch {
      setChallenge(null);
      setError("验证码获取失败，请重试");
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [getCaptcha]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    captchaId: challenge?.captchaId ?? null,
    svg: challenge?.svg ?? null,
    loading,
    error,
    refresh,
  };
}
