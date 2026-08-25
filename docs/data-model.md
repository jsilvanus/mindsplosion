# Mindsplosion — Initial Data Model

The model is intentionally semantic and relatively flat. The visual UI may present hierarchical or spatial structures, but those structures are derived from relationships and project boundaries.

## Goal

A first-class semantic object representing something that someone or something wants to become true.

```text
Goal
├── id
├── statement
├── description?
├── kind?                 # e.g. determinate / qualitative
├── status?
├── ownerActorId?
├── createdAt
└── updatedAt
```

Goal roles are distinct:

```text
GoalOwner / pursuer     -> Actor
GoalBeneficiary         -> Actor (many)
GoalActor               -> Actor (many)
```

The owner, beneficiary, and actor may all be different. Actors may be people, teams, organizations, or AI agents.

## Project

The fundamental organizational object and project-level graph node. A project is a bounded semantic cluster of goals and the activity organized around them.

```text
Project
├── id
├── name
├── description?
├── status
├── createdAt
├── startedAt?
├── completedAt?
└── archivedAt?
```

A project can contain multiple goals:

```text
ProjectGoal
├── projectId
└── goalId
```

Project membership is explicit. Do not assume a goal has exactly one permanent project.

## Actor

A general participant in goal-oriented activity.

```text
Actor
├── id
├── name
├── type                 # person / team / organization / agent / other
└── metadata?
```

AI agents are actors, not a separate semantic domain model.

## Relationships

Relationships are typed graph edges. They may connect goals, projects, or other supported semantic objects where the relationship makes sense.

```text
Relationship
├── id
├── fromId
├── toId
├── type
└── metadata?
```

Candidate relationship types:

```text
parent_of
depends_on
blocks
enables
helps
hurts
conflicts_with
related_to
derived_from
replaces
distinct_from
```

`distinct_from` is symmetric. The absence of an edge means no relationship has been specified; `distinct_from` means a meaningful separation has been asserted.

## Supporting project objects

### Task

```text
Task
├── id
├── projectId
├── title
├── description?
├── status
├── priority?
├── dueAt?
├── assigneeActorId?
└── completedAt?
```

### Plan

```text
Plan
├── id
├── projectId
├── title
├── markdown
└── structure?
```

Markdown is the initial source of truth. `structure` can later contain derived information such as steps, dependencies, and tasks.

### Note

```text
Note
├── id
├── projectId?
├── title?
├── content
├── createdAt
└── updatedAt
```

`projectId` is optional. Unattached notes can later be associated with a project or goal, or become the seed of something new.

### Schedule

```text
Schedule
├── id
├── projectId?
├── taskId?
├── title
├── startAt
├── endAt?
└── recurrence?
```

### Alarm

```text
Alarm
├── id
├── projectId?
├── taskId?
├── title
├── triggerAt
├── recurrence?
└── dismissedAt?
```

Schedules and alarms are separate concepts. Mindsplosion does not need timers.

### Label

Labels classify projects and potentially other semantic objects without creating domain-specific systems such as Finance, Church, or Household.

```text
Label
├── id
└── name
```

### Link

```text
Link
├── id
├── projectId
├── title
├── url
└── type?
```

### Repository

GitHub repositories are external resources associated with projects.

```text
Repository
├── id
├── provider
├── owner
├── name
├── url
└── metadata?
```

The association is many-to-many:

```text
ProjectRepository
├── projectId
└── repositoryId
```

This supports one project using multiple repositories and one repository containing multiple projects.

## Inbox

An eventual intake mechanism for Dictator and other sources:

```text
InboxItem
├── id
├── content
├── source
├── createdAt
└── processedAt?
```

Inbox items are material waiting to be organized into goals, projects, tasks, notes, or other project-oriented structures.

## Core semantic model

The central model is no longer just `Project -> Project`.

```text
Goal ── semantic relationship ── Goal
  │                              │
  └────── Project membership ───┘
              │
           PROJECT
              │
       organized activity
              │
       tasks / plans / ...
```

Projects provide meaningful organizational boundaries over goal clusters. The database should remain simpler than the visualization: Kanban, hierarchy, and spatial explosion are views over this semantic model.
