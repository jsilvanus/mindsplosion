# Mindsplosion — Privacy & Security by Design

Privacy and security are part of the Mindsplosion architecture from the beginning, not a later compliance pass.

Mindsplosion may contain highly personal information: goals, household and financial projects, notes, plans, schedules, relationships involving other people, and information about organizations. The system must therefore default to protecting data rather than assuming that project data is harmless.

## Principles

### 1. Data minimisation

Only collect and persist data that has a clear product or security purpose.

Do not add analytics, personal identifiers, request metadata, detailed access logs, or other telemetry merely because it is technically convenient.

Every persistent field should have a reason to exist.

### 2. Private by default

New goals, projects, notes, plans, tasks, schedules, alarms, actors, and relationships are private unless an explicit sharing model says otherwise.

Knowing an identifier must never be sufficient to access an object.

### 3. Explicit access control

Access to an object must be authorized explicitly. Authorization applies to the semantic graph as well as individual records.

In particular, graph traversal must not leak information about objects the caller cannot access.

For example, if a caller can see Project A but cannot see Project B, an authorized response for A must not silently reveal B's name or sensitive metadata merely because A has a relationship to B.

### 4. Authentication and authorization are foundational

The request path should be conceptually:

```text
request
  ↓
authentication
  ↓
authorization
  ↓
domain operation
  ↓
persistence
```

Authorization must be present from the first CRUD/API implementation rather than added later.

### 5. MCP is not a security bypass

The REST/API and MCP interfaces must use the same underlying authorization model.

MCP must not provide an alternate route around access controls. An Aidos agent or other MCP client sees only the Mindsplosion data that its identity is authorized to access.

### 6. Sensitive content is consistently protected

Plans, Markdown, notes, task descriptions, schedules, alarms, and metadata can be sensitive even when the surrounding project looks innocuous.

There must not be an accidental distinction where the project is protected but a related content endpoint is public or insufficiently authorized.

### 7. Privacy-preserving errors and logs

Errors and operational logs must avoid unnecessary disclosure of user content.

Do not log full notes, plans, prompts, goal text, task descriptions, credentials, access tokens, or other sensitive content merely to make debugging easier.

Security/audit logging should record the minimum metadata necessary for its purpose.

### 8. Secrets

Credentials and tokens must never be stored in project content or committed to the repository.

Configuration and deployment secrets belong in the deployment secret mechanism/environment, not in the database schema or source tree.

### 9. Retention

Data should have a defined lifecycle. The system should not retain obsolete personal data indefinitely simply because storage is cheap.

Retention and deletion semantics should be defined before production deployment, including what happens to related graph edges, notes, plans, alarms, and audit/security records when an object is deleted.

### 10. Privacy of other people

A goal may have a beneficiary, owner, or actor other than the current user. Mindsplosion must not assume that information about another actor is automatically safe to expose merely because it occurs inside the user's project.

The data model should allow access decisions to evolve toward per-object and per-actor sharing without requiring a fundamental redesign.

## CRUD requirements

Before or alongside the first CRUD implementation, define:

- authentication model;
- authorization model;
- object ownership/access semantics;
- private-by-default behavior;
- graph traversal authorization;
- deletion behavior;
- retention rules;
- safe error handling;
- safe logging;
- secret handling;
- test cases for unauthorized access and information leakage.

A CRUD endpoint is not considered complete merely because it can create, read, update, or delete an object. It must also enforce the appropriate privacy boundary.

## API and MCP requirements

The API should establish the canonical authorization boundary. MCP should call the same domain authorization mechanisms rather than implementing an independent permission system.

Resource-oriented MCP access should be treated with the same care as API endpoints: resource discovery, relationship traversal, subscriptions/notifications, and tool results can all disclose information and must respect authorization.

## Privacy-first development rule

> **If a feature cannot explain what data it needs, who can access it, and how long the data should exist, it is not ready to implement.**

Privacy review should therefore happen continuously during domain/API development, rather than as a final pre-release checklist.
