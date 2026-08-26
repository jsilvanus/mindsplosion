import {
  requireAccess,
  type AccessGrantReader,
  type PrincipalContext,
  type ProtectedObjectType,
} from "./authorization.js";
import type { DomainObject, ObjectStore } from "./repository.js";
import type { Id } from "./model.js";

export interface Clock {
  now(): string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

export class AuthorizedCrudService<T extends DomainObject> {
  constructor(
    private readonly objectType: ProtectedObjectType,
    private readonly store: ObjectStore<T>,
    private readonly grants: AccessGrantReader,
    private readonly clock: Clock = systemClock,
  ) {}

  async get(principal: PrincipalContext, id: Id): Promise<T | null> {
    await requireAccess(this.grants, principal, this.objectType, id, "viewer");
    return this.store.get(id);
  }

  async list(principal: PrincipalContext): Promise<T[]> {
    // The store MUST apply the same authorization semantics to the query.
    // This prevents list endpoints from becoming an accidental enumeration
    // bypass. Do not implement this by fetching every object and filtering in
    // application memory for production-scale data.
    return this.store.listVisible(principal.principalId);
  }

  async create(
    principal: PrincipalContext,
    input: Omit<T, "id" | "createdAt" | "updatedAt" | "createdByPrincipalId">,
    create: (record: Omit<T, "id" | "createdAt" | "updatedAt">) => Promise<T>,
    grantOwner: (principalId: Id, objectId: Id) => Promise<void>,
  ): Promise<T> {
    const now = this.clock.now();
    const record = await create({
      ...input,
      createdByPrincipalId: principal.principalId,
      createdAt: now,
      updatedAt: now,
    } as Omit<T, "id" | "createdAt" | "updatedAt">);

    // Production persistence must perform creation + owner grant in one
    // database transaction. If that transaction cannot be guaranteed by the
    // adapter, the adapter must reject the operation rather than create an
    // object without an authorization boundary.
    await grantOwner(principal.principalId, record.id);
    return record;
  }

  async update(
    principal: PrincipalContext,
    id: Id,
    patch: Partial<Omit<T, "id" | "createdAt" | "updatedAt" | "createdByPrincipalId">>,
  ): Promise<T> {
    await requireAccess(this.grants, principal, this.objectType, id, "editor");

    const updated = await this.store.update(id, {
      ...patch,
      updatedAt: this.clock.now(),
    });

    if (!updated) {
      throw new Error("Resource disappeared during update.");
    }

    return updated;
  }

  async delete(principal: PrincipalContext, id: Id): Promise<void> {
    await requireAccess(this.grants, principal, this.objectType, id, "owner");
    const deleted = await this.store.delete(id);

    if (!deleted) {
      throw new Error("Resource disappeared during delete.");
    }
  }
}
