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
it("无抄表日期时仍能预览读数，空读数省略且真实零值保留", () => {
  const draft = createPeriodBillDraft(periodContextFixture);
  draft.readings.water.reading = "0";
  draft.readings.electricity.reading = "";
  draft.baselineReadings.water.reading = "0";
  draft.baselineReadings.electricity.reading = "50";

  expect(createPeriodBillDraftSchema(periodContextFixture.defaults).safeParse(draft).success).toBe(
    true,
  );
  expect(
    toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults)?.readings,
  ).toEqual([{ kind: "water", reading: "0" }]);
  expect(
    createPeriodBillDraftSchema(periodContextFixture.defaults, true).safeParse(draft).success,
  ).toBe(true);
});
it("金额按整数分解析，支持负费用与安全范围", () => {
  expect(parseSignedMoneyMinor("-20.00")).toBe(-2000);
  expect(parseSignedMoneyMinor("0.01")).toBe(1);
  expect(parseSignedMoneyMinor("1.001")).toBeNull();
  expect(parseSignedMoneyMinor("9007199254740992")).toBeNull();
});
it("新增事项需要名称和有效金额，单项备注可留空", () => {
  const draft = createPeriodBillDraft(periodContextFixture);
  draft.extraFees = [{ id: "fee", name: "", amount: "-20", note: "" }];
  expect(toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults)).toBeNull();
  draft.extraFees[0]!.name = "清洁";
  expect(
    toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults)?.extraFees[0]
      ?.amountMinor,
  ).toBe(-2000);
});
it("带出合同金额和单价，未改价及等价小数不产生覆盖", () => {
  const draft = createPeriodBillDraft(periodContextFixture);
  expect(draft.overrideWaterUnitPrice).toBe("3.0000");
  expect(draft.overrideElectricityUnitPrice).toBe("4.0000");
  expect(draft.overrideFixedFees[0]?.amount).toBe("500.00");
  draft.overrideWaterUnitPrice = "03.0";
  expect(
    toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults)?.overrides,
  ).toBeUndefined();
});
it("修改合同事项金额只覆盖本期，并携带整张账单备注", () => {
  const draft = createPeriodBillDraft(periodContextFixture);
  draft.overrideFixedFees[0]!.amount = "0";
  expect(toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults)).toBeNull();
  draft.overrideReason = "  本期物业费减免  ";
  expect(
    toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults),
  ).toMatchObject({
    note: "本期物业费减免",
    overrides: {
      fixedFees: [{ id: periodContextFixture.defaults.fixedFees[0]!.id, periodAmountMinor: 0 }],
      reason: "本期物业费减免",
    },
  });
});
it("填写独立备注无需改价，空单价和超长备注不能提交", () => {
  const draft = createPeriodBillDraft(periodContextFixture);
  draft.overrideReason = "线下核对";
  const request = toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults);
  expect(request).toMatchObject({ note: "线下核对" });
  expect(request?.overrides).toBeUndefined();
  draft.overrideWaterUnitPrice = "";
  expect(toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults)).toBeNull();
  draft.overrideWaterUnitPrice = "3";
  draft.overrideReason = "字".repeat(1001);
  expect(toPeriodBillPreviewRequest("contract", draft, periodContextFixture.defaults)).toBeNull();
});
it("安全整数边界的合同金额带出后保持精度", () => {
  const context = {
    ...periodContextFixture,
    defaults: {
      ...periodContextFixture.defaults,
      fixedFees: [{ id: "large", name: "固定费", periodAmountMinor: Number.MAX_SAFE_INTEGER }],
    },
  };
  const draft = createPeriodBillDraft(context);
  expect(draft.overrideFixedFees[0]?.amount).toBe("90071992547409.91");
  expect(
    toPeriodBillPreviewRequest("contract", draft, context.defaults)?.overrides,
  ).toBeUndefined();
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
