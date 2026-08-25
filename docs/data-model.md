# Mindsplosion — Phase 1 Data Model

The model is intentionally semantic and relatively flat. The visual UI may present hierarchical or spatial structures, but those structures are derived from relationships and project boundaries.

## Design principles

- **Goal is a first-class semantic object.**
- **Project is the fundamental organizational object:** a bounded semantic cluster of goals and the activity organized around them.
- Goals may exist without projects.
- A goal may belong to multiple projects.
- Actors are independent semantic objects and are not the same thing as authenticated users.
- Project/goal membership is distinct from ownership.
- Generic graph relationships are distinct from role associations and ordinary containment/association records.
- Privacy/access control is part of the domain boundary and must be enforced by the implementation from the first CRUD operation.
- Markdown is the source of truth for Plans and Notes; later structured interpretation may be derived.

## Goal

A first-class semantic object representing something that someone or something wants to become true.

```text
Goal
├── id
├── statement
├── description?
├── kind
├── status
├── createdAt
└── updatedAt
```

### Goal kind

The initial vocabulary is deliberately small:

```text
determinate
qualitative
```

The model may later acquire additional kinds if actual use cases justify them.

### Goal status

Goals have their own lifecycle/status. Goal status is independent of Project status and Task status.

The exact initial status vocabulary remains to be finalized during schema implementation; it should not be conflated with Project status.

### Goal roles

A Goal has three distinct actor roles:

```text
GoalOwner / pursuer  -> Actor (many)
GoalBeneficiary      -> Actor (many)
GoalWorker           -> Actor (many)
```

Owners, beneficiaries, and workers may be different actors or the same actor.

A worker represents participation in pursuing the goal at the goal level. Task assignees represent responsibility for a particular unit of activity.

These are role associations, not generic semantic graph edges.

### Standalone and multi-project goals

A Goal can exist without any Project.

A Goal can belong to multiple Projects. Project membership is therefore represented by an explicit many-to-many association rather than a `projectId` field on Goal.

This supports the core Mindsplosion workflow of collecting/clarifying goals first and discovering meaningful project boundaries later.

## Project

The fundamental organizational object. A Project is a bounded semantic cluster of goals and the activity organized around them.

```text
Project
├── id
├── name
├── description?
├── status
├── createdAt
├── updatedAt
├── startedAt?
├── completedAt?
└── archivedAt?
```

Project status describes the state of the organized activity, not the state of its individual goals.

Initial project status vocabulary:

```text
idea
started
development
blocked
staging
in_production
needs_checking
```

A Project may exist before its goals are fully understood.

## ProjectGoal

The explicit many-to-many association between Projects and Goals.

```text
ProjectGoal
├── projectId
├── goalId
├── createdAt
└── updatedAt
```

Its semantic meaning is:

> This Goal is included within this Project's organizational boundary.

It does **not** imply that the Project owns the Goal.

Removing ProjectGoal membership does not delete either the Project or Goal.

The association intentionally starts without a `role` or `priority` field. Those can be added if real use cases establish a need.

## Actor

A general participant in goal-oriented activity.

```text
Actor
├── id
├── name
├── type
├── description?
├── createdAt
└── updatedAt
```

Initial Actor types:

```text
person
organization
team
agent
```

Additional types such as household/community can be introduced later if needed.

An AI agent is simply an Actor of type `agent` from the semantic model's perspective.

### Actor versus User

An authenticated **User** is an identity that can access Mindsplosion.

An **Actor** is something represented in the world described by Mindsplosion and capable of participating in goal-oriented activity.

They must not be conflated. An Actor does not require a Mindsplosion login.

Authorization principals/users and semantic Actors may be linked later through an explicit identity/access model.

## Relationship

Relationships are typed semantic graph edges. They are separate from ProjectGoal membership and from Goal role associations such as `owned_by`, `benefits`, and `worked_on_by`.

