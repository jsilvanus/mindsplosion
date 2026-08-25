# Mindsplosion — Persistence Model

This document turns the Phase 1 semantic model into the first PostgreSQL persistence design.

The canonical migration is `db/migrations/001_initial.sql`.

## Design principles

- PostgreSQL is the persistence layer.
- UUIDs are used for domain identifiers.
- Timestamps are stored as `timestamptz`.
- Semantic Actor roles are separate from authenticated principals and authorization.
- Project/Goal membership is an explicit many-to-many association.
- Plans and Notes are standalone content objects and can be contextualized by Projects, Goals, and Tasks.
- Schedules and Alarms are separate objects; Mindsplosion does not model timers.
- Repository is an external resource and is many-to-many with Projects.
- Authorization is private-by-default and must be enforced by the domain/API layer.

## Authentication vs semantic actors

`principal` represents an authenticated identity used for authorization. `actor` represents a participant in the world described by Mindsplosion.

They are deliberately different concepts:

```text
Principal ── may represent/control ──> Actor
```

An Actor may be a person, team, organization, or AI agent without having a Mindsplosion login.

## Authorization

Every protected object has a `created_by_principal_id`. The schema also contains `access_grant` so sharing can be explicit without conflating authorization with semantic ownership.

An `access_grant` has:

- principal;
- object type and ID;
- access level (`viewer`, `editor`, `owner`);
- granting principal;
- creation time.

`access_grant.object_id` is intentionally polymorphic because PostgreSQL cannot express a foreign key to several possible domain tables. The domain layer must validate the target before creating or using a grant.

Creation of a protected object and its initial `owner` grant must happen in one transaction.

The API/domain layer must authorize **before** reading the object, mutating it, traversing relationships, or returning related metadata.

## Semantic ownership is not authorization ownership

A Goal can have multiple semantic owners:

```text
goal_actor(role = owner)
```

That does not mean those Actors automatically have database access.

Likewise, a beneficiary or worker is not automatically granted access to the Goal merely by occupying that semantic role.

This separation is intentional and privacy-critical.

## Graph relationships

The first persistence migration restricts generic graph relationships to `Goal` and `Project` nodes. Other objects have explicit associations instead.

This keeps the semantic graph small while allowing the model to expand later when a relationship involving another object type is justified.

`distinct_from` is stored as a directed edge at persistence level. The domain layer should treat it as symmetric and prevent contradictory or duplicate semantic representations.

## Content context

Plans and Notes are not forced into one parent:

```text
Plan ──> Project / Goal / Task
Note ──> Project / Goal / Task
```

Each is represented by a dedicated join table so referential integrity remains enforced by PostgreSQL.

A Note or Plan can therefore exist without any context and be organized later.

## Scheduling

A Schedule or Alarm may target at most one of Project, Goal, or Task in the initial model. This is deliberately conservative. If a later use case requires richer multi-target scheduling, it should be added semantically rather than by quietly weakening the model.

Recurrence is initially stored as a string because the exact recurrence standard has not yet been selected. The implementation should adopt a standard representation rather than inventing a custom recurrence language.

## Deletion

Association rows use cascading deletion where the association has no independent semantic meaning.

Tasks use `ON DELETE SET NULL` for their optional Project and Goal references so deleting a container does not silently destroy an independent piece of activity.

The CRUD layer must still define and test deletion semantics for each domain object before exposing DELETE endpoints.

## Not yet implemented by this migration

The migration intentionally does not implement:

- HTTP/API routes;
- authentication provider integration;
- database-level Row Level Security;
- automatic owner-grant triggers;
- MCP v2;
- AI proposals;
- external GitHub synchronization;
- recurrence evaluation or notification delivery.

Those belong to subsequent implementation work. The important constraint is that none of those layers may bypass the privacy and domain boundaries established here.
