# Mindsplosion — Development Plan

The immediate objective is to build the **semantic/project graph and its API/MCP interfaces first**, then design and implement the human UI. The Kanban is the first UI target, but it is not the first implementation target.

## Phase 1 — Semantic foundations

Establish the domain model before designing the UI.

- [ ] Define Goal as a first-class semantic object.
- [ ] Define Project as a bounded semantic cluster of goals and organized activity.
- [ ] Define Actor, including people, teams, organizations, and AI agents.
- [ ] Define goal roles: owner/pursuer, beneficiaries, and actors.
- [ ] Define project-goal membership.
- [ ] Define typed relationships between goals/projects.
- [ ] Include explicit `distinct_from` semantics.
- [ ] Define candidate influence relationships such as `helps`, `hurts`, and `conflicts_with`.
- [ ] Define project statuses.
- [ ] Define labels.
- [ ] Resolve any remaining semantic ambiguities before implementation.

## Phase 2 — Persistence, privacy foundation, and domain implementation

Implement the semantic model without building the final UI. Privacy and security are part of this phase from the first persistence/API operation, not a later hardening step.

### Privacy and security foundation

- [ ] Define authentication model.
- [ ] Define authorization model and object access semantics.
- [ ] Establish private-by-default behavior.
- [ ] Define authorization for graph traversal and relationship discovery.
- [ ] Define deletion and retention semantics.
- [ ] Define safe error handling and privacy-preserving logging.
- [ ] Define secret handling and configuration boundaries.
- [ ] Define tests for unauthorized access and information leakage.

See `docs/privacy-security.md` for the architectural principles.

### Persistence and domain

- [ ] Establish PostgreSQL persistence.
- [ ] Implement Goal CRUD with authorization.
- [ ] Implement Project CRUD with authorization.
- [ ] Implement Actor CRUD with authorization.
- [ ] Implement project-goal membership with authorization.
- [ ] Implement typed relationships with authorization-aware traversal.
- [ ] Implement labels.
- [ ] Implement tasks and actor assignment.
- [ ] Implement Markdown plans.
- [ ] Implement notes, including unattached notes.
- [ ] Implement schedules and alarms.
- [ ] Implement GitHub repository associations.
- [ ] Add seed/example data without real personal data.
- [ ] Add domain-level tests, including privacy boundaries.

A CRUD operation is not complete merely because it can create, read, update, or delete data. It must also enforce the appropriate privacy boundary.

## Phase 3 — API

Expose the semantic model as a clean programmatic interface. The API is a canonical authorization boundary and must not bypass the domain access rules established in Phase 2.

- [ ] Choose and document API conventions.
- [ ] Expose Goals.
- [ ] Expose Projects.
- [ ] Expose Actors and goal roles.
- [ ] Expose project-goal membership.
- [ ] Expose graph relationships without leaking inaccessible nodes.
- [ ] Expose tasks, plans, notes, schedules, and alarms.
- [ ] Expose labels.
- [ ] Expose GitHub/repository context.
- [ ] Enforce authentication and authorization on every protected operation.
- [ ] Ensure errors and logs do not unnecessarily disclose content.
- [ ] Add API tests, including negative authorization tests, and documentation.

The API should be useful independently of the eventual UI.

## Phase 4 — MCP v2

Expose the same domain through MCP v2 rather than creating a second data model or security model.

- [ ] Add MCP SDK v2.
- [ ] Design project/goal graph resources.
- [ ] Expose project, goal, plan, task, note, relationship, and relevant context as resources where appropriate.
- [ ] Expose mutations and operations as tools where appropriate.
- [ ] Use MCP notifications/subscriptions where they provide meaningful value.
- [ ] Apply the same authorization model as the API; MCP must not be a security bypass.
- [ ] Ensure resource discovery and graph traversal cannot disclose inaccessible data.
- [ ] Keep the MCP surface aligned with the domain/API rather than duplicating business logic.
- [ ] Validate access from Aidos and other MCP clients.

MCP should expose Mindsplosion as a structured human-organized goal/project dataset. It is not an Aidos execution graph.

## Phase 5 — GitHub and external context

Make repository-backed projects useful without making GitHub the centre of the product.

- [ ] Connect projects to GitHub repositories.
- [ ] Show repository metadata through the API/MCP.
- [ ] Show latest commit.
- [ ] Show recent commit list.
- [ ] Show CI/check status.
- [ ] Handle repositories containing multiple projects.
- [ ] Support projects using multiple repositories.

## Phase 6 — Semantic organization / AI preparation

The system should work without AI, but its model should support AI-assisted organization.

- [ ] Define how AI proposals are represented separately from confirmed human decisions.
- [ ] Support proposed project clustering from goals.
- [ ] Support proposed relationships.
- [ ] Support proposed `distinct_from` relationships.
- [ ] Support explanations/reasons for semantic suggestions.
- [ ] Keep human confirmation authoritative.

Actual AI implementation can be deferred until the underlying model has proven itself.

## Phase 7 — UI planning session

**Dedicated planning session before implementing the main UI.**

Decide:

- Kanban information architecture.
- Project card content and density.
- Status columns and interactions.
- Navigation model.
- Project detail/explosion concept.
- How goals appear within project boundaries.
- How project boundaries are visually communicated.
- How goal/project relationships are visualized.
- How hierarchy is represented without forcing drill-down navigation.
- Responsive/mobile behavior.
- Visual language and interaction patterns.
- What belongs in the first UI release versus later spatial views.

The result should be a concrete UI specification/prototype plan before implementation begins.

## Phase 8 — UI implementation

Implement the planned human-facing client, initially with the Kanban as the main overview.

- [ ] Implement the Kanban board.
- [ ] Implement project cards.
- [ ] Implement project creation/editing flows.
- [ ] Implement project/goal organization flows.
- [ ] Implement filtering and status movement.
- [ ] Implement the planned project detail view.
- [ ] Implement the first version of the project explosion if it is part of the planned MVP UI.
- [ ] Polish responsive behavior.
- [ ] Validate the UI against realistic project data.

The UI should consume the API rather than bypassing the domain layer.

## Phase 9 — MVP

Mindsplosion MVP is reached when the user can reliably organize real goal-oriented activity and understand the resulting project landscape.

MVP should include at minimum:

- First-class goals.
- Projects as bounded semantic clusters of goals and organized activity.
- Actors with distinct owner, beneficiary, and activity roles.
- Typed goal/project relationships, including explicit distinction.
- Project statuses and labels.
- Tasks.
- Markdown plans.
- Notes, including unattached notes.
- Schedules and alarms.
- GitHub repository associations and basic repository/CI context.
- Privacy-first authentication, authorization, deletion, retention, and safe logging foundations.
- API.
- MCP v2 interface.
- Kanban project overview.
- The planned project-focused contextual UI.

## Later

These remain deliberately deferred or expandable:

- Sophisticated AI clustering and boundary discovery.
- AI-assisted plan structuring.
- AI-assisted note/goal discovery.
- Advanced spatial graph visualization.
- More sophisticated graph analysis.
- Agent-driven project/task execution.
- Deeper Aidos integration.

The product should remain useful without AI, while its semantic model is designed so AI can become a natural participant in organizing the graph later.
