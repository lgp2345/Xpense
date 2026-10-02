const labels: Record<string, string> = {
  waterBaseline: "水表入住底数",
  electricityBaseline: "电表入住底数",
  waterReading: "水表本期读数",
  electricityReading: "电表本期读数",
  dueDate: "账单到期日",
  billingMonth: "账单月份",
  chargeTerms: "合同收费标准",
};
export function monthlyMissingFieldLabel(field: string): string {
  return labels[field] ?? "账单必要资料";
}
