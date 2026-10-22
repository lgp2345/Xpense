import type { OrganizationStatus, UserStatus } from "./auth.js";
import type { CurrencyCode } from "./currencies.js";

export type OrganizationSummary = {
  id: string;
  name: string;
  status: OrganizationStatus;
  baseCurrency: string;
  timezone: string;
};

export type OrganizationProfile = OrganizationSummary & {
  contactName: string | null;
  contactPhone: string | null;
  address: string | null;
};

export type OrganizationOwner = {
  userId: string;
  phone: string | null;
  email: string | null;
};

export type OrganizationOwnerCandidate = OrganizationOwner & { status: UserStatus };

export type OrganizationDetail = OrganizationProfile & { owners: OrganizationOwner[] };

export type OwnerInput =
  | { kind: "new"; phone: string; email?: string | null; initialPassword?: string }
  | { kind: "existing"; phone: string; userId: string; confirmed: true };

export type UpdateOrganizationProfileInput = {
  contactName?: string | null;
  contactPhone?: string | null;
  address?: string | null;
};

export type CreateOrganizationInput = UpdateOrganizationProfileInput & {
  name: string;
  baseCurrency: CurrencyCode;
  timezone: string;
  owners: OwnerInput[];
};

export type OrganizationListQuery = {
  page: number;
  pageSize: number;
  name?: string;
  status?: OrganizationStatus;
};

export type OrganizationListResponse = {
  items: OrganizationDetail[];
  total: number;
  page: number;
  pageSize: number;
};
