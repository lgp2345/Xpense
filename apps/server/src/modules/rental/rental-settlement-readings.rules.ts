import { randomUUID } from "node:crypto";
import type {
  ConfirmRentalSettlementRequest,
  PreviewRentalSettlementRequest,
  RentalMeterKind,
} from "@xpense/shared";
import type { MeterReadingWriteInput } from "./meter-readings.repository.js";
import { parseDecimal4 } from "./rental-decimal.rules.js";
import type {
  RentalFinanceSnapshot,
  RentalMeterReading,
  SettlementPlan,
} from "./rental-finance.types.js";

export type SettlementReadingCandidate = {
  reading: RentalMeterReading;
  write: MeterReadingWriteInput;
};

export type SettlementReadingEndUpdate = {
  current: RentalMeterReading;
  predecessorId: string;
};

export function assertSettlementReadingMonotonicity(
  source: RentalFinanceSnapshot,
  requested: { kind: RentalMeterKind; readingDate: string; reading: string },
  spaceId: string,
): void {
  const related = source.readings.filter(
    (reading) =>
      reading.kind === requested.kind &&
      reading.contractId === source.context.contractId &&
      reading.spaceId === spaceId,
  );
  const previous = related
    .filter((reading) => reading.readingDate < requested.readingDate)
    .toSorted((left, right) => right.readingDate.localeCompare(left.readingDate))[0];
  if (previous && parseDecimal4(requested.reading) < parseDecimal4(previous.reading)) {
    throw new RangeError("末次读数不能低于前序水电读数");
  }
  const next = related
    .filter((reading) => reading.readingDate > requested.readingDate)
    .toSorted((left, right) => left.readingDate.localeCompare(right.readingDate))[0];
  if (next && parseDecimal4(requested.reading) > parseDecimal4(next.reading)) {
    throw new RangeError("末次读数不能高于后续水电读数");
  }
}

/** 将终值输入接到实际计费边界上；候选 ID 只用于只读预览计划。 */
export function proposeSettlementReadings(
  source: RentalFinanceSnapshot,
  input: PreviewRentalSettlementRequest,
  idFactory: (index: number) => string = () => randomUUID(),
): SettlementReadingCandidate[] {
  if (source.contract.lifecycleStatus === "cancelled") return [];
  const requested = (input.finalReadings ?? []).filter(
    ({ kind }) =>
      source.terms?.[
        kind === "water" ? "waterCollectionEnabled" : "electricityCollectionEnabled"
      ] !== false,
  );
  const kinds = new Set<RentalMeterKind>();
  for (const item of requested) {
    if (kinds.has(item.kind)) throw new RangeError("结算读数类型不能重复");
    kinds.add(item.kind);
  }
  if (!requested.length) return [];
  const space = source.contract.spaces.length === 1 ? source.contract.spaces[0] : null;
  if (!space) throw new RangeError("结算读数需要唯一合同空间");
  const effectiveEndDate = source.contract.terminationDate ?? source.contract.endDate;
  if (!effectiveEndDate) throw new RangeError("合同缺少实际结束日期");
  const candidates: SettlementReadingCandidate[] = [];
  for (const item of requested) {
    assertSettlementReadingMonotonicity(source, item, space.spaceId);
    const exact = source.readings.filter(
      (reading) =>
        reading.kind === item.kind &&
        reading.readingDate === item.readingDate &&
        reading.contractId === source.context.contractId &&
        reading.spaceId === space.spaceId &&
        parseDecimal4(reading.reading) === parseDecimal4(item.reading),
    );
    if (exact.length > 1) throw new RangeError("末次读数没有唯一匹配的内部读数记录");
    if (exact.length === 1) continue;
    if (
      source.readings.some(
        (reading) =>
          reading.kind === item.kind &&
          reading.readingDate === item.readingDate &&
          reading.contractId === source.context.contractId &&
          reading.spaceId === space.spaceId,
      )
    ) {
      throw new RangeError("末次读数与同日已保存读数冲突");
    }
    const predecessorId = terminalPredecessor(source, item, effectiveEndDate);
    const write: MeterReadingWriteInput = {
      ...item,
      spaceId: space.spaceId,
      predecessorId,
    };
    candidates.push({
      write,
      reading: {
        ...write,
        id: idFactory(candidates.length + 1),
        contractId: source.context.contractId,
        revision: 1,
      },
    });
  }
  return candidates;
}

