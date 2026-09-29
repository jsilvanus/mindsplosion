import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPool, type Db } from "../src/db/pool.js";
import { MindsplosionContext } from "../src/mcp/context.js";
import { createMindsplosionServer } from "../src/mcp/create-server.js";
import { parseRepositoryUrl } from "../src/mcp/tools.js";

// Runs on a temporary SQLite file; MINDSPLOSION_TEST_DATABASE_URL (a migrated PostgreSQL
// database, truncated here) runs the same tests on PostgreSQL.
const PG_URL = process.env.MINDSPLOSION_TEST_DATABASE_URL;

let dir: string;
let db: Db;
let alice: Client;
let bob: Client;

async function connect(context: MindsplosionContext, subject: string): Promise<Client> {
  const server = createMindsplosionServer(context, () => context.resolvePrincipal(subject));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mindsplosion-tools-"));
  db = createPool(PG_URL ?? join(dir, "test.sqlite"));
  if (PG_URL) await db.query("TRUNCATE principal, access_grant, project, goal, task, note, plan, actor, schedule, alarm, label, repository, relationship CASCADE");
  const context = new MindsplosionContext(db);
  alice = await connect(context, "alice");
  bob = await connect(context, "bob");
});

afterAll(async () => {
  await alice?.close();
  await bob?.close();
  await (db as unknown as { end?: () => Promise<void> }).end?.();
  rmSync(dir, { recursive: true, force: true });
});

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  if (result.isError) throw new Error(text);
  return JSON.parse(text);
}

