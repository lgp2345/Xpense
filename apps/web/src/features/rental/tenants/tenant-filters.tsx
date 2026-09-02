import type { RentalIdentityDocumentType, RentalTenantType } from "@xpense/shared";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ListRentalTenantsQuery } from "../../../services/rental-api";
import { normalizeRentalTenantsQuery } from "../../../services/rental-query";

type Draft = {
  keyword: string;
  type: string;
  isActive: string;
  documentCountryCode: string;
  documentType: string;
  documentNumber: string;
};

export function TenantFilters({
  search,
  onApply,
}: {
  search: ListRentalTenantsQuery;
  onApply: (search: ListRentalTenantsQuery) => void;
}) {
  const normalized = normalizeRentalTenantsQuery(search);
  const normalizedKeyword = normalized.keyword;
  const normalizedType = normalized.type;
  const normalizedIsActive = normalized.isActive;
  const normalizedDocumentCountryCode = normalized.documentCountryCode;
  const normalizedDocumentType = normalized.documentType;
  const normalizedDocumentNumber = normalized.documentNumber;
  const normalizedPageSize = normalized.pageSize;
  const [draft, setDraft] = useState<Draft>(() => toDraft(normalized));
  useEffect(
    () =>
      setDraft(
        toDraft({
          keyword: normalizedKeyword,
          type: normalizedType,
          isActive: normalizedIsActive,
          documentCountryCode: normalizedDocumentCountryCode,
          documentType: normalizedDocumentType,
          documentNumber: normalizedDocumentNumber,
          page: 1,
          pageSize: normalizedPageSize,
        }),
      ),
    [
      normalizedKeyword,
      normalizedType,
      normalizedIsActive,
      normalizedDocumentCountryCode,
      normalizedDocumentType,
      normalizedDocumentNumber,
      normalizedPageSize,
    ],
  );
  const update = (key: keyof Draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
      <Text label="关键词" value={draft.keyword} onChange={(value) => update("keyword", value)} />
      <Select
        label="租客类型"
        value={draft.type}
        options={[
          ["all", "全部"],
          ["individual", "个人"],
          ["company", "企业"],
        ]}
        onChange={(value) => update("type", value)}
      />
      <Select
        label="状态"
        value={draft.isActive}
        options={[
          ["all", "全部"],
          ["active", "启用"],
          ["inactive", "停用"],
        ]}
        onChange={(value) => update("isActive", value)}
      />
      <Text
        label="证件国家/地区"
        value={draft.documentCountryCode}
        onChange={(value) => update("documentCountryCode", value)}
      />
      <Select
        label="证件类型"
        value={draft.documentType}
        options={[
          ["all", "全部"],
          ["national_id", "居民身份证"],
          ["passport", "护照"],
          ["residence_permit", "居住证"],
          ["business_registration", "营业执照"],
          ["other", "其他"],
        ]}
        onChange={(value) => update("documentType", value)}
      />
      <Text
        label="证件号码（精确匹配）"
        value={draft.documentNumber}
        onChange={(value) => update("documentNumber", value)}
      />
      <div className="flex items-end gap-2">
        <Button onClick={() => onApply(toSearch(draft, normalized.pageSize))}>应用筛选</Button>
        <Button
          variant="outline"
          onClick={() => onApply({ page: undefined, pageSize: normalized.pageSize })}
        >
          重置
        </Button>
      </div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `tenant-filter-${label}`;
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={`tenant-filter-${label}`}>{label}</Label>
      <select
        id={`tenant-filter-${label}`}
        aria-label={label}
        className="h-9 rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function toDraft(search: ReturnType<typeof normalizeRentalTenantsQuery>): Draft {
  return {
    keyword: search.keyword ?? "",
    type: search.type ?? "all",
    isActive: search.isActive === undefined ? "all" : search.isActive ? "active" : "inactive",
    documentCountryCode: search.documentCountryCode ?? "",
    documentType: search.documentType ?? "all",
    documentNumber: search.documentNumber ?? "",
  };
}

function toSearch(draft: Draft, pageSize: number): ListRentalTenantsQuery {
  const result: ListRentalTenantsQuery = { page: undefined, pageSize };
  if (draft.keyword.trim()) result.keyword = draft.keyword.trim();
  if (draft.type !== "all") result.type = draft.type as RentalTenantType;
  if (draft.isActive !== "all") result.isActive = draft.isActive === "active";
  if (draft.documentCountryCode) result.documentCountryCode = draft.documentCountryCode;
  if (draft.documentType !== "all")
    result.documentType = draft.documentType as RentalIdentityDocumentType;
  if (draft.documentNumber) result.documentNumber = draft.documentNumber;
  return result;
}
