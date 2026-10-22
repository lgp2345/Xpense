export type ActiveOrganizationCandidate = { organizationId: string; joinedAt: Date };

/** 从已经过滤为有效资格的候选中恢复偏好，否则稳定选择最近加入组织。 */
export function selectDefaultOrganization(
  lastOrganizationId: string | null,
  memberships: ActiveOrganizationCandidate[],
): string | null {
  if (lastOrganizationId && memberships.some((item) => item.organizationId === lastOrganizationId))
    return lastOrganizationId;
  return (
    memberships.toSorted(
      (a, b) =>
        b.joinedAt.getTime() - a.joinedAt.getTime() ||
        (a.organizationId < b.organizationId ? -1 : a.organizationId > b.organizationId ? 1 : 0),
    )[0]?.organizationId ?? null
  );
}
