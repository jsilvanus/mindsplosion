export type Id = string;

export type PrincipalType = "user" | "service";
export type ActorType = "person" | "team" | "organization" | "agent" | "other";
export type GoalKind = "determinate" | "qualitative";
export type GoalStatus = "draft" | "active" | "paused" | "achieved" | "abandoned";
export type ProjectStatus =
  | "idea"
  | "started"
  | "development"
  | "blocked"
  | "staging"
  | "in_production"
  | "needs_checking"
  | "completed"
  | "archived";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type GoalActorRole = "owner" | "beneficiary" | "worker";

export type RelationshipType =
  | "parent_of"
  | "depends_on"
  | "blocks"
  | "enables"
  | "helps"
  | "hurts"
  | "conflicts_with"
  | "related_to"
  | "derived_from"
  | "replaces"
  | "distinct_from";

export type GraphNode =
  | { type: "goal"; id: Id }
  | { type: "project"; id: Id };

export type AccessLevel = "viewer" | "editor" | "owner";

export interface Principal {
  id: Id;
  type: PrincipalType;
  externalSubject: string;
  createdAt: string;
}

export interface Actor {
  id: Id;
  type: ActorType;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdByPrincipalId: Id;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: Id;
  statement: string;
  description?: string;
  kind: GoalKind;
  status: GoalStatus;
  createdByPrincipalId: Id;
  createdAt: string;
  updatedAt: string;
}

export interface GoalActor {
  goalId: Id;
  actorId: Id;
  role: GoalActorRole;
}

export interface Project {
  id: Id;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdByPrincipalId: Id;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  archivedAt?: string;
}

export interface ProjectGoal {
  projectId: Id;
  goalId: Id;
  createdAt: string;
}

export interface Relationship {
  id: Id;
  source: GraphNode;
  target: GraphNode;
  type: RelationshipType;
  description?: string;
  metadata?: Record<string, unknown>;
  createdByPrincipalId: Id;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: Id;
  projectId?: Id;
  goalId?: Id;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: number;
  dueAt?: string;
  createdByPrincipalId: Id;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TaskAssignee {
  taskId: Id;
  actorId: Id;
}

export interface Plan {
  id: Id;
  title: string;
  markdown: string;
  createdByPrincipalId: Id;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: Id;
  title?: string;
  content: string;
  createdByPrincipalId: Id;
  createdAt: string;
  updatedAt: string;
}

export type ContextTarget =
  | { type: "project"; id: Id }
  | { type: "goal"; id: Id }
  | { type: "task"; id: Id };

export interface Schedule {
  id: Id;
  target?: ContextTarget;
  title: string;
  startAt: string;
  endAt?: string;
  recurrence?: string;
  timezone?: string;
  createdByPrincipalId: Id;
  createdAt: string;
  updatedAt: string;
}

export interface Alarm {
  id: Id;
  target?: ContextTarget;
  title: string;
  triggerAt: string;
  recurrence?: string;
  timezone?: string;
  dismissedAt?: string;
  createdByPrincipalId: Id;
  createdAt: string;
  updatedAt: string;
}

export interface Label {
  id: Id;
  name: string;
  description?: string;
  createdByPrincipalId: Id;
  createdAt: string;
  updatedAt: string;
}

export interface Repository {
  id: Id;
  provider: string;
  externalId: string;
  owner: string;
  name: string;
  url: string;
  metadata?: Record<string, unknown>;
  createdByPrincipalId: Id;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRepository {
  projectId: Id;
  repositoryId: Id;
  path?: string;
  createdAt: string;
}

export interface AccessGrant {
  id: Id;
  principalId: Id;
  objectType:
    | "actor"
    | "project"
    | "goal"
    | "task"
    | "plan"
    | "note"
    | "schedule"
    | "alarm"
    | "label"
    | "repository";
  objectId: Id;
  access: AccessLevel;
  grantedByPrincipalId: Id;
  createdAt: string;
}
