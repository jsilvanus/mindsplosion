import type { Db } from "./pool.js";
import type { PrincipalContext } from "../domain/authorization.js";
import type { GraphNode, Id, Relationship } from "../domain/model.js";
import { goal, note, project, task } from "./mindsplosion-repository.js";
import { actor, alarm, label, plan, repository, schedule } from "./supporting-crud.js";
import { relationship } from "./graph-crud.js";

/**
 * Read-side queries across the graph: linked items, labels, relationships and text search.
 * Every query joins access_grant for the calling principal, so an item the principal cannot
 * view is never returned (not even as a relationship endpoint). Table and column names used
 * in SQL come only from the constants below, never from input.
 */

export type ItemType = "project" | "goal" | "task" | "note" | "plan" | "actor" | "schedule" | "alarm" | "label" | "repository";
export type LabelableType = "project" | "goal" | "task" | "plan" | "note";

export const ITEM_TYPES: ItemType[] = ["project", "goal", "task", "note", "plan", "actor", "schedule", "alarm", "label", "repository"];
export const LABELABLE_TYPES: LabelableType[] = ["project", "goal", "task", "plan", "note"];

const MAPPERS: Record<ItemType, (row: any) => any> = { project, goal, task, note, plan, actor, schedule, alarm, label, repository };

/** Title column and searchable text columns per type. */
const SEARCH: Record<ItemType, { title: string; columns: string[] }> = {
  project: { title: "name", columns: ["name", "description"] },
  goal: { title: "statement", columns: ["statement", "description"] },
  task: { title: "title", columns: ["title", "description"] },
  note: { title: "title", columns: ["title", "content"] },
  plan: { title: "title", columns: ["title", "markdown"] },
  actor: { title: "name", columns: ["name", "description"] },
  schedule: { title: "title", columns: ["title"] },
  alarm: { title: "title", columns: ["title"] },
  label: { title: "name", columns: ["name", "description"] },
  repository: { title: "name", columns: ["owner", "name", "url", "provider"] },
};

export const COLLECTION_BY_TYPE: Record<ItemType, string> = {
  project: "projects", goal: "goals", task: "tasks", note: "notes", plan: "plans", actor: "actors",
  schedule: "schedules", alarm: "alarms", label: "labels", repository: "repositories",
};

export interface SearchHit {
  type: ItemType;
  id: Id;
  title: string;
  status?: string;
  snippet?: string;
  updatedAt: string;
  uri: string;
}

export class ViewQueries {
  constructor(private readonly db: Db) {}

  /** Visible items of `type` whose id is in the subquery (`$2` is available to it). */
  private async visible<T>(p: PrincipalContext, type: ItemType, idSubquery: string, param: unknown): Promise<T[]> {
    const r = await this.db.query(
      `SELECT o.* FROM ${type} o JOIN access_grant a ON a.object_id = o.id AND a.object_type = '${type}' AND a.principal_id = $1
       WHERE o.id IN (${idSubquery}) ORDER BY o.created_at DESC`,
      [p.principalId, param],
    );
    return r.rows.map(MAPPERS[type]) as T[];
  }

  /** Visible items of `type` with a foreign key column equal to `id` (tasks of a project, alarms of a goal …). */
  byColumn<T>(p: PrincipalContext, type: ItemType, column: string, id: Id): Promise<T[]> {
    return this.visible<T>(p, type, `SELECT id FROM ${type} WHERE ${column} = $2`, id);
  }

  /** Visible items of `type` linked to `id` through join table `join` (`join.fromColumn = id`, `join.toColumn` = item id). */
  linked<T>(p: PrincipalContext, type: ItemType, join: string, fromColumn: string, toColumn: string, id: Id): Promise<T[]> {
    return this.visible<T>(p, type, `SELECT ${toColumn} FROM ${join} WHERE ${fromColumn} = $2`, id);
  }

  labelsOf(p: PrincipalContext, type: LabelableType, id: Id) {
    return this.linked(p, "label", `${type}_label`, `${type}_id`, "label_id", id);
  }

  withLabel<T>(p: PrincipalContext, type: LabelableType, labelId: Id): Promise<T[]> {
    return this.linked<T>(p, type, `${type}_label`, "label_id", `${type}_id`, labelId);
  }

  notesOf(p: PrincipalContext, type: "project" | "goal" | "task", id: Id) {
    return this.linked(p, "note", `note_${type}`, `${type}_id`, "note_id", id);
  }

  plansOf(p: PrincipalContext, type: "project" | "goal" | "task", id: Id) {
    return this.linked(p, "plan", `plan_${type}`, `${type}_id`, "plan_id", id);
  }

  /** Repositories of a project, with the optional path inside each (monorepo folder). */
  async repositoriesOf(p: PrincipalContext, projectId: Id) {
    const r = await this.db.query(
      `SELECT o.*, pr.path AS link_path FROM repository o
       JOIN project_repository pr ON pr.repository_id = o.id AND pr.project_id = $2
       JOIN access_grant a ON a.object_id = o.id AND a.object_type = 'repository' AND a.principal_id = $1
       ORDER BY o.name`,
      [p.principalId, projectId],
    );
    return r.rows.map((row: any) => ({ ...repository(row), ...(row.link_path ? { path: row.link_path } : {}) }));
  }

