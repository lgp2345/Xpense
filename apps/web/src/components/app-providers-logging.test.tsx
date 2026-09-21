import { useQuery } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api-client";
import { AppProviders } from "./app-providers";

afterEach(cleanup);
it("does not repeat API failures that already exhausted the client's retries", async () => {
  const queryFn = vi.fn().mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "失败"));
  function Probe() {
    const query = useQuery({ queryKey: ["failure"], queryFn });
    return <div>{query.isError ? "请求最终失败" : "加载中"}</div>;
  }
  render(
    <AppProviders>
      <Probe />
    </AppProviders>,
  );
  expect(await screen.findByText("请求最终失败", {}, { timeout: 2000 })).toBeInTheDocument();
  expect(queryFn).toHaveBeenCalledTimes(1);
});