```text
Relationship
├── id
├── sourceId
├── targetId
├── type
├── description?
├── createdBy
├── createdAt
└── updatedAt
```

Initial candidate relationship vocabulary:

### Structural

```text
parent_of
derived_from
replaces
```

### Dependency / influence

```text
depends_on
blocks
enables
helps
hurts
conflicts_with
```

### Association

```text
related_to
```

### Boundary / distinction

```text
distinct_from
```

`distinct_from` is symmetric. It means an explicit separation has been asserted; absence of a relationship means only that no relationship has been specified.

Relationship direction and symmetry must be properties of the relationship type definition, not assumptions made by individual clients.

Relationships may cross Project boundaries. For example, a Goal in Project A may depend on a Goal in Project B while the Projects remain explicitly distinct.

The implementation should eventually define which source/target object-type combinations are valid for each relationship type rather than allowing arbitrary edges.

AI-proposed relationships must eventually be distinguishable from human-confirmed semantic facts; the Phase 1 model therefore retains `createdBy` and should later gain explicit proposal/provenance semantics.

## Task

A Task is a bounded actionable unit of activity.

```text
Task
├── id
├── title
├── description?
├── status
├── projectId?
├── goalId?
├── assignees[]       -> Actor
├── dueAt?
├── createdAt
└── updatedAt
```

Project and Goal associations are optional because activity may initially be captured before it is organized.

Initial Task status vocabulary:

```text
todo
in_progress
blocked
done
cancelled
```

Task status is independent of Project and Goal status.

Task assignees describe responsibility for a particular piece of activity. They are distinct from Goal-level workers.

A separate Activity entity is deliberately deferred. A Task is currently the model's bounded actionable unit of activity.

## Plan

A Plan describes how activity around a Project, Goal, or Task is expected to proceed.

```text
Plan
├── id
├── title
├── contentMarkdown
├── createdAt
└── updatedAt
```

Plans are standalone objects and can be contextually associated with Projects, Goals, and/or Tasks.

Markdown is the source of truth. A later structured representation may contain derived information such as steps, dependencies, or tasks, potentially generated with AI assistance, but must not replace the Markdown source.

## Note

A Note is captured information or thought that does not necessarily have an organizational home yet.

```text
Note
├── id
├── title?
├── contentMarkdown
├── createdAt
└── updatedAt
```

Notes are standalone and can be contextually associated with Projects, Goals, and/or Tasks. A Note can remain completely unattached.

This supports the capture-first, organize-later workflow and eventual AI-assisted classification into existing or new project/goal contexts.

## Context associations for Plans and Notes

Plans and Notes should not use a collection of mutually exclusive `projectId`, `goalId`, and `taskId` fields. A single Plan or Note may meaningfully provide context to multiple objects.

The implementation should therefore use explicit context associations, for example:

```text
PlanContext
├── planId
├── targetType
└── targetId

NoteContext
├── noteId
├── targetType
└── targetId
```

Supported targets initially:

```text
project
goal
task
```

These are contextual associations, not necessarily semantic graph edges.

## Schedule

A Schedule describes when something is planned to happen or recur. Mindsplosion does not need timers.

```text
Schedule
├── id
├── title
├── startsAt?
├── endsAt?
├── recurrence?
├── timezone?
├── createdAt
└── updatedAt
```

Schedules can be associated with Projects, Goals, and Tasks. The temporal association should remain explicit rather than assuming every schedule belongs to a Project.

Recurrence should use a standard representation during implementation rather than inventing a custom recurrence language.

## Alarm

An Alarm describes when Mindsplosion should notify an Actor about a target.

```text
Alarm
├── id
├── targetType
├── targetId
├── trigger
├── message?
├── recipients[]      -> Actor
├── enabled
├── createdAt
└── updatedAt
```

Initial targets may be Project, Goal, Task, or Schedule.

An Alarm is distinct from a Schedule: a Schedule describes temporal organization; an Alarm describes notification behavior.

