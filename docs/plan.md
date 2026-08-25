# Mindsplosion — Development Plan

The immediate objective is to reach a useful **Kanban MVP**. The spatial project-explosion UI comes later, after a dedicated UI planning session.

## Phase 1 — Foundations

Establish the project and development foundation before designing the final UI.

- [ ] Inspect the existing repository and choose the application stack/structure.
- [ ] Establish the core Project model.
- [ ] Establish project statuses.
- [ ] Establish ProjectRelationship and the initial relationship types.
- [ ] Establish labels.
- [ ] Establish supporting models needed by the first usable project view.
- [ ] Establish persistence and basic data access.
- [ ] Add seed/example data for development.
- [ ] Document the architecture and development conventions as they become clear.

## Phase 2 — Project organization foundation

Build the non-visual project-management capabilities needed by the Kanban.

- [ ] Create, edit, archive, and view projects.
- [ ] Set and edit project goals.
- [ ] Change project status.
- [ ] Add/remove labels.
- [ ] Create and edit project relationships.
- [ ] Support project hierarchy through `parent_of` relationships.
- [ ] Add project notes.
- [ ] Add Markdown plans.
- [ ] Add tasks.
- [ ] Add schedules and alarms.
- [ ] Add repository associations.

The UI in this phase should remain functional and intentionally simple. Do not prematurely solve the final spatial design.

## Phase 3 — GitHub/project context

Make software projects useful as project records without making GitHub the centre of the product.

- [ ] Connect projects to GitHub repositories.
- [ ] Show repository metadata.
- [ ] Show latest commit.
- [ ] Show recent commit list.
- [ ] Show CI/check status.
- [ ] Handle repositories that contain multiple projects.
- [ ] Support projects that use multiple repositories.

## Phase 4 — Kanban readiness

Build the complete data and interaction layer needed for the first meaningful dashboard.

- [ ] Finalize status semantics and transitions.
- [ ] Ensure project filtering by labels works.
- [ ] Ensure project ordering/positioning can be persisted if needed.
- [ ] Provide useful project summary data for cards.
- [ ] Make status changes reliable and easy to perform.
- [ ] Add enough sample data to test a realistic board.
- [ ] Verify that the project graph remains usable independently of the eventual visual design.

## Phase 5 — UI planning session

**Dedicated planning session before implementing the main UI.**

This phase is intentionally separate from implementation.

Decide:

- Kanban information architecture.
- Project card content and density.
- Status columns and interactions.
- Navigation model.
- Project detail/explosion concept.
- How project boundaries are visually communicated.
- How project relationships are visualized.
- How hierarchy is represented without forcing drill-down navigation.
- Responsive/mobile behavior.
- Visual language and interaction patterns.
- What belongs in the first UI release versus later spatial views.

The result should be a concrete UI specification/prototype plan before implementation begins.

## Phase 6 — UI implementation

Implement the planned UI.

- [ ] Implement the Kanban board.
- [ ] Implement project cards.
- [ ] Implement project creation/editing flows.
- [ ] Implement project filtering and status movement.
- [ ] Implement the planned project detail view.
- [ ] Implement the first version of the project explosion if it is part of the planned MVP UI.
- [ ] Polish responsive behavior.
- [ ] Validate the UI against realistic project data.

## Phase 7 — MVP

Mindsplosion MVP is reached when the user can reliably use it to organize real projects around their goals and understand their current project landscape.

MVP should include at minimum:

- Projects with goals and statuses.
- Project labels.
- Project relationships, including explicit distinction between projects.
- Project hierarchy/subprojects through relationships.
- Project notes.
- Markdown plans.
- Tasks.
- Schedules and alarms.
- GitHub repository associations and basic repository/CI context.
- Kanban project overview.
- The planned project-focused UI for understanding an individual project's context.

## Later, not MVP

These ideas are deliberately deferred:

- AI-assisted plan structuring.
- AI-assisted note-to-project discovery.
- MCP integration as an Aidos-facing dataset/interface.
- Advanced spatial project visualization.
- More sophisticated graph analysis.
- Agent-driven project/task execution.

The product should be useful without AI. AI and MCP can build on a stable project model later.
