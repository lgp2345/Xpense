import { expect, it } from "vitest";
import { periodContextFixture } from "./bill-test-fixtures";
import {
  createPeriodBillDraft,
  createPeriodBillDraftSchema,
  parseSignedMoneyMinor,
  toPeriodBillPreviewRequest,
} from "./period-bill-form";

it("默认截止日与读数完全来自服务端上下文，不计算账期", () => {
  const draft = createPeriodBillDraft(periodContextFixture);
  expect(draft.periodStart).toBe("2026-10-05");
  expect(draft.dueDate).toBe("2026-10-05");
  expect(draft.readings.water.reading).toBe("3500");
  expect(
    toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults)?.periodStart,
  ).toBe("2026-10-05");
});
it("金额按整数分解析，支持负费用与安全范围", () => {
  expect(parseSignedMoneyMinor("-20.00")).toBe(-2000);
  expect(parseSignedMoneyMinor("0.01")).toBe(1);
  expect(parseSignedMoneyMinor("1.001")).toBeNull();
  expect(parseSignedMoneyMinor("9007199254740992")).toBeNull();
});
it("保留额外费用名称金额备注校验，空行不提交", () => {
  const draft = createPeriodBillDraft(periodContextFixture);
  draft.extraFees = [{ id: "fee", name: "清洁", amount: "-20", note: "" }];
  expect(toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults)).toBeNull();
  draft.extraFees[0]!.note = "房东确认";
  expect(
    toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults)?.extraFees[0]
      ?.amountMinor,
  ).toBe(-2000);
});
it("接续需要启用表计的基准，价格覆盖必须有原因", () => {
  const draft = createPeriodBillDraft(periodContextFixture);
  expect(
    createPeriodBillDraftSchema(periodContextFixture.defaults, true).safeParse(draft).success,
  ).toBe(false);
  draft.overrideWaterUnitPrice = "4";
  expect(createPeriodBillDraftSchema(periodContextFixture.defaults).safeParse(draft).success).toBe(
    false,
  );
  draft.overrideReason = "水价调整";
  expect(
    toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults)?.overrides
      ?.waterUnitPrice,
  ).toBe("4");
});
