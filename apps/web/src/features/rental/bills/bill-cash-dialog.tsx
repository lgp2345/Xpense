import type { FormEvent, ReactNode } from "react";
import { DatePickerInput } from "@/components/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type BillCashDialogFrameProps = {
  title: string;
  description: ReactNode;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer: ReactNode;
};

export function BillCashDialogFrame({
  title,
  description,
  busy,
  onOpenChange,
  onSubmit,
  children,
  footer,
}: BillCashDialogFrameProps) {
  return (
    <Dialog open onOpenChange={(open) => !busy && onOpenChange(open)}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
          <button className="sr-only" type="submit" tabIndex={-1} aria-hidden="true">
            提交
          </button>
          <div className="shrink-0 border-t pt-3">{footer}</div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type BillCashFormFieldsProps = {
  occurredOn: string;
  note: string;
  dateError?: string;
  onDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  disabled?: boolean;
  children?: ReactNode;
};

export function BillCashFormFields({
  occurredOn,
  note,
  dateError,
  onDateChange,
  onNoteChange,
  disabled,
  children,
}: BillCashFormFieldsProps) {
  return (
    <div className="grid gap-3">
      <div className="space-y-1 text-sm">
        <span className="block">发生日期</span>
        <DatePickerInput
          id="bill-cash-occurred-on"
          aria-label="收款日期"
          aria-invalid={Boolean(dateError)}
          aria-describedby={dateError ? "bill-cash-occurred-on-error" : undefined}
          disabled={disabled}
          value={occurredOn}
          onChange={(value) => onDateChange(value ?? "")}
        />
        {dateError ? (
          <p id="bill-cash-occurred-on-error" role="alert" className="text-destructive">
            {dateError}
          </p>
        ) : null}
      </div>
      {children}
      <label className="block space-y-1 text-sm" htmlFor="bill-cash-note">
        <span>备注</span>
        <Input
          id="bill-cash-note"
          value={note}
          disabled={disabled}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </label>
    </div>
  );
}
