import { describe, expect, it } from "vitest";
import { NotFoundOrForbiddenError, canAccess, requireAccess } from "../src/domain/authorization.js";

const grants = {
  async getAccess(principalId: string, _type: any, id: string) {
    if (principalId === "alice" && id === "public-to-alice") return "viewer" as const;
    if (principalId === "alice" && id === "editable") return "editor" as const;
    if (principalId === "alice" && id === "owned") return "owner" as const;
    return null;
  },
};

describe("authorization", () => {
  it("allows an access level at or above the required level", async () => {
    await expect(requireAccess(grants, { principalId: "alice" }, "project", "editable", "viewer")).resolves.toBeUndefined();
    await expect(requireAccess(grants, { principalId: "alice" }, "project", "editable", "editor")).resolves.toBeUndefined();
  });

  it("rejects insufficient access without revealing object existence", async () => {
    await expect(requireAccess(grants, { principalId: "alice" }, "project", "public-to-alice", "editor"))
      .rejects.toBeInstanceOf(NotFoundOrForbiddenError);
    await expect(requireAccess(grants, { principalId: "alice" }, "project", "does-not-exist", "viewer"))
      .rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });

  it("can check access without throwing", async () => {
    await expect(canAccess(grants, { principalId: "alice" }, "project", "owned", "owner")).resolves.toBe(true);
    await expect(canAccess(grants, { principalId: "alice" }, "project", "public-to-alice", "editor")).resolves.toBe(false);
    await expect(canAccess(grants, { principalId: "bob" }, "project", "owned", "viewer")).resolves.toBe(false);
  });
});
