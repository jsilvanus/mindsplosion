import type { Db } from "./pool.js";
import { PostgresMindsplosionRepository } from "./mindsplosion-repository.js";
import { SupportingCrud } from "./supporting-crud.js";
import { GraphCrud } from "./graph-crud.js";
import { ContextCrud } from "./context-crud.js";
import { PrincipalsRepository } from "./principals-repository.js";

/**
 * Unified repository aggregating all domain object CRUD operations.
 * This is the primary interface to the database layer for MCP and other consumers.
 */
export class MindsplosionRepository {
  readonly db: Db;
  readonly principals: PrincipalsRepository;
  private readonly core: PostgresMindsplosionRepository;
  readonly supporting: SupportingCrud;
  readonly graphOperations: GraphCrud;
  readonly contextOperations: ContextCrud;

  constructor(db: Db) {
    this.db = db;
    this.principals = new PrincipalsRepository(this.db);
    this.core = new PostgresMindsplosionRepository(this.db);
    this.supporting = new SupportingCrud(this.db);
    this.graphOperations = new GraphCrud(this.db);
    this.contextOperations = new ContextCrud(this.db);
  }

  get projects() { return this.core; }
  get goals() { return this.core; }
  get tasks() { return this.core; }
  get notes() { return this.core; }
  get actors() { return this.supporting; }
  get plans() { return this.supporting; }
  get schedules() { return this.supporting; }
  get alarms() { return this.supporting; }
  get labels() { return this.supporting; }
  get repositories() { return this.supporting; }
  get authorizations() { return this.supporting; }
}
