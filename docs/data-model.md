# Mindsplosion — Initial Data Model

The model is intentionally project-centric and relatively flat. The visual UI may present hierarchical or spatial structures, but those structures are derived from relationships between projects.

## Project

The fundamental domain object and graph node.

```text
Project
├── id
├── name
├── goal
├── status
├── createdAt
├── startedAt?
├── completedAt?
└── archivedAt?
```

The essential semantic fields are `name`, `goal`, and `status`.

The goal is a property of the project, not initially a separate graph node. Hierarchical goals are represented by relationships between projects.

## Project relationships

Relationships are graph edges between projects.

```text
ProjectRelationship
├── id
├── fromProjectId
├── toProjectId
├── type
└── metadata?
```

Initial relationship types:

```text
parent_of
depends_on
blocks
enables
related_to
derived_from
replaces
distinct_from
```

`parent_of` provides project hierarchy/subprojects without creating a separate `Subproject` entity.

`distinct_from` is a first-class relationship because an explicit distinction is different from having no known relationship. It should be symmetric.

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

`projectId` is optional. Unattached notes can later be associated with an existing project or become the seed of a new project.

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

Labels classify projects across domains such as `AI`, `church`, `finance`, `household`, `learning`, and `software` without turning those domains into separate entity systems.

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

This supports both one project using multiple repositories and one repository containing multiple projects.

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

Inbox items are not a competing domain model. They are material waiting to be organized into projects, tasks, notes, or other project-oriented structures.

## Core principle

The database should remain simpler than the visualization. The primary graph is:

```text
Project ── relationship ── Project
```

Tasks, plans, notes, schedules, alarms, labels, links, and repositories provide context around a project. The UI can turn these relationships into Kanban, hierarchy, and spatial explosion views without requiring separate data models for each visual representation.
