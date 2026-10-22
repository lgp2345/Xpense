import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { OrganizationOwnerPolicyService } from "./organization-owner-policy.service.js";

const ctx: AuthContext = {
  userId: "actor",
  sessionId: "session",
  organizationId: "org",
  isSuperAdmin: false,
  permissions: ["members:update"],
};
const target = { userId: "target", roleId: "owner", status: "active" as const };
function harness(actorRole: string | null = "admin", isSuperAdmin = false, owners = 2) {
  const repository = {
    findActiveUser: vi.fn(
      async (id: string): Promise<{ id: string; isSuperAdmin: boolean } | null> => ({
        id,
        isSuperAdmin: id === "actor" && isSuperAdmin,
      }),
    ),
    findActiveMemberRole: vi.fn().mockResolvedValue(actorRole),
    findRoleKey: vi.fn(async (_org: string, id: string) =>
      ["owner", "admin", "custom"].includes(id) ? id : null,
    ),
    countActiveOwners: vi.fn().mockResolvedValue(owners),
  };
  return { repository, service: new OrganizationOwnerPolicyService(repository as never) };
}
describe("owner identity policy", () => {
  it.each([
    "admin",
    "custom",
  ])("rejects %s even if caller claims every permission", async (role) => {
    const { service } = harness(role);
    await expect(
      service.assertMemberMutation(ctx, target, { status: "disabled" }, {} as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertMemberMutation(
        ctx,
        { ...target, roleId: "admin" },
        { roleId: "owner" },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertMemberMutation(
        ctx,
        null,
        { userId: "target", roleId: "owner", status: "active" },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([
    false,
    true,
  ])("protects the last effective owner even for platform admin (%s)", async (superAdmin) => {
    const { service } = harness("owner", superAdmin, 1);
    await expect(
      service.assertMemberMutation(ctx, target, { roleId: "admin" }, {} as never),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.assertMemberMutation(ctx, target, { status: "disabled" }, {} as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it.each([
    false,
    true,
  ])("allows an owner or live super admin to remove one of two effective owners (%s)", async (superAdmin) => {
    const { service } = harness(superAdmin ? null : "owner", superAdmin, 2);
    await expect(
      service.assertMemberMutation(ctx, target, { status: "disabled" }, {} as never),
    ).resolves.toBeUndefined();
  });
  it("does not count a disabled user as an effective owner", async () => {
    const { service, repository } = harness("owner", false, 1);
    repository.findActiveUser.mockImplementation(async (id) =>
      id === "target" ? null : { id, isSuperAdmin: false },
    );
    await expect(
      service.assertMemberMutation(ctx, target, { status: "disabled" }, {} as never),
    ).resolves.toBeUndefined();
    await expect(
      service.assertMemberMutation(ctx, target, { status: "active" }, {} as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("rechecks actor identity rather than trusting an earlier owner/super-admin claim", async () => {
    const { service } = harness("custom", false);
    await expect(
      service.assertMemberMutation(
        { ...ctx, isSuperAdmin: true },
        target,
        { status: "disabled" },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("preserves non-owner member role changes for an active admin", async () => {
    const { service } = harness();
    await expect(
      service.assertMemberMutation(
        ctx,
        { ...target, roleId: "custom" },
        { roleId: "admin" },
        {} as never,
      ),
    ).resolves.toBeUndefined();
  });
});