## Label

Labels classify objects for filtering and organization. They are not semantic graph edges.

```text
Label
├── id
├── name
├── description?
├── createdAt
└── updatedAt
```

Labels are user-defined. Initial examples include `AI`, `church`, `finance`, `household`, `learning`, and `software`, but these are data rather than hard-coded domain types.

Status must not be represented as a Label when a proper lifecycle/status field exists.

Label associations are many-to-many and can be added to Projects and other labelable objects as needed.

## Repository

A Repository is an external resource, not a Project.

```text
Repository
├── id
├── provider
├── externalId
├── owner
├── name
├── url
├── description?
├── createdAt
└── updatedAt
```

GitHub is the first provider, but the model should not make GitHub the semantic definition of Repository.

The Project/Repository association is many-to-many:

```text
ProjectRepository
├── projectId
├── repositoryId
├── path?
├── createdAt
└── updatedAt
```

`path` supports the case where one repository/monorepo contains multiple projects.

Repository metadata such as latest commit, recent commits, CI/check state, and other GitHub observations should be retrieved/cached by the integration layer rather than becoming core Repository identity fields.

## Link

A Link is a generic external reference associated with project-oriented context.

```text
Link
├── id
├── title
├── url
├── type?
├── createdAt
└── updatedAt
```

Links should be contextually associated rather than assuming every Link belongs only to a Project. Exact context association semantics should follow the same approach as Plans and Notes if broader use is needed.

## InboxItem

An eventual intake mechanism for Dictator and other sources.

```text
InboxItem
├── id
├── contentMarkdown
├── source
├── createdAt
└── processedAt?
```

Inbox items are material waiting to be organized into goals, projects, tasks, notes, or other project-oriented structures. Inbox is intentionally an intake concept, not a replacement for the semantic model.

## Status separation

Status belongs to the object whose lifecycle it describes:

```text
Project.status  -> state of organized project activity
Goal.status     -> state of the intended outcome
Task.status     -> state of the actionable activity
```

These must not be collapsed into one universal status field.

## Privacy and access boundary

Privacy is not represented by a single `ownerId` field on every object.

The implementation must establish explicit authentication and authorization semantics separately from the semantic Actor model. Objects are private by default, and graph traversal/context association must not disclose inaccessible objects.

The eventual persistence model must define access semantics for every object and association, including deletion/retention behavior. See `docs/privacy-security.md`.

## Core semantic model

The central model is a goal-oriented graph with project boundaries:

```text
                         ACTOR
                    /      |      \
                owner  beneficiary  worker
                    \      |      /
                         GOAL
                       /  |  \
                      /   |   \
             ProjectGoal  |   Relationships
                   |       |       |
                   ▼       ▼       ▼
                PROJECT  TASK    GOAL/PROJECT
                   |
       ┌───────────┼────────────┐
       ▼           ▼            ▼
     PLAN         NOTE       SCHEDULE
       │           │            │
       └───────────┴────────────▼
                              ALARM
```

Projects provide meaningful organizational boundaries over goal clusters. The database should remain simpler than the visualization: Kanban, hierarchy, and spatial explosion are views over this semantic model.

## Phase 1 consistency decisions

The following are intentionally locked for the initial domain model:

- Goal is first-class.
- Goal has multiple owners, multiple beneficiaries, and multiple workers.
- Goal has its own kind and status.
- Goal can exist without a Project.
- Goal can belong to multiple Projects.
- ProjectGoal is an explicit many-to-many boundary association.
- Actor is independent of authenticated User identity.
- Plan and Note are standalone and may be associated with Project, Goal, and Task.
- Task can exist without Project/Goal and has its own status.
- Schedule and Alarm are separate concepts; no timer entity is needed.
- Labels classify rather than define semantic relationships.
- Repository is external context and can be associated many-to-many with Projects.
- Generic semantic relationships are typed graph edges, including explicit `distinct_from`.
