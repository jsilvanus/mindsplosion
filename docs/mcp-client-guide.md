# Mindsplosion MCP Client Guide

This guide explains how MCP clients (like Aidos agents) interact with the Mindsplosion MCP server.

## Overview

Mindsplosion exposes a structured goal/project graph through MCP using:
- **Resources**: For reading domain objects and context
- **Tools**: For creating and updating domain objects

The MCP server enforces the same authorization rules as the canonical API.

## Resource Discovery

### List Available Resources

All resources are discovered through specific URIs:

```
mindsplosion://projects       → list of projects
mindsplosion://goals          → list of goals
mindsplosion://tasks          → list of tasks
mindsplosion://notes          → list of notes
mindsplosion://actors         → list of actors
mindsplosion://plans          → list of plans
mindsplosion://relationships  → graph relationships (Phase 3)
```

### Access Individual Resources

```
mindsplosion://projects/{id}  → specific project
mindsplosion://goals/{id}     → specific goal
mindsplosion://tasks/{id}     → specific task
mindsplosion://notes/{id}     → specific note
mindsplosion://actors/{id}    → specific actor
mindsplosion://plans/{id}     → specific plan
```

### Context Views (Phase 3)

Get a semantic slice of related objects:

```
mindsplosion://projects/{id}/context  → project + goals + tasks + relationships
mindsplosion://goals/{id}/context     → goal + actors + tasks
mindsplosion://tasks/{id}/context     → task + project/goal + assignees
```

## Domain Model

### Project
- `id`: unique identifier
- `name`: project name
- `description`: optional narrative
- `status`: one of: idea, started, development, blocked, staging, in_production, needs_checking, completed, archived
- `createdByPrincipalId`: creator
- `createdAt`, `updatedAt`: timestamps

### Goal
- `id`: unique identifier
- `statement`: goal description
- `description`: optional narrative
- `kind`: "determinate" (measurable) or "qualitative" (subjective)
- `status`: draft, active, paused, achieved, abandoned
- `createdByPrincipalId`: creator
- `createdAt`, `updatedAt`: timestamps

### Task
- `id`: unique identifier
- `title`: task name
- `description`: optional narrative
- `status`: todo, in_progress, blocked, done, cancelled
- `priority`: optional numeric priority
- `dueAt`: optional ISO 8601 deadline
- `projectId`: optional associated project
- `goalId`: optional associated goal
- `createdByPrincipalId`: creator
- `createdAt`, `updatedAt`: timestamps
- `completedAt`: set when status becomes "done"

### Note
- `id`: unique identifier
- `title`: optional note title
- `content`: note text (supports Markdown)
- `createdByPrincipalId`: creator
- `createdAt`, `updatedAt`: timestamps

### Actor
- `id`: unique identifier
- `name`: actor name
- `type`: person, team, organization, agent, other
- `description`: optional narrative
- `metadata`: optional arbitrary data
- `createdByPrincipalId`: creator
- `createdAt`, `updatedAt`: timestamps

### Plan
- `id`: unique identifier
- `title`: plan name
- `markdown`: plan content in Markdown format
- `createdByPrincipalId`: creator
- `createdAt`, `updatedAt`: timestamps

## Tool Reference

### Project Operations

**create_project**
```
Arguments:
  name (required): string - project name
  status (required): "idea" | "started" | "development" | "blocked" | "staging" | "in_production" | "needs_checking" | "completed" | "archived"
  description (optional): string - project description

Returns: created Project object
```

**update_project**
```
Arguments:
  projectId (required): string - project ID
  name (optional): string - new name
  description (optional): string - new description
  status (optional): same enum as create_project

Returns: updated Project object
```

### Goal Operations

**create_goal**
```
Arguments:
  statement (required): string - goal description
  kind (required): "determinate" | "qualitative"
  status (required): "draft" | "active" | "paused" | "achieved" | "abandoned"
  description (optional): string - additional narrative

Returns: created Goal object
```

**update_goal**
```
Arguments:
  goalId (required): string - goal ID
  statement (optional): string
  kind (optional): "determinate" | "qualitative"
  status (optional): goal status
  description (optional): string

Returns: updated Goal object
```

### Task Operations

**create_task**
```
Arguments:
  title (required): string - task title
  status (required): "todo" | "in_progress" | "blocked" | "done" | "cancelled"
  description (optional): string
  priority (optional): number
  dueAt (optional): ISO 8601 string
  projectId (optional): string - associate with project
  goalId (optional): string - associate with goal

Returns: created Task object
```

**update_task**
```
Arguments:
  taskId (required): string - task ID
  title (optional): string
  status (optional): task status
  description (optional): string
  priority (optional): number
  dueAt (optional): ISO 8601 string

Returns: updated Task object
```

### Note Operations

**create_note**
```
Arguments:
  content (required): string - note text (Markdown supported)
  title (optional): string - note title

Returns: created Note object
```

**update_note**
```
Arguments:
  noteId (required): string - note ID
  content (optional): string
  title (optional): string

Returns: updated Note object
```

### Actor Operations

**create_actor**
```
Arguments:
  name (required): string - actor name
  type (required): "person" | "team" | "organization" | "agent" | "other"
  description (optional): string

Returns: created Actor object
```

### Semantic Operations

**add_goal_to_project**
```
Arguments:
  projectId (required): string - project ID
  goalId (required): string - goal ID

Returns: { success: true, message: "Goal added to project" }
```

## Authorization

- Every operation respects the principal's access level
- Only accessible resources are returned
- Forbidden and not-found return the same error (no enumeration attacks)
- Authorization checks use the canonical domain layer

## Error Handling

Errors are returned with descriptive messages:

```
"Resource not found or not accessible"  → Resource doesn't exist or you lack access
"Unknown tool: {name}"                  → Tool name is invalid
"Error: {specific message}"             → Domain-level validation or authorization failure
```

## Usage Example (Pseudocode)

```python
# Read all projects
projects = client.read_resource("mindsplosion://projects")

# Get a specific project
project = client.read_resource("mindsplosion://projects/abc123")

# Get project context (goals, tasks, relationships)
context = client.read_resource("mindsplosion://projects/abc123/context")

# Create a new task
task = client.call_tool("create_task", {
  "title": "Implement feature X",
  "status": "todo",
  "projectId": "abc123"
})

# Update task status to in_progress
updated = client.call_tool("update_task", {
  "taskId": task.id,
  "status": "in_progress"
})

# Create a goal and add it to the project
goal = client.call_tool("create_goal", {
  "statement": "Achieve X outcome",
  "kind": "determinate",
  "status": "active"
})

client.call_tool("add_goal_to_project", {
  "projectId": "abc123",
  "goalId": goal.id
})
```

## Best Practices

1. **Start with resource discovery**: Read `mindsplosion://projects` to understand the current state
2. **Use context resources for planning**: Fetch project/goal context before making changes
3. **Keep mutations atomic**: Don't create many related objects in a single call; use multiple tool calls
4. **Check authorization early**: Rely on proper error messages if access is denied
5. **Preserve human intent**: Maintain the distinction between confirmed relationships and proposed ones (AI suggestions)

## Future Enhancements (Phase 3+)

- Graph resources for exploring relationships
- Search tool for finding objects by content
- Subscriptions for real-time updates to important resources
- Proposed/derived structure marking for AI-suggested organizations
- Schedule and alarm resources for temporal planning
