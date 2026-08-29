import type { BatchCreateRentalSpaceItem } from "@xpense/shared";

export type SpaceBatchLineError = { line: number; message: string };
export type SpaceBatchParseResult = {
  items: BatchCreateRentalSpaceItem[];
  errors: SpaceBatchLineError[];
};

const MAX_BATCH_ITEMS = 500;

/** 将逐行录入转换为批量接口输入，并在提交前标出可修正的行级错误。 */
export function parseSpaceBatch(input: string): SpaceBatchParseResult {
  const items: BatchCreateRentalSpaceItem[] = [];
  const errors: SpaceBatchLineError[] = [];
  const seenNames = new Map<string, number>();
  const seenCodes = new Map<string, number>();

  for (const [index, rawLine] of input.split(/\r?\n/).entries()) {
    const line = index + 1;
    const columns = rawLine.split(",");
    if (columns.length > 2) {
      errors.push({ line, message: "每行只能填写名称或编号,名称" });
      continue;
    }
    const [first, second] = columns.map((value) => value.trim());
    const code = second === undefined ? undefined : first;
    const name = second === undefined ? first : second;
    if (!name) {
      errors.push({ line, message: "名称不能为空" });
      continue;
    }
    if (code === "") {
      errors.push({ line, message: "编号不能为空" });
      continue;
    }
    const duplicateNameLine = seenNames.get(name);
    if (duplicateNameLine !== undefined) {
      errors.push({ line, message: `名称与第 ${duplicateNameLine} 行重复` });
      continue;
    }
    const duplicateCodeLine = code ? seenCodes.get(code) : undefined;
    if (duplicateCodeLine !== undefined) {
      errors.push({ line, message: `编号与第 ${duplicateCodeLine} 行重复` });
      continue;
    }
    if (items.length >= MAX_BATCH_ITEMS) {
      errors.push({ line, message: "最多可创建 500 个空间" });
      continue;
    }
    seenNames.set(name, line);
    if (code) seenCodes.set(code, line);
    items.push({ name, ...(code ? { code } : {}) });
  }

  return { items, errors };
}
