import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { BillDetailSections } from "./bill-detail-sections";
import { billFixture } from "./bill-test-fixtures";

it("展示随账单快照保存的备注，兼容无备注的历史账单", () => {
  const view = render(
    <BillDetailSections
      bill={{ ...billFixture, snapshot: { ...billFixture.snapshot, note: "本期协商收费" } }}
    />,
  );
  expect(screen.getByRole("heading", { name: "账单备注" })).toBeInTheDocument();
  expect(screen.getByText("本期协商收费")).toBeInTheDocument();
  view.rerender(<BillDetailSections bill={billFixture} />);
  expect(screen.queryByRole("heading", { name: "账单备注" })).not.toBeInTheDocument();
});
