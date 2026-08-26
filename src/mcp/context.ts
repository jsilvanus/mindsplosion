import type { Pool } from "pg";
import type { PrincipalContext } from "../domain/authorization.js";
import { MindsplosionRepository } from "../db/repository.js";

export interface RequestPrincipal extends PrincipalContext {
  /** External identifier from the MCP client (e.g., API key, user ID, etc.) */
  externalSubject: string;
}

/**
 * MindsplosionContext bridges MCP requests to the domain layer,
 * managing principal identity and providing access to repositories.
 *
 * This class is responsible for:
 * 1. Resolving MCP client identity to Principal records
 * 2. Providing authorization-aware access to domain repositories
 * 3. Ensuring all MCP operations use the canonical domain layer
 */
export class MindsplosionContext {
  private repository: MindsplosionRepository;
  private principalCache = new Map<string, string>();

  constructor(pool: Pool) {
    this.repository = new MindsplosionRepository(pool);
  }

  /**
   * Resolve an external subject (e.g., API key) to a principal ID.
   * Caches the result to avoid repeated lookups.
   */
  async resolvePrincipal(externalSubject: string): Promise<RequestPrincipal> {
    let principalId = this.principalCache.get(externalSubject);

    if (!principalId) {
      const principal =
        await this.repository.principals.findByExternalSubject(
          externalSubject,
        );
      if (!principal) {
        throw new Error(
          `Unknown principal: ${externalSubject}. Register the principal first.`,
        );
      }
      principalId = principal.id;
      this.principalCache.set(externalSubject, principalId);
    }

    return {
      principalId,
      externalSubject,
    };
  }

  get projects() {
    return this.repository.projects;
  }

  get goals() {
    return this.repository.goals;
  }

  get actors() {
    return this.repository.actors;
  }

  get tasks() {
    return this.repository.tasks;
  }

  get plans() {
    return this.repository.plans;
  }

  get notes() {
    return this.repository.notes;
  }

  get schedules() {
    return this.repository.schedules;
  }

  get alarms() {
    return this.repository.alarms;
  }

  get labels() {
    return this.repository.labels;
  }

  get repositories() {
    return this.repository.repositories;
  }

  get graphOperations() {
    return this.repository.graphOperations;
  }

  get authorizations() {
    return this.repository.authorizations;
  }
}
