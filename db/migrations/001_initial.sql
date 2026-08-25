-- Mindsplosion initial PostgreSQL persistence schema
-- Phase 2: persistence + privacy foundation.
--
-- The schema deliberately separates:
--   * semantic actors and goal roles;
--   * project/goal graph semantics;
--   * authenticated principals and authorization.
--
-- The CRUD/domain layer must enforce authorization before reading or mutating data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE principal_type AS ENUM ('user', 'service');
CREATE TYPE actor_type AS ENUM ('person', 'team', 'organization', 'agent', 'other');
CREATE TYPE goal_kind AS ENUM ('determinate', 'qualitative');
CREATE TYPE goal_status AS ENUM ('draft', 'active', 'paused', 'achieved', 'abandoned');
CREATE TYPE project_status AS ENUM ('idea', 'started', 'development', 'blocked', 'staging', 'in_production', 'needs_checking', 'completed', 'archived');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
CREATE TYPE goal_actor_role AS ENUM ('owner', 'beneficiary', 'worker');
CREATE TYPE relationship_type AS ENUM ('parent_of', 'depends_on', 'blocks', 'enables', 'helps', 'hurts', 'conflicts_with', 'related_to', 'derived_from', 'replaces', 'distinct_from');
CREATE TYPE graph_node_type AS ENUM ('goal', 'project');
CREATE TYPE access_level AS ENUM ('viewer', 'editor', 'owner');

CREATE TABLE principal (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type principal_type NOT NULL,
    external_subject text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE actor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type actor_type NOT NULL,
    name text NOT NULL,
    description text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE actor_principal (
    actor_id uuid NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
    principal_id uuid NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
    PRIMARY KEY (actor_id, principal_id)
);

CREATE TABLE project (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    status project_status NOT NULL DEFAULT 'idea',
    created_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    archived_at timestamptz
);

CREATE TABLE goal (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    statement text NOT NULL,
    description text,
    kind goal_kind NOT NULL DEFAULT 'determinate',
    status goal_status NOT NULL DEFAULT 'draft',
    created_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE goal_actor (
    goal_id uuid NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
    role goal_actor_role NOT NULL,
    PRIMARY KEY (goal_id, actor_id, role)
);

CREATE TABLE project_goal (
    project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    goal_id uuid NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, goal_id)
);

CREATE TABLE relationship (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type graph_node_type NOT NULL,
    source_id uuid NOT NULL,
    target_type graph_node_type NOT NULL,
    target_id uuid NOT NULL,
    type relationship_type NOT NULL,
    description text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (NOT (source_type = target_type AND source_id = target_id))
);

CREATE INDEX relationship_source_idx ON relationship (source_type, source_id);
CREATE INDEX relationship_target_idx ON relationship (target_type, target_id);
CREATE UNIQUE INDEX relationship_unique_direction_idx
    ON relationship (source_type, source_id, target_type, target_id, type);

CREATE TABLE task (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES project(id) ON DELETE SET NULL,
    goal_id uuid REFERENCES goal(id) ON DELETE SET NULL,
    title text NOT NULL,
    description text,
    status task_status NOT NULL DEFAULT 'todo',
    priority integer,
    due_at timestamptz,
    created_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE TABLE task_assignee (
    task_id uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, actor_id)
);

CREATE TABLE plan (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    markdown text NOT NULL DEFAULT '',
    created_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_project (
    plan_id uuid NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, project_id)
);

CREATE TABLE plan_goal (
    plan_id uuid NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
    goal_id uuid NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, goal_id)
);

CREATE TABLE plan_task (
    plan_id uuid NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, task_id)
);

CREATE TABLE note (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text,
    content text NOT NULL DEFAULT '',
    created_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE note_project (
    note_id uuid NOT NULL REFERENCES note(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, project_id)
);

CREATE TABLE note_goal (
    note_id uuid NOT NULL REFERENCES note(id) ON DELETE CASCADE,
    goal_id uuid NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, goal_id)
);

CREATE TABLE note_task (
    note_id uuid NOT NULL REFERENCES note(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, task_id)
);

CREATE TABLE schedule (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES project(id) ON DELETE CASCADE,
    goal_id uuid REFERENCES goal(id) ON DELETE CASCADE,
    task_id uuid REFERENCES task(id) ON DELETE CASCADE,
    title text NOT NULL,
    start_at timestamptz NOT NULL,
    end_at timestamptz,
    recurrence text,
    timezone text,
    created_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (((project_id IS NOT NULL)::int + (goal_id IS NOT NULL)::int + (task_id IS NOT NULL)::int) <= 1),
    CHECK (end_at IS NULL OR end_at >= start_at)
);

CREATE TABLE alarm (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES project(id) ON DELETE CASCADE,
    goal_id uuid REFERENCES goal(id) ON DELETE CASCADE,
    task_id uuid REFERENCES task(id) ON DELETE CASCADE,
    title text NOT NULL,
    trigger_at timestamptz NOT NULL,
    recurrence text,
    timezone text,
    dismissed_at timestamptz,
    created_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (((project_id IS NOT NULL)::int + (goal_id IS NOT NULL)::int + (task_id IS NOT NULL)::int) <= 1)
);

CREATE TABLE label (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    created_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (created_by_principal_id, name)
);

CREATE TABLE project_label (
    project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    label_id uuid NOT NULL REFERENCES label(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, label_id)
);

CREATE TABLE goal_label (
    goal_id uuid NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
    label_id uuid NOT NULL REFERENCES label(id) ON DELETE CASCADE,
    PRIMARY KEY (goal_id, label_id)
);

CREATE TABLE task_label (
    task_id uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    label_id uuid NOT NULL REFERENCES label(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

CREATE TABLE plan_label (
    plan_id uuid NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
    label_id uuid NOT NULL REFERENCES label(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, label_id)
);

CREATE TABLE note_label (
    note_id uuid NOT NULL REFERENCES note(id) ON DELETE CASCADE,
    label_id uuid NOT NULL REFERENCES label(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, label_id)
);

CREATE TABLE repository (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    external_id text NOT NULL,
    owner text NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, external_id)
);

CREATE TABLE project_repository (
    project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    repository_id uuid NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
    path text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, repository_id, path)
);

-- Authorization is deliberately separate from semantic ownership and Actor roles.
-- object_id is polymorphic; the domain layer must validate that it exists in the
-- table named by object_type before granting or using access.
CREATE TABLE access_grant (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    principal_id uuid NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
    object_type text NOT NULL CHECK (object_type IN ('actor','project','goal','task','plan','note','schedule','alarm','label','repository')),
    object_id uuid NOT NULL,
    access access_level NOT NULL,
    granted_by_principal_id uuid NOT NULL REFERENCES principal(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (principal_id, object_type, object_id)
);

CREATE INDEX access_grant_object_idx ON access_grant (object_type, object_id);
CREATE INDEX access_grant_principal_idx ON access_grant (principal_id);

-- The first CRUD implementation must create an owner access_grant for the
-- creating principal in the same transaction as every new protected object.
-- No public-by-ID access is implied by the schema.