  /** Projects that use a repository. */
  projectsOfRepository(p: PrincipalContext, repositoryId: Id) {
    return this.linked(p, "project", "project_repository", "repository_id", "project_id", repositoryId);
  }

  /** Actors of a goal with their roles (owner, beneficiary, worker). */
  async goalActors(p: PrincipalContext, goalId: Id) {
    const r = await this.db.query(
      `SELECT o.*, ga.role AS goal_role FROM actor o
       JOIN goal_actor ga ON ga.actor_id = o.id AND ga.goal_id = $2
       JOIN access_grant a ON a.object_id = o.id AND a.object_type = 'actor' AND a.principal_id = $1
       ORDER BY o.name`,
      [p.principalId, goalId],
    );
    return r.rows.map((row: any) => ({ ...actor(row), role: row.goal_role }));
  }

  taskAssignees(p: PrincipalContext, taskId: Id) {
    return this.linked(p, "actor", "task_assignee", "task_id", "actor_id", taskId);
  }

  /** Relationships whose both endpoints the principal can view; optionally only those touching `node`. */
  async relationships(p: PrincipalContext, node?: GraphNode): Promise<Relationship[]> {
    const filter = node
      ? "WHERE (r.source_type::text = $2 AND r.source_id = $3) OR (r.target_type::text = $2 AND r.target_id = $3)"
      : "";
    const r = await this.db.query(
      `SELECT r.* FROM relationship r
       JOIN access_grant s ON s.principal_id = $1 AND s.object_type = r.source_type::text AND s.object_id = r.source_id
       JOIN access_grant t ON t.principal_id = $1 AND t.object_type = r.target_type::text AND t.object_id = r.target_id
       ${filter} ORDER BY r.created_at DESC`,
      node ? [p.principalId, node.type, node.id] : [p.principalId],
    );
    return r.rows.map(relationship);
  }

  /** Label ids and names of the principal's visible labels, by exact (case-insensitive) name. */
  async findLabelByName(p: PrincipalContext, name: string) {
    const r = await this.db.query(
      `SELECT o.* FROM label o JOIN access_grant a ON a.object_id = o.id AND a.object_type = 'label' AND a.principal_id = $1
       WHERE lower(o.name) = lower($2) ORDER BY o.created_at LIMIT 1`,
      [p.principalId, name],
    );
    return r.rows[0] ? label(r.rows[0]) : null;
  }

  /**
   * Case-insensitive substring search. Every word of the query must appear in one of the
   * item's text columns. Results are ordered by last update, newest first.
   */
  async search(p: PrincipalContext, query: string, types: ItemType[] = ITEM_TYPES, limit = 20): Promise<SearchHit[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    if (terms.length === 0) return [];
    const patterns = terms.map((term) => `%${term.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
    const hits: SearchHit[] = [];

    for (const type of types) {
      const { title, columns } = SEARCH[type];
      const conditions = patterns.map((_, i) =>
        "(" + columns.map((column) => `lower(COALESCE(o.${column}, '')) LIKE $${i + 2} ESCAPE '\\'`).join(" OR ") + ")",
      );
      const r = await this.db.query<any>(
        `SELECT o.* FROM ${type} o JOIN access_grant a ON a.object_id = o.id AND a.object_type = '${type}' AND a.principal_id = $1
         WHERE ${conditions.join(" AND ")} ORDER BY o.updated_at DESC LIMIT ${Math.max(1, Math.min(limit, 100))}`,
        [p.principalId, ...patterns],
      );
      for (const row of r.rows) {
        const snippetSource = columns.map((column) => row[column]).find((text): text is string =>
          typeof text === "string" && text.toLowerCase().includes(terms[0]!) && text !== row[title]);
        const heading = typeof row[title] === "string" && row[title] ? row[title] : snippet(String(row.content ?? ""), terms[0]!, 60) ?? "(untitled)";
        hits.push({
          type,
          id: row.id,
          title: heading,
          ...(typeof row.status === "string" ? { status: row.status } : {}),
          ...(snippetSource && snippet(snippetSource, terms[0]!) ? { snippet: snippet(snippetSource, terms[0]!)! } : {}),
          updatedAt: new Date(row.updated_at).toISOString(),
          uri: `mindsplosion://${COLLECTION_BY_TYPE[type]}/${row.id}`,
        });
      }
    }
    hits.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return hits.slice(0, limit);
  }
}

function snippet(text: string, term: string, radius = 80): string | undefined {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  const index = flat.toLowerCase().indexOf(term);
  const from = Math.max(0, index - radius);
  const to = Math.min(flat.length, (index < 0 ? 0 : index) + term.length + radius);
  return (from > 0 ? "…" : "") + flat.slice(from, to) + (to < flat.length ? "…" : "");
}
