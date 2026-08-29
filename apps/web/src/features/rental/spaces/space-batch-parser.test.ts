import { describe, expect, it } from "vitest";

import { parseSpaceBatch } from "./space-batch-parser";

describe("parseSpaceBatch", () => {
  it("trims name and code from supported line formats", () => {
    expect(parseSpaceBatch("  101 , 一号房  \n  二号房 ")).toEqual({
      items: [{ code: "101", name: "一号房" }, { name: "二号房" }],
      errors: [],
    });
  });

  it("reports the exact malformed and duplicate line without submitting it", () => {
    expect(parseSpaceBatch("101,一号房\n,二号房\n102,一号房\n103,三号房,额外字段")).toEqual({
      items: [{ code: "101", name: "一号房" }],
      errors: [
        { line: 2, message: "编号不能为空" },
        { line: 3, message: "名称与第 1 行重复" },
        { line: 4, message: "每行只能填写名称或编号,名称" },
      ],
    });
  });

  it("marks entries over the 500-item limit with their original line number", () => {
    const input = Array.from({ length: 501 }, (_, index) => `房间 ${index + 1}`).join("\n");
    const result = parseSpaceBatch(input);

    expect(result.items).toHaveLength(500);
    expect(result.errors).toEqual([{ line: 501, message: "最多可创建 500 个空间" }]);
  });

  it("reports overlong names and codes on their exact lines", () => {
    const overlong = "x".repeat(121);

    expect(parseSpaceBatch(`${overlong}\n${overlong},有效名称`)).toEqual({
      items: [],
      errors: [
        { line: 1, message: "名称不能超过 120 个字符" },
        { line: 2, message: "编号不能超过 120 个字符" },
      ],
    });
  });
});
