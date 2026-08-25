import type { AccessLevel, Id } from "./model.js";
import type { PrincipalContext, ProtectedObjectType } from "./authorization.js";

export interface DomainObject {
  id: Id;
  createdByPrincipalId: Id;
}

export interface AuthorizedRepository<T extends DomainObject> {
  get(
    principal: PrincipalContext,
    id: Id,
  ): Promise<T | null>;

  list(
    principal: PrincipalContext,
  ): Promise<T[]>;

  create(
    principal: PrincipalContext,
    input: Omit<T, "id" | "createdAt" | "updatedAt" | "createdByPrincipalId">,
  ): Promise<T>;

  update(
    principal: PrincipalContext,
    id: Id,
    patch: Partial<Omit<T, "id" | "createdAt" | "updatedAt" | "createdByPrincipalId">>,
  ): Promise<T>;

  delete(
    principal: PrincipalContext,
    id: Id,
  ): Promise<void>;
}

export interface AuthorizationStore {
  getAccess(
    principalId: Id,
    objectType: ProtectedObjectType,
    objectId: Id,
  ): Promise<AccessLevel | null>;

  grantOwner(
    principalId: Id,
    objectType: ProtectedObjectType,
    objectId: Id,
  ): Promise<void>;
}

export interface ObjectStore<T extends DomainObject> {
  get(id: Id): Promise<T | null>;
  listVisible(principalId: Id): Promise<T[]>;
  insert(input: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T>;
  update(
    id: Id,
    patch: Partial<Omit<T, "id" | "createdAt" | "updatedAt" | "createdByPrincipalId">>,
  ): Promise<T | null>;
  delete(id: Id): Promise<boolean>;
}
