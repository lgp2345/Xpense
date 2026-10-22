import { describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { OrganizationSettingsService } from "./organization-settings.service.js";

const context: AuthContext = {
  userId: "actor",
  sessionId: "session",
  organizationId: "org",
  isSuperAdmin: false,
  permissions: ["organization_settings:read", "organization_settings:update"],
};
function harness(role: string | null = "owner", superAdmin = false) {
  const repository = {
    profile: vi.fn().mockResolvedValue({ id: "org" }),
    updateProfile: vi.fn().mockResolvedValue({ id: "org", contactName: null }),
  };
  const owners = {
    findActiveUser: vi.fn().mockResolvedValue({ id: "actor", isSuperAdmin: superAdmin }),
    findActiveMemberRole: vi.fn().mockResolvedValue(role),
    lockOrganization: vi.fn().mockResolvedValue(true),
  };
  const access = { assertPermission: vi.fn() };
  const audit = { appendRequired: vi.fn() };
  const tx = {};
  const transactions = {
    run: async (operation: (tx: object) => Promise<unknown>) => operation(tx),
  };
  return {
    repository,
    owners,
    audit,
    tx,
    service: new OrganizationSettingsService(
      repository as never,
      owners as never,
      access as never,
      transactions as never,
      audit as never,
    ),
  };
}
describe("organization settings identity", () => {
  it.each([
    "admin",
    "custom",
    null,
  ])("rejects %s despite having all settings permissions", async (role) => {
    const h = harness(role);
    await expect(h.service.get(context)).rejects.toThrow();
    await expect(h.service.update(context, { contactName: null })).rejects.toThrow();
    expect(h.repository.updateProfile).not.toHaveBeenCalled();
  });
  it("uses the current organization and audits field names without contact data", async () => {
    const h = harness();
    await h.service.update(context, { contactName: null });
    expect(h.repository.updateProfile).toHaveBeenCalledWith("org", { contactName: null }, h.tx);
    expect(h.audit.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { fields: ["contactName"], accessSource: "membership" },
      }),
      h.tx,
    );
  });
  it("allows a live super admin without membership", async () => {
    const h = harness(null, true);
    await expect(h.service.get({ ...context, isSuperAdmin: true })).resolves.toEqual({ id: "org" });
  });
});