describe("MCP tools", () => {
  it("lists read tools with read-only annotations", async () => {
    const { tools } = await alice.listTools();
    const names = tools.map((t) => t.name);
    for (const name of ["inbox", "read", "list", "search", "create_schedule", "create_alarm", "dismiss_alarm", "create_label", "add_label", "create_repository", "link_repository", "delete"]) {
      expect(names).toContain(name);
    }
    expect(tools.find((t) => t.name === "search")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "delete")?.annotations?.destructiveHint).toBe(true);
  });

  it("builds a project with goals, tasks, notes, labels, repositories, schedules and alarms, and reads its context", async () => {
    const project = await call(alice, "create_project", { name: "Mindsplosion", description: "Second brain for coding work", status: "development" });
    const goal = await call(alice, "create_goal", { statement: "Use it every day", kind: "qualitative", status: "active" });
    await call(alice, "add_goal_to_project", { projectId: project.id, goalId: goal.id });
    const task = await call(alice, "create_task", { title: "Write the inbox tool", status: "todo", projectId: project.id, dueAt: "2026-10-01" });
    const note = await call(alice, "create_note", { title: "Idea", content: "Remember the Zeppelin approach to recurrence", projectId: project.id });
    const labelled = await call(alice, "add_label", { targetType: "project", targetId: project.id, name: "Work" });
    const again = await call(alice, "add_label", { targetType: "task", targetId: task.id, name: "work" });
    expect(again.label.id).toBe(labelled.label.id);
    const repo = await call(alice, "create_repository", { url: "https://github.com/jsilvanus/mindsplosion.git", projectId: project.id });
    expect(repo).toMatchObject({ provider: "github", owner: "jsilvanus", name: "mindsplosion", externalId: "jsilvanus/mindsplosion", created: true });
    const same = await call(alice, "create_repository", { url: "git@github.com:jsilvanus/mindsplosion.git" });
    expect(same).toMatchObject({ id: repo.id, created: false });
    await call(alice, "create_schedule", { title: "Weekly review", startAt: "2026-09-28T07:00:00Z", endAt: "2026-09-28T08:00:00Z", recurrence: "weekly", timezone: "Europe/Helsinki", projectId: project.id });
    await call(alice, "create_alarm", { title: "Ship it", triggerAt: "2026-09-29T08:00:00Z", projectId: project.id });

    const ctx = await call(alice, "read", { uri: `mindsplosion://projects/${project.id}/context` });
    expect(ctx.project.id).toBe(project.id);
    expect(ctx.goals.map((g: any) => g.id)).toEqual([goal.id]);
    expect(ctx.tasks.map((t: any) => t.id)).toEqual([task.id]);
    expect(ctx.notes.map((n: any) => n.id)).toEqual([note.id]);
    expect(ctx.labels.map((l: any) => l.name)).toEqual(["Work"]);
    expect(ctx.repositories).toEqual([expect.objectContaining({ id: repo.id, url: "https://github.com/jsilvanus/mindsplosion" })]);
    expect(ctx.schedules).toHaveLength(1);
    expect(ctx.alarms).toHaveLength(1);

    const labelCtx = await call(alice, "read", { uri: `mindsplosion://labels/${labelled.label.id}/context` });
    expect(labelCtx.projects.map((p: any) => p.id)).toEqual([project.id]);
    expect(labelCtx.tasks.map((t: any) => t.id)).toEqual([task.id]);

    const byLabel = await call(alice, "list", { type: "task", label: "WORK" });
    expect(byLabel.items.map((t: any) => t.id)).toEqual([task.id]);
    expect(byLabel.items[0].uri).toBe(`mindsplosion://tasks/${task.id}`);
    const byProject = await call(alice, "list", { type: "note", projectId: project.id });
    expect(byProject.total).toBe(1);

    const hits = await call(alice, "search", { query: "zeppelin RECURRENCE" });
    expect(hits).toEqual([expect.objectContaining({ type: "note", id: note.id, title: "Idea", uri: `mindsplosion://notes/${note.id}` })]);
    expect(hits[0].snippet).toContain("Zeppelin");
    expect(await call(alice, "search", { query: "100%" })).toEqual([]);

    const inbox = await call(alice, "inbox", { now: "2026-09-29T12:00:00Z" });
    expect(inbox.alarms.ringing.map((a: any) => a.title)).toEqual(["Ship it"]);
    expect(inbox.tasks.dueSoon.map((t: any) => t.title)).toEqual(["Write the inbox tool"]);
    expect(inbox.schedules.upcoming[0]).toMatchObject({ title: "Weekly review", startAt: "2026-10-05T07:00:00.000Z" });

    const [alarm] = ctx.alarms;
    await call(alice, "dismiss_alarm", { alarmId: alarm.id });
    const after = await call(alice, "read", { uri: "mindsplosion://inbox" });
    expect(after.alarms.ringing).toEqual([]);

    const resource = await alice.readResource({ uri: `mindsplosion://tasks/${task.id}/context` });
    const taskCtx = JSON.parse((resource.contents[0] as { text: string }).text);
    expect(taskCtx.project.id).toBe(project.id);
    expect(taskCtx.labels.map((l: any) => l.name)).toEqual(["Work"]);
  });

  it("keeps each principal's data private", async () => {
    const [project] = (await call(alice, "list", { type: "project" })).items;
    expect((await call(bob, "list", { type: "project" })).items).toEqual([]);
    expect(await call(bob, "search", { query: "mindsplosion" })).toEqual([]);
    await expect(call(bob, "read", { uri: `mindsplosion://projects/${project.id}/context` })).rejects.toThrow(/not found/i);
    await expect(call(bob, "add_label", { targetType: "project", targetId: project.id, name: "mine" })).rejects.toThrow(/not found/i);
    await expect(call(bob, "delete", { type: "project", id: project.id })).rejects.toThrow(/not found/i);
    await expect(call(bob, "create_repository", { url: "https://github.com/jsilvanus/mindsplosion" })).rejects.toThrow(/another account/);
    const inbox = await call(bob, "inbox", { now: "2026-09-29T12:00:00Z" });
    expect(inbox.summary).toEqual({ ringingAlarms: 0, ongoing: 0, upcoming: 0, overdueTasks: 0, dueSoonTasks: 0, upcomingAlarms: 0 });
  });

  it("validates input", async () => {
    await expect(call(alice, "create_schedule", { title: "x", startAt: "2026-10-01T10:00:00Z", recurrence: "FREQ=HOURLY" })).rejects.toThrow(/FREQ/);
    await expect(call(alice, "create_alarm", { title: "x", triggerAt: "2026-10-01", timezone: "Mars/Olympus" })).rejects.toThrow(/time zone/);
    await expect(call(alice, "create_alarm", { title: "x", triggerAt: "not a date" })).rejects.toThrow(/date-time/);
    await expect(call(alice, "read", { uri: "https://example.org" })).rejects.toThrow(/Invalid resource URI/);
    await expect(call(alice, "read", { uri: "mindsplosion://projects/not-an-id" })).rejects.toThrow(/not found/i);
    await expect(call(alice, "list", { type: "actor", label: "Work" })).rejects.toThrow(/carry labels/);
  });

  it("deletes items", async () => {
    const note = await call(alice, "create_note", { content: "temporary" });
    expect(await call(alice, "delete", { type: "note", id: note.id })).toMatchObject({ success: true });
    await expect(call(alice, "read", { uri: `mindsplosion://notes/${note.id}` })).rejects.toThrow(/not found/i);
  });
});

describe("parseRepositoryUrl", () => {
  it("reads GitHub, GitLab subgroups and scp-style URLs", () => {
    expect(parseRepositoryUrl("https://github.com/a/b")).toEqual({ provider: "github", owner: "a", name: "b", url: "https://github.com/a/b" });
    expect(parseRepositoryUrl("https://gitlab.com/group/sub/proj.git")).toMatchObject({ provider: "gitlab", owner: "group/sub", name: "proj" });
    expect(parseRepositoryUrl("git@github.com:a/b.git")).toEqual({ provider: "github", owner: "a", name: "b", url: "https://github.com/a/b" });
    expect(parseRepositoryUrl("not a url")).toBeUndefined();
  });
});