/** 仅为已经从 P→E 修订为 P→T 的当前账单安排 E 的后继前驱。 */
export function settlementReadingEndsToRewire(
  source: RentalFinanceSnapshot,
  input: ConfirmRentalSettlementRequest,
  plan: SettlementPlan,
): SettlementReadingEndUpdate[] {
  const updates = new Map<string, SettlementReadingEndUpdate>();
  for (const item of input.finalReadings ?? []) {
    const space = source.contract.spaces.length === 1 ? source.contract.spaces[0] : null;
    if (!space) throw new RangeError("结算读数需要唯一合同空间");
    const terminals = source.readings.filter(
      (reading) =>
        reading.kind === item.kind &&
        reading.readingDate === item.readingDate &&
        reading.contractId === source.context.contractId &&
        reading.spaceId === space.spaceId &&
        parseDecimal4(reading.reading) === parseDecimal4(item.reading),
    );
    if (terminals.length !== 1) throw new RangeError("结算末次读数未唯一写入来源");
    const terminal = terminals[0];
    if (!terminal) throw new RangeError("结算末次读数未写入来源");
    for (const bill of source.bills) {
      if (bill.type !== "monthly" || bill.status !== "active" || bill.modelVersion !== 2) continue;
      for (const line of bill.lines) {
        const saved = line.feeSnapshot;
        if (
          saved?.kind !== item.kind ||
          !(saved.startDate < item.readingDate && item.readingDate < saved.endDate)
        ) {
          continue;
        }
        const start = source.readings.find(
          (reading) =>
            reading.id === saved.startReadingId &&
            reading.kind === item.kind &&
            reading.contractId === source.context.contractId,
        );
        if (!start || start.spaceId !== terminal.spaceId)
          throw new RangeError("已计费水电区间的空间身份已变化");
        const revisedIntervals = plan.finalBills.flatMap((planned) =>
          planned.lines.flatMap((candidate) => {
            const snapshot = candidate.feeSnapshot;
            if (
              snapshot?.kind !== item.kind ||
              snapshot.startReadingId !== saved.startReadingId ||
              snapshot.endReadingId !== terminal.id
            )
              return [];
            const candidateStart = source.readings.find(
              (reading) => reading.id === snapshot.startReadingId,
            );
            const candidateEnd = source.readings.find(
              (reading) => reading.id === snapshot.endReadingId,
            );
            return candidateStart?.spaceId === space.spaceId &&
              candidateEnd?.spaceId === space.spaceId
              ? [{ planned, candidate }]
              : [];
          }),
        );
        if (revisedIntervals.length !== 1)
          throw new RangeError("结算计划缺少唯一的 P→T 水电账单区间");
        if (terminal.predecessorId !== saved.startReadingId)
          throw new RangeError("末次读数前驱与已计费水电区间不一致");
        const current = source.readings.find(({ id }) => id === saved.endReadingId);
        if (!current) throw new RangeError("已计费末端读数已变化，请重新读取");
        if (current.predecessorId === terminal.id) continue;
        if (current.predecessorId !== saved.startReadingId)
          throw new RangeError("后续水电读数链已变化，请重新读取");
        updates.set(current.id, { current, predecessorId: terminal.id });
      }
    }
  }
  return [...updates.values()];
}

function terminalPredecessor(
  source: RentalFinanceSnapshot,
  requested: { kind: RentalMeterKind; readingDate: string },
  effectiveEndDate: string,
): string {
  const intervals = source.bills.flatMap((bill) =>
    bill.type !== "monthly" || bill.status !== "active" || bill.modelVersion !== 2
      ? []
      : bill.lines.flatMap((line) => {
          const snapshot = line.feeSnapshot;
          if (
            snapshot?.kind !== requested.kind ||
            !snapshot.startReadingId ||
            !snapshot.endReadingId
          ) {
            return [];
          }
          return [{ snapshot }];
        }),
  );
  const crossing = intervals.filter(
    ({ snapshot }) =>
      snapshot.startDate < requested.readingDate && requested.readingDate < snapshot.endDate,
  );
  if (crossing.length > 1) throw new RangeError("末次读数落入重复计费区间");
  if (crossing[0]) return crossing[0].snapshot.startReadingId;
  const latestBilled = intervals
    .filter(({ snapshot }) => snapshot.endDate <= effectiveEndDate)
    .toSorted((left, right) => left.snapshot.endDate.localeCompare(right.snapshot.endDate))
    .at(-1);
  if (latestBilled) return latestBilled.snapshot.endReadingId;
  const baselines = source.readings.filter(
    (reading) =>
      reading.kind === requested.kind &&
      reading.contractId === source.context.contractId &&
      reading.predecessorId === null,
  );
  const [baseline] = baselines;
  if (baselines.length !== 1 || !baseline) throw new RangeError("合同缺少唯一水电读数起点");
  return baseline.id;
}
