import type { RentalBillDetail } from "@xpense/shared";
import { DatePickerInput } from "@/components/date-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type BillRevisionMeterDraft,
  type BillRevisionValues,
  billRevisionMeterKey,
  billRevisionMeterSnapshots,
} from "./bill-revision-form";

type ChargeValues = Pick<BillRevisionValues, "meters" | "fixedFees">;

/** 已保存计量与固定月费的完整编辑区域；正式费用和相邻影响交由预览展示。 */
export function BillRevisionChargeFields({
  bill,
  values,
  errors,
  onChange,
  disabled,
  intent = "readings",
}: {
  bill: RentalBillDetail;
  values: ChargeValues;
  errors: ReadonlyMap<string, string>;
  onChange: (values: ChargeValues) => void;
  disabled: boolean;
  intent?: "fees" | "readings";
}) {
  const snapshots = billRevisionMeterSnapshots(bill);
  const updateMeter = (
    index: number,
    field: keyof Omit<BillRevisionMeterDraft, "kind">,
    value: string,
  ) => {
    const selected = values.meters[index];
    const saved = snapshots.find(
      (snapshot) => billRevisionMeterKey(snapshot) === selected?.snapshotKey,
    );
    onChange({
      ...values,
      meters: values.meters.map((meter, position) => {
        if (field === "unitPrice" && meter.kind === selected?.kind)
          return { ...meter, unitPrice: value };
        const current = snapshots.find(
          (snapshot) => billRevisionMeterKey(snapshot) === meter.snapshotKey,
        );
        const readingId =
          field === "startReading"
            ? saved?.startReadingId
            : field === "endReading"
              ? saved?.endReadingId
              : null;
        if (readingId && current)
          return {
            ...meter,
            ...(current.startReadingId === readingId ? { startReading: value } : {}),
            ...(current.endReadingId === readingId ? { endReading: value } : {}),
          };
        return position === index ? { ...meter, [field]: value } : meter;
      }),
    });
  };
  return (
    <fieldset disabled={disabled} className="space-y-3">
      {values.meters.length ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">
            {intent === "fees" ? "本期水电单价" : "历史水电读数与单价"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {intent === "fees"
              ? "沿用本账单读数；单价调整仅影响本张账单。"
              : "每种表计一次更正一个真实边界。共用读数会同时重算相邻区间及账单；更正单价会统一当前账单该表计全部区间，其他账单仍用原价。"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {values.meters.map((meter, index) => {
              const label = meter.kind === "water" ? "水表" : "电表";
              const priceLabel = meter.kind === "water" ? "水费" : "电费";
              const saved = snapshots.find(
                (snapshot) => billRevisionMeterKey(snapshot) === meter.snapshotKey,
              );
              const multiple = values.meters.filter((item) => item.kind === meter.kind).length > 1;
              const suffix = multiple ? `（区间 ${index + 1}）` : "";
              const dateError = errors.get(`meters.${index}.endDate`);
              const dateId = `bill-revision-meter-${index}-date`;
              const fields = [
                { key: "startReading", label: `上次${label}读数` },
                { key: "endReading", label: `本次${label}读数` },
                { key: "unitPrice", label: `${priceLabel}单价（元）` },
              ] as const;
              return (
                <section
                  key={meter.snapshotKey}
                  className="min-w-0 space-y-2 rounded-md border p-3"
                >
                  <h4 className="text-sm font-medium">
                    {label}
                    {suffix}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    上次抄表日期 {saved?.startDate.replaceAll("-", "/")}
                  </p>
                  {fields
                    .filter((field) => intent === "readings" || field.key === "unitPrice")
                    .map((field) => {
                      const id = `bill-revision-meter-${index}-${field.key}`;
                      const error = errors.get(`meters.${index}.${field.key}`);
                      return (
                        <label key={field.key} htmlFor={id} className="block space-y-1 text-sm">
                          <span>
                            {field.label}
                            {suffix}
                          </span>
                          <Input
                            id={id}
                            aria-label={`${field.label}${suffix}`}
                            inputMode="decimal"
                            value={meter[field.key]}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? `${id}-error` : undefined}
                            onChange={(event) => updateMeter(index, field.key, event.target.value)}
                          />
                          {error ? (
                            <p id={`${id}-error`} role="alert" className="text-destructive">
                              {error}
                            </p>
                          ) : null}
                        </label>
                      );
                    })}
                  {intent === "readings" ? (
                    <div className="space-y-1 text-sm">
                      <label htmlFor={dateId}>
                        本次{label}读数日期{suffix}
                      </label>
                      <DatePickerInput
                        id={dateId}
                        aria-label={`本次${label}读数日期${suffix}`}
                        value={meter.endDate}
                        disabled={disabled || multiple}
                        aria-invalid={Boolean(dateError)}
                        aria-describedby={dateError ? `${dateId}-error` : undefined}
                        onChange={(date) => updateMeter(index, "endDate", date ?? "")}
                      />
                      {multiple ? (
                        <p className="text-xs text-muted-foreground">
                          多段计量按原日期定位，仅更正读数；保存单价 {saved?.unitPrice} 元。
                        </p>
                      ) : null}
                      {dateError ? (
                        <p id={`${dateId}-error`} role="alert" className="text-destructive">
                          {dateError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>
      ) : null}
      {values.fixedFees.length ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">本期固定费用</h3>
          <p className="text-xs text-muted-foreground">
            输入本张账单最终金额，0 元保留费用行；删除移除本期行，历史仍可查。不改变合同月标准。
          </p>
          {values.fixedFees.map((fee, index) => {
            const id = `bill-revision-fixed-${index}`;
            const error = errors.get(`fixedFees.${index}.amount`);
            return (
              <div key={fee.id} className="flex items-start gap-2">
                <label htmlFor={id} className="min-w-0 flex-1 space-y-1 text-sm">
                  <span>{fee.name} · 本期金额（元）</span>
                  <Input
                    id={id}
                    aria-label={`固定月费（元） ${index + 1}`}
                    inputMode="decimal"
                    className="tabular-nums"
                    value={fee.amount}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : undefined}
                    onChange={(event) =>
                      onChange({
                        ...values,
                        fixedFees: values.fixedFees.map((current, position) =>
                          position === index ? { ...current, amount: event.target.value } : current,
                        ),
                      })
                    }
                  />
                  {error ? (
                    <p id={`${id}-error`} role="alert" className="text-destructive">
                      {error}
                    </p>
                  ) : null}
                </label>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      aria-label={`删除 ${fee.name}`}
                    >
                      删除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除本期{fee.name}？</AlertDialogTitle>
                      <AlertDialogDescription>
                        仅影响本张账单。确认保存后移除本期费用行，原金额保留在修订历史中。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={disabled}>取消</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={disabled}
                        onClick={() =>
                          onChange({
                            ...values,
                            fixedFees: values.fixedFees.filter((item) => item.id !== fee.id),
                          })
                        }
                      >
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            );
          })}
        </section>
      ) : null}
    </fieldset>
  );
}
