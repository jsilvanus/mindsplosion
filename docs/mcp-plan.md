# Mindsplosion — MCP v2 Plan

Mindsplosion should expose its project/goal graph through MCP v2 as a **resource-rich context system**. MCP is an interface to the Mindsplosion domain, not a second domain model.

The central distinction is:

- **Resources** expose Mindsplosion data and context.
- **Tools** perform meaningful mutations or operations.
- **MCP Tasks** (the protocol concept) are not Mindsplosion `Task` objects; they may be used later for genuinely long-running MCP operations.

## Design principles

### 1. Resources are the primary MCP surface

Mindsplosion is fundamentally a structured dataset describing goals, projects, actors, activities, plans, notes, schedules, alarms, relationships, and external context.

Agents should therefore be able to read this information as MCP resources without invoking a tool for every read operation.

### 2. Tools represent actions, not database verbs

Do not expose the entire persistence layer as a collection of trivial `get_*` and `list_*` tools.

Use resources for ordinary reads and tools for meaningful state changes or domain operations.

For example:

- Resource: `mindsplosion://projects/{id}`
- Tool: `create_project`
- Tool: `add_goal_to_project`
- Tool: `add_relationship`

### 3. MCP does not define a second authorization model

MCP must use the same authentication and authorization boundary as the canonical API/domain layer.

MCP resource reads, resource discovery, graph traversal, subscriptions, tool calls, and tool results must all respect the caller's access rights.

An MCP client must never be able to discover a private object merely because it is related to an accessible object.

### 4. Human-confirmed semantics remain authoritative

AI-assisted suggestions are not silently promoted into confirmed domain relationships.

Later AI features should distinguish:

- confirmed project/goal membership;
- confirmed relationships;
- proposed memberships;
- proposed relationships;
- proposed project clusters.

## Resource model

### Core resources

Expose the following as resources:

- Project
- Goal
- Actor
- Task
- Plan
- Note
- Schedule
- Alarm
- Label
- Repository
- Relationship/context

ProjectGoal and ProjectRepository are contextual associations rather than necessarily independent user-facing resources.

### Resource URI conventions

Use stable, opaque identifiers rather than human-readable names as primary resource identity.

Initial URI shapes:

```text
mindsplosion://projects/{projectId}
mindsplosion://goals/{goalId}
mindsplosion://actors/{actorId}
mindsplosion://tasks/{taskId}
mindsplosion://plans/{planId}
mindsplosion://notes/{noteId}
mindsplosion://schedules/{scheduleId}
mindsplosion://alarms/{alarmId}
mindsplosion://labels/{labelId}
mindsplosion://repositories/{repositoryId}
```

### Context resources

Mindsplosion should provide contextual resources that allow an agent to retrieve a useful semantic slice without manually traversing dozens of individual objects.

Candidate resources:

```text
mindsplosion://projects/{projectId}/context
mindsplosion://projects/{projectId}/goals
mindsplosion://projects/{projectId}/tasks
mindsplosion://projects/{projectId}/graph

mindsplosion://goals/{goalId}/context
mindsplosion://goals/{goalId}/graph

mindsplosion://tasks/{taskId}/context
```

These are views over the same domain data, not separate stored objects.

Context responses must omit inaccessible objects and relationships.

## Resource discovery

Expose useful top-level discovery resources/templates so an agent can understand the available dataset without requiring a large tool catalog.

Candidate discovery:

```text
mindsplosion://projects
mindsplosion://goals
mindsplosion://tasks
mindsplosion://notes
mindsplosion://plans
```

Discovery must respect authorization. A list of resources is itself potentially sensitive information.

Where datasets are large, use bounded/paginated representations rather than returning the complete graph by default.

## Relationships and graph resources

Relationships are graph edges, not generic CRUD tools.

Expose graph context through resources such as:

```text
mindsplosion://projects/{id}/graph
mindsplosion://goals/{id}/graph
```

The graph layer must preserve the distinction between:

- semantic relationships such as `depends_on`, `helps`, `conflicts_with`, and `distinct_from`;
- ProjectGoal membership, which represents project boundary membership;
- Actor role associations such as owner, beneficiary, and worker.

Graph traversal must be authorization-aware at every edge. An accessible source must not reveal an inaccessible target.

## Tools

### CRUD/domain mutations

Initial tool candidates:

```text
create_project
update_project
archive_project

create_goal
update_goal
archive_goal

create_task
update_task
complete_task

create_note
update_note
delete_note

create_plan
update_plan

create_actor
update_actor
```

Equivalent mutations should exist for schedules, alarms, labels, and repositories where needed.

These tools must call the same domain services used by the API. They must not implement their own persistence or authorization logic.

### Semantic operations

Prefer meaningful domain operations over low-level edge manipulation where appropriate:

```text
add_goal_to_project
remove_goal_from_project
add_relationship
remove_relationship
assign_task
unassign_task
label_object
unlabel_object
link_repository
unlink_repository
schedule_activity
create_alarm
```

The exact tool surface should be kept small and revised after real agent usage.

