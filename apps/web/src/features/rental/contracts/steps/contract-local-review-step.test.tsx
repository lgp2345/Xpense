import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultContractFormValues } from "../contract-form-schema";
import { ContractLocalReviewStep } from "./contract-local-review-step";

describe("contract local review billing preview", () => {
  it.each([
    "1",
    "3",
  ] as const)("shows numbered calendar periods for a %s-month payment interval", (interval) => {
    render(
      <ContractLocalReviewStep
        values={{
          ...defaultContractFormValues(),
          startDate: "2026-09-26",
          endDate: "2027-08-31",
          billingAnchor: "calendar_month",
          paymentIntervalMonths: interval,
        }}
        names={{}}
        busy={false}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    const preview = screen.getByRole("region", { name: "账期预览" });
    expect(within(preview).getByText(`共 ${12 / Number(interval)} 期`)).toBeInTheDocument();
    const list = within(preview).getByRole("list", { name: "账期列表" });
    expect(list).toHaveAttribute("tabindex", "0");
    const periods = within(list).getAllByRole("listitem");
    expect(periods).toHaveLength(12 / Number(interval));
    expect(periods[0]).toHaveTextContent(
      `第 1 期2026-09-26 至 ${interval === "1" ? "2026-09-30" : "2026-11-30"}`,
    );
    expect(periods.at(-1)).toHaveTextContent("2027-08-31");
  });

  it("shows the same contract-start billing rule as the terms step", () => {
    render(
      <ContractLocalReviewStep
        values={{
          ...defaultContractFormValues(),
          startDate: "2026-09-26",
          endDate: "2027-08-31",
          billingAnchor: "contract_start",
          paymentIntervalMonths: "3",
        }}
        names={{}}
        busy={false}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    const preview = screen.getByRole("region", { name: "账期预览" });
    expect(within(preview).getByText("按合同起始日计费")).toBeInTheDocument();
    expect(within(preview).getByRole("listitem")).toHaveTextContent(
      "计费规则2026-09-26 起，按 3 个月一期",
    );
  });
});
