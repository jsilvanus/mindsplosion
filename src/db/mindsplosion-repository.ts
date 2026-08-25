import type { QueryResultRow } from "pg";
import type {
  AccessLevel, Actor, Goal, Id, Note, Plan, Project, Task,
} from "../domain/model.js";
import type { PrincipalContext, ProtectedObjectType } from "../domain/authorization.js";
import { requireAccess } from "../domain/authorization.js";
import type { Db } from "./pool.js";

export class PostgresMindsplosionRepository {
  constructor(private readonly db: Db) {}

  async getAccess(
    principalId: Id,
    objectType: ProtectedObjectType,
    objectId: Id,
  ): Promise<AccessLevel | null> {
    const result = await this.db.query<{ access: AccessLevel }>(
      `SELECT access FROM access_grant
       WHERE principal_id = $1 AND object_type = $2 AND object_id = $3`,
      [principalId, objectType, objectId],
    );
    return result.rows[0]?.access ?? null;
  }

  async withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async grantOwner(db: Db, principalId: Id, objectType: string, objectId: Id): Promise<void> {
    await db.query(
      `INSERT INTO access_grant
         (principal_id, object_type, object_id, access, granted_by_principal_id)
       VALUES ($1, $2, $3, 'owner', $1)
       ON CONFLICT (principal_id, object_type, object_id)
       DO UPDATE SET access = 'owner'`,
      [principalId, objectType, objectId],
    );
  }

  async access(
    principalId: Id,
    objectType: string,
    objectId: Id,
  ): Promise<AccessLevel | null> {
    const result = await this.db.query<{ access: AccessLevel }>(
      `SELECT access FROM access_grant
       WHERE principal_id = $1 AND object_type = $2 AND object_id = $3`,
      [principalId, objectType, objectId],
    );
    return result.rows[0]?.access ?? null;
  }

  async listVisible<T extends QueryResultRow>(
    principalId: Id,
    objectType: string,
    table: string,
  ): Promise<T[]> {
    // table/objectType are internal constants only; never pass user input here.
    const result = await this.db.query<T>(
      `SELECT o.* FROM ${table} o
       JOIN access_grant a ON a.object_id = o.id
       WHERE a.principal_id = $1 AND a.object_type = $2
       ORDER BY o.created_at DESC`,
      [principalId, objectType],
    );
    return result.rows;
  }

