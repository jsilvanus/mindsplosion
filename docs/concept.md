# Mindsplosion — Concept

## Core definition

> A project is a bounded activity organized around a goal.

This is the foundational definition of Mindsplosion.

The important word is **organized**. Mindsplosion is not merely a place to store projects or notes. It organizes and bounds activities around goals.

A project provides a boundary: it separates the activities, plans, tasks, context, and resources oriented toward one goal from those oriented toward another goal.

The goal can be precise, vague, exploratory, or evolving. The project remains valid as long as there is a bounded activity organized around some goal.

## Project as the fundamental unit

Projects are the fundamental domain objects and graph nodes in Mindsplosion.

A project is not synonymous with:

- a GitHub repository
- a task
- a note
- an event
- a financial item
- a learning topic
- a software project

All of these can be part of or associated with a project. Finance, household, learning, church work, software development, and other domains are therefore naturally represented as collections of projects rather than as separate top-level systems.

## Project boundaries

A project boundary answers:

- What belongs to this goal?
- What does not belong to this goal?
- Which activities are organized together?
- Which related activities are nevertheless separate projects?

The boundary is contextual rather than an absolute wall. Projects may share repositories, people, documents, or other resources, and projects may be related without being the same project.

This makes explicit distinction important. In particular, the graph should be able to say that two projects are **distinct from** one another. Absence of a relationship means that no relationship has been specified; `distinct_from` means that a meaningful distinction has been made.

## Project graph

Mindsplosion is fundamentally a **goal-oriented project graph**.

- Projects are graph nodes.
- Relationships are graph edges.
- Goal hierarchy is represented through project relationships rather than a separate goal hierarchy.
- Subprojects are ordinary projects that participate in a hierarchical relationship.

The model should remain flatter than the visual representation. A hierarchy or spatial explosion is a view of project relationships, not a requirement that the data model become a deeply nested tree.

## Relationships

Initial relationship types should include:

- `parent_of`
- `depends_on`
- `blocks`
- `enables`
- `related_to`
- `derived_from`
- `replaces`
- `distinct_from`

`distinct_from` is conceptually important and should be treated as symmetric: if A is distinct from B, B is distinct from A.

## Plans, notes, and other project context

### Plans

Plans are initially Markdown documents attached to projects. Markdown is the human-readable source of truth.

Later, Mindsplosion may derive structured information from a plan, potentially with AI assistance: steps, dependencies, tasks, and other useful structure. The structured representation should not replace the original Markdown.

### Notes

Notes are not required to belong to a project.

An unattached note is potential project material. Mindsplosion should eventually help identify which project a note belongs to, or whether it represents a new project. This is different from building a general-purpose knowledge base or Obsidian replacement.

### Tasks

Tasks are actionable work within a project. They may eventually be usable by Aidos Agent, but Mindsplosion itself remains the system for organizing the work around the goal.

### Schedules and alarms

Projects can have schedules and alarms. These are deliberately different from timers.

### GitHub

A project may be associated with one or more GitHub repositories, and a repository may contain or support multiple projects. GitHub is external development context, not the definition of a project.

## Visualization

Visualization is part of the product concept, not merely a UI choice.

The project graph should be understandable visually, with boundaries and relationships made apparent.

The initial overview can be a Kanban board showing project status. When a project is opened, the intended direction is a visual **explosion from the project centre**: the project and its surrounding plans, tasks, schedules, alarms, notes, repositories, subprojects, and related projects should be visible as a contextual whole.

This is not intended to be a drill-down node graph where the user repeatedly clicks a node to go deeper. The project itself is the focal point and its organization should be visible around it.

## Scope boundary

Mindsplosion is project-oriented, not a generic note-taking or knowledge-management system.

Its purpose is to make goal-oriented activity visible, clear, bounded, connected, and manageable.