### Search / discovery operation

A search tool may be useful because search is an operation rather than a static resource:

```text
search_mindsplosion
```

Its preferred result is references/links to relevant MCP resources rather than a large duplicated representation of the objects.

Example conceptual result:

```text
Project: Mindsplosion
  -> mindsplosion://projects/123

Goal: Build privacy-first CRUD
  -> mindsplosion://goals/456

Note: "Use resources for MCP context"
  -> mindsplosion://notes/789
```

Search results must be authorization-filtered.

## Plans and Notes

Plans and Notes are especially suitable as resources because they are human-readable source material.

A Plan or Note may be:

- unattached;
- contextualized by a Project;
- contextualized by a Goal;
- contextualized by a Task.

The MCP representation should preserve the original Markdown/text rather than forcing it into an AI-generated structured representation.

AI-derived structure should be exposed separately and marked as proposed/derived where applicable.

## Schedules and alarms

Schedules and Alarms are resources describing temporal organization and notification state.

Mutation tools may create/update them:

```text
schedule_activity
create_alarm
update_alarm
dismiss_alarm
```

Do not introduce timer semantics into the Mindsplosion domain merely because MCP clients may perform asynchronous operations.

## MCP Tasks vs Mindsplosion Tasks

These concepts must remain separate.

**Mindsplosion Task:** a domain object representing a bounded actionable unit of activity.

**MCP Task:** a protocol mechanism for handling long-running MCP requests.

An MCP tool that takes a long time may use MCP Task semantics in the future, but that does not turn the resulting protocol task into a Mindsplosion Task.

## Notifications and subscriptions

Later implementation should evaluate MCP resource subscriptions/notifications for changes to important resources.

Potential use cases:

- project status changed;
- goal changed;
- task completed;
- relationship changed;
- alarm state changed.

Notifications must never reveal changes to resources the subscriber cannot access.

Do not add subscriptions merely because the protocol supports them. Start with explicit resource reads and introduce notifications where an agent demonstrably benefits from fresh context.

## Aidos integration

Mindsplosion is a **human-organized context substrate** for Aidos, not an execution graph.

An Aidos agent should be able to:

1. discover relevant Mindsplosion resources;
2. read project/goal context;
3. inspect plans, notes, tasks, and relationships;
4. perform authorized mutations through domain tools;
5. receive relevant updates when subscriptions are eventually enabled.

Mindsplosion should not absorb Aidos execution semantics merely because Aidos is an MCP client.

## Implementation phases

### MCP Phase 1 — Server foundation

- [ ] Add MCP SDK v2.
- [ ] Implement MCP server transport.
- [ ] Connect MCP request identity to the canonical Principal/authentication layer.
- [ ] Reuse domain authorization for all MCP operations.
- [ ] Add protocol-level tests for unauthorized access.

### MCP Phase 2 — Core resources

- [ ] Project resources.
- [ ] Goal resources.
- [ ] Actor resources.
- [ ] Task resources.
- [ ] Plan resources.
- [ ] Note resources.
- [ ] Resource discovery.
- [ ] Authorization-filtered resource lists.

### MCP Phase 3 — Context and graph

- [ ] Project context resources.
- [ ] Goal context resources.
- [ ] Task context resources.
- [ ] Graph resources.
- [ ] Authorization-aware graph traversal.
- [ ] Relationship representations.

### MCP Phase 4 — Mutations

- [ ] Project/goal mutations.
- [ ] ProjectGoal membership operations.
- [ ] Relationship operations.
- [ ] Task operations.
- [ ] Plan/note operations.
- [ ] Schedule/alarm operations.
- [ ] Actor/label/repository operations.

### MCP Phase 5 — Search and agent ergonomics

- [ ] Search operation returning resource references.
- [ ] Context views optimized for agent consumption.
- [ ] Resource descriptions/instructions where useful.
- [ ] Test with Aidos Agent.
- [ ] Review whether the tool surface is too large or too CRUD-like.

### MCP Phase 6 — Notifications

- [ ] Identify high-value resource changes.
- [ ] Implement subscriptions/notifications selectively.
- [ ] Test authorization filtering for notifications.

### MCP Phase 7 — AI-assisted organization

After the underlying MCP/domain model is stable:

- [ ] Expose proposed project clustering.
- [ ] Expose proposed goal/relationship organization.
- [ ] Expose unattached-note discovery/suggestions.
- [ ] Keep proposals distinct from confirmed semantics.

## Definition of done

Mindsplosion's MCP implementation is ready when an authorized MCP client can understand and work with a user's project/goal graph primarily through resources, while using a small set of meaningful tools for mutations and domain operations.

The MCP layer must:

- use the canonical domain model;
- use the canonical authorization layer;
- expose private data only to authorized principals;
- avoid leaking inaccessible graph nodes;
- keep Plans/Notes human-readable;
- distinguish Mindsplosion Tasks from MCP Tasks;
- remain useful to Aidos without becoming an Aidos execution subsystem;
- avoid turning every database operation into an MCP tool.