  async createProject(principal: PrincipalContext, input: Pick<Project, "name" | "description" | "status">): Promise<Project> {
    return this.withTransaction(async (tx) => {
      const result = await tx.query<ProjectRow>(
        `INSERT INTO project (name, description, status, created_by_principal_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [input.name, input.description ?? null, input.status, principal.principalId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Project creation returned no row");
      await this.grantOwner(tx, principal.principalId, "project", row.id);
      return project(row);
    });
  }

  async getProject(principal: PrincipalContext, id: Id): Promise<Project | null> {
    await requireAccess(this, principal, "project", id, "viewer");
    const r = await this.db.query<ProjectRow>("SELECT * FROM project WHERE id = $1", [id]);
    return r.rows[0] ? project(r.rows[0]) : null;
  }

  async listProjects(principal: PrincipalContext): Promise<Project[]> {
    return (await this.listVisible<ProjectRow>(principal.principalId, "project", "project")).map(project);
  }

  async updateProject(principal: PrincipalContext, id: Id, patch: Partial<Pick<Project, "name" | "description" | "status">>): Promise<Project> {
    await requireAccess(this, principal, "project", id, "editor");
    const r = await this.db.query<ProjectRow>(
      `UPDATE project SET
         name = COALESCE($2, name), description = COALESCE($3, description),
         status = COALESCE($4, status), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, patch.name ?? null, patch.description ?? null, patch.status ?? null],
    );
    if (!r.rows[0]) throw new Error("Project disappeared during update");
    return project(r.rows[0]);
  }

  async deleteProject(principal: PrincipalContext, id: Id): Promise<void> {
    await requireAccess(this, principal, "project", id, "owner");
    const r = await this.db.query("DELETE FROM project WHERE id = $1", [id]);
    if (r.rowCount !== 1) throw new Error("Project disappeared during delete");
  }

  async createGoal(principal: PrincipalContext, input: Pick<Goal, "statement" | "description" | "kind" | "status">): Promise<Goal> {
    return this.withTransaction(async (tx) => {
      const r = await tx.query<GoalRow>(
        `INSERT INTO goal (statement, description, kind, status, created_by_principal_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [input.statement, input.description ?? null, input.kind, input.status, principal.principalId],
      );
      const row = r.rows[0];
      if (!row) throw new Error("Goal creation returned no row");
      await this.grantOwner(tx, principal.principalId, "goal", row.id);
      return goal(row);
    });
  }

  async getGoal(principal: PrincipalContext, id: Id): Promise<Goal | null> {
    await requireAccess(this, principal, "goal", id, "viewer");
    const r = await this.db.query<GoalRow>("SELECT * FROM goal WHERE id = $1", [id]);
    return r.rows[0] ? goal(r.rows[0]) : null;
  }

  async listGoals(principal: PrincipalContext): Promise<Goal[]> {
    return (await this.listVisible<GoalRow>(principal.principalId, "goal", "goal")).map(goal);
  }

  async updateGoal(principal: PrincipalContext, id: Id, patch: Partial<Pick<Goal, "statement" | "description" | "kind" | "status">>): Promise<Goal> {
    await requireAccess(this, principal, "goal", id, "editor");
    const r = await this.db.query<GoalRow>(
      `UPDATE goal SET statement = COALESCE($2, statement), description = COALESCE($3, description),
         kind = COALESCE($4, kind), status = COALESCE($5, status), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, patch.statement ?? null, patch.description ?? null, patch.kind ?? null, patch.status ?? null],
    );
    if (!r.rows[0]) throw new Error("Goal disappeared during update");
    return goal(r.rows[0]);
  }

  async deleteGoal(principal: PrincipalContext, id: Id): Promise<void> {
    await requireAccess(this, principal, "goal", id, "owner");
    const r = await this.db.query("DELETE FROM goal WHERE id = $1", [id]);
    if (r.rowCount !== 1) throw new Error("Goal disappeared during delete");
  }

  async createTask(principal: PrincipalContext, input: Pick<Task, "title" | "description" | "status" | "priority" | "dueAt" | "projectId" | "goalId">): Promise<Task> {
    await this.requireTargetAccess(principal, input.projectId, "project", "editor");
    await this.requireTargetAccess(principal, input.goalId, "goal", "editor");
    return this.withTransaction(async (tx) => {
      const r = await tx.query<TaskRow>(
        `INSERT INTO task (project_id, goal_id, title, description, status, priority, due_at, created_by_principal_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [input.projectId ?? null, input.goalId ?? null, input.title, input.description ?? null, input.status, input.priority ?? null, input.dueAt ?? null, principal.principalId],
      );
      const row = r.rows[0];
      if (!row) throw new Error("Task creation returned no row");
      await this.grantOwner(tx, principal.principalId, "task", row.id);
      return task(row);
    });
  }

  async getTask(principal: PrincipalContext, id: Id): Promise<Task | null> {
    await requireAccess(this, principal, "task", id, "viewer");
    const r = await this.db.query<TaskRow>("SELECT * FROM task WHERE id = $1", [id]);
    return r.rows[0] ? task(r.rows[0]) : null;
  }

  async listTasks(principal: PrincipalContext): Promise<Task[]> {
    return (await this.listVisible<TaskRow>(principal.principalId, "task", "task")).map(task);
  }

  async updateTask(principal: PrincipalContext, id: Id, patch: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "dueAt" | "projectId" | "goalId">>): Promise<Task> {
    await requireAccess(this, principal, "task", id, "editor");
    await this.requireTargetAccess(principal, patch.projectId, "project", "editor");
    await this.requireTargetAccess(principal, patch.goalId, "goal", "editor");
    const r = await this.db.query<TaskRow>(
      `UPDATE task SET title = COALESCE($2, title), description = COALESCE($3, description),
       status = COALESCE($4, status), priority = COALESCE($5, priority), due_at = COALESCE($6, due_at),
       project_id = COALESCE($7, project_id), goal_id = COALESCE($8, goal_id),
       completed_at = CASE WHEN $4 = 'done' THEN COALESCE(completed_at, now()) ELSE completed_at END,
       updated_at = now() WHERE id = $1 RETURNING *`,
      [id, patch.title ?? null, patch.description ?? null, patch.status ?? null, patch.priority ?? null, patch.dueAt ?? null, patch.projectId ?? null, patch.goalId ?? null],
    );
    if (!r.rows[0]) throw new Error("Task disappeared during update");
    return task(r.rows[0]);
  }

  async deleteTask(principal: PrincipalContext, id: Id): Promise<void> {
    await requireAccess(this, principal, "task", id, "owner");
    const r = await this.db.query("DELETE FROM task WHERE id = $1", [id]);
    if (r.rowCount !== 1) throw new Error("Task disappeared during delete");
  }

  async createNote(principal: PrincipalContext, input: Pick<Note, "title" | "content">): Promise<Note> {
    return this.withTransaction(async (tx) => {
      const r = await tx.query<NoteRow>("INSERT INTO note (title, content, created_by_principal_id) VALUES ($1, $2, $3) RETURNING *", [input.title ?? null, input.content, principal.principalId]);
      const row = r.rows[0];
      if (!row) throw new Error("Note creation returned no row");
      await this.grantOwner(tx, principal.principalId, "note", row.id);
      return note(row);
    });
  }

  async getNote(principal: PrincipalContext, id: Id): Promise<Note | null> {
    await requireAccess(this, principal, "note", id, "viewer");
    const r = await this.db.query<NoteRow>("SELECT * FROM note WHERE id = $1", [id]);
    return r.rows[0] ? note(r.rows[0]) : null;
  }

  async listNotes(principal: PrincipalContext): Promise<Note[]> {
    return (await this.listVisible<NoteRow>(principal.principalId, "note", "note")).map(note);
  }

  async updateNote(principal: PrincipalContext, id: Id, patch: Partial<Pick<Note, "title" | "content">>): Promise<Note> {
    await requireAccess(this, principal, "note", id, "editor");
    const r = await this.db.query<NoteRow>("UPDATE note SET title = COALESCE($2, title), content = COALESCE($3, content), updated_at = now() WHERE id = $1 RETURNING *", [id, patch.title ?? null, patch.content ?? null]);
    if (!r.rows[0]) throw new Error("Note disappeared during update");
    return note(r.rows[0]);
  }

  async deleteNote(principal: PrincipalContext, id: Id): Promise<void> {
    await requireAccess(this, principal, "note", id, "owner");
    const r = await this.db.query("DELETE FROM note WHERE id = $1", [id]);
    if (r.rowCount !== 1) throw new Error("Note disappeared during delete");
  }

  private async requireTargetAccess(principal: PrincipalContext, id: Id | undefined, type: "project" | "goal", level: AccessLevel): Promise<void> {
    if (id) await requireAccess(this, principal, type, id, level);
  }
}

type ProjectRow = { id: string; name: string; description: string | null; status: Project["status"]; created_by_principal_id: string; created_at: Date; updated_at: Date; started_at: Date | null; completed_at: Date | null; archived_at: Date | null };
type GoalRow = { id: string; statement: string; description: string | null; kind: Goal["kind"]; status: Goal["status"]; created_by_principal_id: string; created_at: Date; updated_at: Date };
type TaskRow = { id: string; project_id: string | null; goal_id: string | null; title: string; description: string | null; status: Task["status"]; priority: number | null; due_at: Date | null; created_by_principal_id: string; created_at: Date; updated_at: Date; completed_at: Date | null };
type NoteRow = { id: string; title: string | null; content: string; created_by_principal_id: string; created_at: Date; updated_at: Date };

const iso = (v: Date | null | undefined): string | undefined => v ? v.toISOString() : undefined;
const project = (r: ProjectRow): Project => ({ id: r.id, name: r.name, ...(r.description !== null ? { description: r.description } : {}), status: r.status, createdByPrincipalId: r.created_by_principal_id, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(), ...(iso(r.started_at) ? { startedAt: iso(r.started_at) } : {}), ...(iso(r.completed_at) ? { completedAt: iso(r.completed_at) } : {}), ...(iso(r.archived_at) ? { archivedAt: iso(r.archived_at) } : {}) });
const goal = (r: GoalRow): Goal => ({ id: r.id, statement: r.statement, ...(r.description !== null ? { description: r.description } : {}), kind: r.kind, status: r.status, createdByPrincipalId: r.created_by_principal_id, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() });
const task = (r: TaskRow): Task => ({ id: r.id, ...(r.project_id ? { projectId: r.project_id } : {}), ...(r.goal_id ? { goalId: r.goal_id } : {}), title: r.title, ...(r.description !== null ? { description: r.description } : {}), status: r.status, ...(r.priority !== null ? { priority: r.priority } : {}), ...(iso(r.due_at) ? { dueAt: iso(r.due_at) } : {}), createdByPrincipalId: r.created_by_principal_id, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(), ...(iso(r.completed_at) ? { completedAt: iso(r.completed_at) } : {}) });
const note = (r: NoteRow): Note => ({ id: r.id, ...(r.title !== null ? { title: r.title } : {}), content: r.content, createdByPrincipalId: r.created_by_principal_id, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() });
