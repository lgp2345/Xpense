import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { BillingDistanceBadge } from "./billing-distance-badge";

it.each([
  [-16, "已过 16 天", true],
  [-15, "已过 15 天", true],
  [-14, "已过 14 天", false],
  [0, "今天", false],
  [14, "还有 14 天", false],
  [15, "还有 15 天", true],
  [16, "还有 16 天", true],
] as const)("%s 的文案和红色阈值", (days, text, red) => {
  render(<BillingDistanceBadge daysUntilStart={days} />);
  expect(screen.getByText(text)).toHaveAttribute("data-variant", red ? "destructive" : "secondary");
});
