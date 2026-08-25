# Mindsplosion — Concept

## Core definition

> A project is a bounded activity organized around a goal.

This remains the foundational human-facing definition of Mindsplosion. The important word is **organized**: Mindsplosion organizes and bounds activities around goals.

The model is now more precise: **Goals are first-class semantic objects, while Projects are bounded semantic clusters of goals and the activity organized around them.**

## Goals

A Goal is a first-class semantic object: something that someone or something wants to become true.

A goal may be precise, vague, exploratory, qualitative, or evolving. It does not have to belong to the current user. A goal may have:

- an owner/pursuer — whose goal it is or who is responsible for pursuing it;
- one or more beneficiaries — who benefit from achievement;
- one or more actors — who perform activity toward it.

These roles are deliberately distinct. The owner, beneficiary, and actor may all be different.

Actors may be people, teams, organizations, or AI agents. Mindsplosion treats agents as actors rather than making AI a special domain model.

Goals may have semantic relationships to other goals.

## Projects as bounded semantic clusters

A Project is the fundamental organizational object in Mindsplosion. It establishes a boundary around a meaningful cluster of goals and the activity organized around them.

A project answers:

- Which goals are we treating as belonging together?
- What activity is organized around those goals?
- Where is the boundary between this project and other projects?
- Which goals or activities are related but deliberately separate?

A project can contain multiple goals. A goal may potentially participate in more than one project context when that is semantically meaningful. Project membership is therefore explicit rather than assuming a goal has exactly one permanent parent.

Project formation itself is a semantic operation: a human or AI may propose that a set of goals forms a meaningful project boundary, while the human remains authoritative over the boundary.

## Goal-oriented semantic graph

Mindsplosion is fundamentally a **goal-oriented semantic graph**. Goals and Projects are the central semantic objects. Relationships express meaning between goals and/or projects as appropriate.

The project graph remains central to the product and its main visualization, but it is understood as a projection of the underlying goal-oriented graph rather than the entire semantic model.

The model should remain flatter than the visual representation. Hierarchies and spatial explosions are views of semantic relationships, not a requirement for deeply nested data.

## Boundaries and distinctions

A project boundary is a semantic claim that a set of goals and activities is being organized together toward a meaningful purpose.

Explicit distinction is therefore important:

```text
A ── distinct_from ── B
```

means A and B have been considered in relation to each other and are deliberately treated as separate. This is different from having no known relationship.

Candidate relationship types include:

- `parent_of`
- `depends_on`
- `blocks`
- `enables`
- `helps`
- `hurts`
- `conflicts_with`
- `related_to`
- `derived_from`
- `replaces`
- `distinct_from`

`distinct_from` is conceptually symmetric. Relationship semantics should be explicit rather than treating every edge as an arbitrary link.

## AI-native semantic organization

AI is not required for Mindsplosion to be useful, but semantic organization is an intrinsic opportunity for AI.

Given a collection of goals, notes, relationships, and activity, a model can propose meaningful project clusters and project boundaries. It can explain why goals appear to belong together, suggest relationships, identify likely duplicates, and point out goals that may be related but should remain distinct.

The intended interaction is **AI proposes; the human decides**.

This makes Mindsplosion AI-native at the conceptual level without requiring AI in the initial implementation.

## Plans, notes, and other context

Plans are initially Markdown documents attached to projects. Markdown is the human-readable source of truth. Later, structured information can be derived from the Markdown, potentially with AI assistance.

Notes are not required to belong to a project. An unattached note is potential project/goal material. Mindsplosion should eventually help identify which project or goal a note belongs to, or whether it represents something new. This is not intended to become a general-purpose knowledge base or Obsidian replacement.

Tasks are actionable work within a project. They represent activity rather than the semantic definition of the project.

Projects can have schedules and alarms; these are deliberately different from timers.

A project may be associated with one or more GitHub repositories, and a repository may contain or support multiple projects. GitHub is external context, not the definition of a project.

## Visualization

Visualization is part of the product concept, not merely a UI choice.

The initial overview can be a Kanban board showing project status. When a project is opened, the intended direction is a visual **explosion from the project centre**: the project and its surrounding goals, plans, tasks, schedules, alarms, notes, repositories, subprojects, and related projects should be visible as a contextual whole.

This is not intended to be a drill-down node graph where the user repeatedly clicks a node to go deeper. The project itself is the focal point and its organization should be visible around it.

## Scope

Mindsplosion is project-oriented, not a generic note-taking or knowledge-management system. Its purpose is to make goal-oriented activity visible, clear, bounded, connected, and manageable. Its deeper semantic model is a goal-oriented graph in which projects provide meaningful organizational boundaries.
