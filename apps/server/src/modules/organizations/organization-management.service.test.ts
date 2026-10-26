import { describe, expect, it, vi } from "vitest";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { createOrganizationSchema } from "./dto/create-organization.dto.js";
import { OrganizationManagementService } from "./organization-management.service.js";

const ctx: SessionAuthContext = {
  accessScope: "platform",
  userId: "actor",
  sessionId: "session",
  organizationId: null,
  isSuperAdmin: true,
  permissions: [],
};
const existingId = "11111111-1111-4111-8111-111111111111";
const input = createOrganizationSchema.parse({
  name: "组织",
  baseCurrency: "USD",
  owners: [
    { kind: "new", phone: "13800000001" },
    { kind: "existing", phone: "13800000002", userId: existingId, confirmed: true },
  ],
});
function harness() {
  const repository = {
    findActor: vi.fn().mockResolvedValue({ id: "actor", isSuperAdmin: true }),
    findOwnerCandidate: vi.fn(async (phone: string) =>
      phone === "13800000002" ? { userId: existingId, phone, email: null, status: "active" } : null,
    ),
    findBuiltinOwnerRole: vi.fn().mockResolvedValue("owner-role"),
    insertUser: vi.fn().mockResolvedValue("new-user"),
    insertOrganization: vi.fn().mockResolvedValue({
      id: "org",
      name: "组织",
      baseCurrency: "USD",
      status: "active",
      timezone: "Asia/Shanghai",
      contactName: null,
      contactPhone: null,
      address: null,
    }),
    addOwners: vi.fn(),
    detail: vi
      .fn()
      .mockResolvedValue({ id: "org", owners: [{ userId: "new-user" }, { userId: existingId }] }),
  };
  const tx = {};
  const transactions = {
    run: async (operation: (tx: object) => Promise<unknown>) => operation(tx),
  };
  const password = { hash: vi.fn(async (value: string) => `hash:${value}`) };
  const initializer = { initialize: vi.fn() };
  const audit = { appendRequired: vi.fn() };
  return {
    repository,
    transactions,
    password,
    initializer,
    audit,
    tx,
    service: new OrganizationManagementService(
      repository as never,
      transactions as never,
      password as never,
      initializer as never,
      audit as never,
    ),
  };
}
describe("organization creation", () => {
  it("mixes new and explicitly associated owners without updating existing credentials", async () => {
    const h = harness();
    await expect(h.service.create(ctx, input)).resolves.toMatchObject({ id: "org" });
    expect(h.repository.insertUser).toHaveBeenCalledTimes(1);
    expect(h.password.hash).toHaveBeenCalledWith("888888");
    expect(h.repository.addOwners).toHaveBeenCalledWith(
      "org",
      ["new-user", existingId],
      "owner-role",
      h.tx,
    );
    expect(h.initializer.initialize).toHaveBeenCalledWith(h.tx, "org");
    expect(h.audit.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "actor", action: "organization.created" }),
      h.tx,
    );
  });
  it("rejects a stale new-phone precheck instead of silently associating the new account", async () => {
    const h = harness();
    h.repository.findOwnerCandidate.mockResolvedValue({
      userId: existingId,
      phone: "13800000001",
      email: null,
      status: "active",
    });
    await expect(h.service.create(ctx, input)).rejects.toThrow("已注册");
    expect(h.repository.insertUser).not.toHaveBeenCalled();
  });
  it("rejects a disabled associated owner", async () => {
    const h = harness();
    h.repository.findOwnerCandidate.mockImplementation(async (phone: string) =>
      phone === "13800000002"
        ? { userId: existingId, phone, email: null, status: "disabled" }
        : null,
    );
    await expect(h.service.create(ctx, input)).rejects.toThrow("停用");
  });
  it("requires current super-admin qualification even when the context claims it", async () => {
    const h = harness();
    h.repository.findActor.mockResolvedValue({ id: "actor", isSuperAdmin: false });
    await expect(h.service.create(ctx, input)).rejects.toThrow();
    expect(h.repository.insertOrganization).not.toHaveBeenCalled();
  });
});
