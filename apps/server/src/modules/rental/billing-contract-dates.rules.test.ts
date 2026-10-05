import { describe, expect, it } from "vitest";
import { toBillingContractDates } from "./billing-contract-dates.rules.js";

describe("合同时间的日计费边界", () => {
  it("保留覆盖的开始和结束日，忽略时间差异且不修改合同输入", () => {
    const contract = {
      startDate: "2026-10-05T12:34:56",
      endDate: "2026-11-04T23:59:59",
      actualEndDate: "2026-11-01T23:59:59",
      note: "保留",
    };
    expect(toBillingContractDates(contract)).toEqual({
      startDate: "2026-10-05",
      endDate: "2026-11-04",
      actualEndDate: "2026-11-01",
      note: "保留",
    });
    expect(contract.startDate).toBe("2026-10-05T12:34:56");
  });
  it("兼容数据库空格格式和没有租期的草稿", () => {
    expect(
      toBillingContractDates({ startDate: "2026-10-05 12:34:56", endDate: "2026-11-04 23:59:59" }),
    ).toEqual({ startDate: "2026-10-05", endDate: "2026-11-04" });
    expect(toBillingContractDates({ startDate: null, endDate: null, actualEndDate: null })).toEqual(
      { startDate: null, endDate: null, actualEndDate: null },
    );
  });
});
