import { Button } from "@/components/ui/button";
import { PeriodBillFields } from "./period-bill-fields";
import { PeriodBillPreview } from "./period-bill-preview";
import type { usePeriodBillSession } from "./use-period-bill-session";
export function PeriodBillEditor({
  draft,
  context,
  currentPreview,
  previewBusy,
  errors,
  busy,
  page,
  setPage,
  update,
  periods,
  error,
  canConfirm,
  request,
  onOpenChange,
  onSubmit,
  repreview,
  canRepreview,
}: ReturnType<typeof usePeriodBillSession>) {
  return (
    <form className="flex flex-col flex-1 min-h-0 min-w-0" onSubmit={onSubmit}>
      <div className="space-y-4 flex-1 min-h-0 py-4 px-5 overflow-y-auto sm:px-6">
        <PeriodBillFields
          draft={draft}
          context={context}
          preview={currentPreview}
          previewBusy={previewBusy}
          errors={errors}
          disabled={busy}
          page={page}
          onPage={setPage}
          onChange={update}
        />
        {periods.isFetching ? <p role="status">正在读取候选账期…</p> : null}
        {periods.isError ? <p role="alert">候选账期读取失败，请重试。</p> : null}
        {previewBusy ? <p role="status">正在计算账单预览…</p> : null}
        {currentPreview ? <PeriodBillPreview preview={currentPreview} /> : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t py-4 px-5 shrink-0 sm:px-6">
        <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !request || !canRepreview}
          onClick={repreview}
        >
          重新预览
        </Button>
        <Button
          type="submit"
          disabled={!canConfirm}
          title={!canConfirm ? "请补齐输入并等待有效预览后确认" : undefined}
        >
          {busy ? "正在确认…" : "确认生成"}
        </Button>
      </div>
    </form>
  );
}
