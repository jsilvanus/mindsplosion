import type { Db } from "../db/pool.js";
import type { PrincipalContext } from "../domain/authorization.js";
import { MindsplosionRepository } from "../db/repository.js";

export interface RequestPrincipal extends PrincipalContext {
  /** External identifier from the MCP client (e.g., API key, user ID, etc.) */
  externalSubject: string;
}

/** Returns the principal of the current MCP request (stdio: fixed; HTTP: from the access token). */
export type PrincipalResolver = () => Promise<RequestPrincipal>;

/** External subject of the principal the stdio server acts as. */
export const STDIO_PRINCIPAL_SUBJECT = "default-principal";

/** MindsplosionContext bridges MCP requests to the domain layer. */
export class MindsplosionContext {
  private repository: MindsplosionRepository;
  private principalCache = new Map<string, string>();

  constructor(db: Db) {
    this.repository = new MindsplosionRepository(db);
  }

  async resolvePrincipal(externalSubject: string): Promise<RequestPrincipal> {
    let principalId = this.principalCache.get(externalSubject);
    if (!principalId) {
      const principal = (await this.repository.principals.findByExternalSubject(externalSubject))
        ?? (await this.repository.principals.create(externalSubject));
      principalId = principal.id;
      this.principalCache.set(externalSubject, principalId);
    }
    return { principalId, externalSubject };
  }

  get principals() { return this.repository.principals; }
  get projects() { return this.repository.projects; }
  get goals() { return this.repository.goals; }
  get actors() { return this.repository.actors; }
  get tasks() { return this.repository.tasks; }
  get plans() { return this.repository.plans; }
  get notes() { return this.repository.notes; }
  get schedules() { return this.repository.schedules; }
  get alarms() { return this.repository.alarms; }
  get labels() { return this.repository.labels; }
  get repositories() { return this.repository.repositories; }
  get graphOperations() { return this.repository.graphOperations; }
  get contextOperations() { return this.repository.contextOperations; }
  get views() { return this.repository.views; }
  get authorizations() { return this.repository.authorizations; }
}
