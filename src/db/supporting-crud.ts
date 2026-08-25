import type { Db } from "./pool.js";
import type { PrincipalContext } from "../domain/authorization.js";
import { requireAccess } from "../domain/authorization.js";
import type { Actor, Alarm, Id, Label, Plan, Repository, Schedule } from "../domain/model.js";

export class SupportingCrud {
  constructor(private readonly db: Db) {}

  private async createOwned<T>(principal: PrincipalContext, objectType: string, sql: string, values: unknown[], map: (row: any) => T): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(sql, [...values, principal.principalId]);
      const row = r.rows[0];
      if (!row) throw new Error(`${objectType} creation returned no row`);
      await client.query(`INSERT INTO access_grant (principal_id, object_type, object_id, access, granted_by_principal_id) VALUES ($1, $2, $3, 'owner', $1)`, [principal.principalId, objectType, row.id]);
      await client.query("COMMIT");
      return map(row);
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  }

  private async targetAccess(p: PrincipalContext, projectId?: Id, goalId?: Id, taskId?: Id): Promise<void> {
    if (projectId) await requireAccess(this, p, "project", projectId, "viewer");
    if (goalId) await requireAccess(this, p, "goal", goalId, "viewer");
    if (taskId) await requireAccess(this, p, "task", taskId, "viewer");
  }

  async getAccess(principalId: Id, objectType: "project"|"goal"|"task"|"actor"|"plan"|"note"|"schedule"|"alarm"|"label"|"repository", objectId: Id) {
    const r = await this.db.query<{access:"viewer"|"editor"|"owner"}>("SELECT access FROM access_grant WHERE principal_id=$1 AND object_type=$2 AND object_id=$3", [principalId, objectType, objectId]);
    return r.rows[0]?.access ?? null;
  }

  async createActor(p: PrincipalContext, i: Pick<Actor,"type"|"name"|"description"|"metadata">): Promise<Actor> { return this.createOwned(p,"actor",`INSERT INTO actor (type,name,description,metadata,created_by_principal_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,[i.type,i.name,i.description??null,i.metadata??{}],actor); }
  async getActor(p:PrincipalContext,id:Id):Promise<Actor|null>{await requireAccess(this,p,"actor",id,"viewer");const r=await this.db.query("SELECT * FROM actor WHERE id=$1",[id]);return r.rows[0]?actor(r.rows[0]):null;}
  async listActors(p:PrincipalContext):Promise<Actor[]>{const r=await this.db.query("SELECT o.* FROM actor o JOIN access_grant a ON a.object_id=o.id WHERE a.principal_id=$1 AND a.object_type='actor' ORDER BY o.created_at DESC",[p.principalId]);return r.rows.map(actor);}
  async updateActor(p:PrincipalContext,id:Id,i:Partial<Pick<Actor,"type"|"name"|"description"|"metadata">>):Promise<Actor>{await requireAccess(this,p,"actor",id,"editor");const r=await this.db.query("UPDATE actor SET type=COALESCE($2,type),name=COALESCE($3,name),description=CASE WHEN $4::text IS NULL THEN description ELSE $4 END,metadata=COALESCE($5,metadata),updated_at=now() WHERE id=$1 RETURNING *",[id,i.type??null,i.name??null,i.description??null,i.metadata??null]);if(!r.rows[0])throw new Error("Actor disappeared during update");return actor(r.rows[0]);}
  async deleteActor(p:PrincipalContext,id:Id):Promise<void>{await requireAccess(this,p,"actor",id,"owner");const r=await this.db.query("DELETE FROM actor WHERE id=$1",[id]);if(r.rowCount!==1)throw new Error("Actor disappeared during delete");}

  async createPlan(p:PrincipalContext,i:Pick<Plan,"title"|"markdown">):Promise<Plan>{return this.createOwned(p,"plan",`INSERT INTO plan (title,markdown,created_by_principal_id) VALUES ($1,$2,$3) RETURNING *`,[i.title,i.markdown],plan);}
  async getPlan(p:PrincipalContext,id:Id):Promise<Plan|null>{await requireAccess(this,p,"plan",id,"viewer");const r=await this.db.query("SELECT * FROM plan WHERE id=$1",[id]);return r.rows[0]?plan(r.rows[0]):null;}
  async listPlans(p:PrincipalContext):Promise<Plan[]>{const r=await this.db.query("SELECT o.* FROM plan o JOIN access_grant a ON a.object_id=o.id WHERE a.principal_id=$1 AND a.object_type='plan' ORDER BY o.created_at DESC",[p.principalId]);return r.rows.map(plan);}
  async updatePlan(p:PrincipalContext,id:Id,i:Partial<Pick<Plan,"title"|"markdown">>):Promise<Plan>{await requireAccess(this,p,"plan",id,"editor");const r=await this.db.query("UPDATE plan SET title=COALESCE($2,title),markdown=COALESCE($3,markdown),updated_at=now() WHERE id=$1 RETURNING *",[id,i.title??null,i.markdown??null]);if(!r.rows[0])throw new Error("Plan disappeared during update");return plan(r.rows[0]);}
  async deletePlan(p:PrincipalContext,id:Id):Promise<void>{await requireAccess(this,p,"plan",id,"owner");const r=await this.db.query("DELETE FROM plan WHERE id=$1",[id]);if(r.rowCount!==1)throw new Error("Plan disappeared during delete");}

  async createLabel(p:PrincipalContext,i:Pick<Label,"name"|"description">):Promise<Label>{return this.createOwned(p,"label",`INSERT INTO label (name,description,created_by_principal_id) VALUES ($1,$2,$3) RETURNING *`,[i.name,i.description??null],label);}
  async getLabel(p:PrincipalContext,id:Id):Promise<Label|null>{await requireAccess(this,p,"label",id,"viewer");const r=await this.db.query("SELECT * FROM label WHERE id=$1",[id]);return r.rows[0]?label(r.rows[0]):null;}
  async listLabels(p:PrincipalContext):Promise<Label[]>{const r=await this.db.query("SELECT o.* FROM label o JOIN access_grant a ON a.object_id=o.id WHERE a.principal_id=$1 AND a.object_type='label' ORDER BY o.name",[p.principalId]);return r.rows.map(label);}
  async updateLabel(p:PrincipalContext,id:Id,i:Partial<Pick<Label,"name"|"description">>):Promise<Label>{await requireAccess(this,p,"label",id,"editor");const r=await this.db.query("UPDATE label SET name=COALESCE($2,name),description=COALESCE($3,description),updated_at=now() WHERE id=$1 RETURNING *",[id,i.name??null,i.description??null]);if(!r.rows[0])throw new Error("Label disappeared during update");return label(r.rows[0]);}
  async deleteLabel(p:PrincipalContext,id:Id):Promise<void>{await requireAccess(this,p,"label",id,"owner");const r=await this.db.query("DELETE FROM label WHERE id=$1",[id]);if(r.rowCount!==1)throw new Error("Label disappeared during delete");}

  async createRepository(p:PrincipalContext,i:Pick<Repository,"provider"|"externalId"|"owner"|"name"|"url"|"metadata">):Promise<Repository>{return this.createOwned(p,"repository",`INSERT INTO repository (provider,external_id,owner,name,url,metadata,created_by_principal_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[i.provider,i.externalId,i.owner,i.name,i.url,i.metadata??{}],repository);}
  async getRepository(p:PrincipalContext,id:Id):Promise<Repository|null>{await requireAccess(this,p,"repository",id,"viewer");const r=await this.db.query("SELECT * FROM repository WHERE id=$1",[id]);return r.rows[0]?repository(r.rows[0]):null;}
  async listRepositories(p:PrincipalContext):Promise<Repository[]>{const r=await this.db.query("SELECT o.* FROM repository o JOIN access_grant a ON a.object_id=o.id WHERE a.principal_id=$1 AND a.object_type='repository' ORDER BY o.created_at DESC",[p.principalId]);return r.rows.map(repository);}
  async updateRepository(p:PrincipalContext,id:Id,i:Partial<Pick<Repository,"owner"|"name"|"url"|"metadata">>):Promise<Repository>{await requireAccess(this,p,"repository",id,"editor");const r=await this.db.query("UPDATE repository SET owner=COALESCE($2,owner),name=COALESCE($3,name),url=COALESCE($4,url),metadata=COALESCE($5,metadata),updated_at=now() WHERE id=$1 RETURNING *",[id,i.owner??null,i.name??null,i.url??null,i.metadata??null]);if(!r.rows[0])throw new Error("Repository disappeared during update");return repository(r.rows[0]);}
  async deleteRepository(p:PrincipalContext,id:Id):Promise<void>{await requireAccess(this,p,"repository",id,"owner");const r=await this.db.query("DELETE FROM repository WHERE id=$1",[id]);if(r.rowCount!==1)throw new Error("Repository disappeared during delete");}

  async createSchedule(p:PrincipalContext,i:{title:string;startAt:string;endAt?:string;recurrence?:string;timezone?:string;projectId?:Id;goalId?:Id;taskId?:Id}):Promise<Schedule>{await this.targetAccess(p,i.projectId,i.goalId,i.taskId);return this.createOwned(p,"schedule",`INSERT INTO schedule (project_id,goal_id,task_id,title,start_at,end_at,recurrence,timezone,created_by_principal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[i.projectId??null,i.goalId??null,i.taskId??null,i.title,i.startAt,i.endAt??null,i.recurrence??null,i.timezone??null],schedule);}
  async getSchedule(p:PrincipalContext,id:Id):Promise<Schedule|null>{await requireAccess(this,p,"schedule",id,"viewer");const r=await this.db.query("SELECT * FROM schedule WHERE id=$1",[id]);return r.rows[0]?schedule(r.rows[0]):null;}
  async listSchedules(p:PrincipalContext):Promise<Schedule[]>{const r=await this.db.query("SELECT o.* FROM schedule o JOIN access_grant a ON a.object_id=o.id WHERE a.principal_id=$1 AND a.object_type='schedule' ORDER BY o.start_at",[p.principalId]);return r.rows.map(schedule);}
  async updateSchedule(p:PrincipalContext,id:Id,i:Partial<{title:string;startAt:string;endAt:string;recurrence:string;timezone:string;projectId:Id;goalId:Id;taskId:Id}>):Promise<Schedule>{await requireAccess(this,p,"schedule",id,"editor");await this.targetAccess(p,i.projectId,i.goalId,i.taskId);const r=await this.db.query("UPDATE schedule SET title=COALESCE($2,title),start_at=COALESCE($3,start_at),end_at=COALESCE($4,end_at),recurrence=COALESCE($5,recurrence),timezone=COALESCE($6,timezone),project_id=COALESCE($7,project_id),goal_id=COALESCE($8,goal_id),task_id=COALESCE($9,task_id),updated_at=now() WHERE id=$1 RETURNING *",[id,i.title??null,i.startAt??null,i.endAt??null,i.recurrence??null,i.timezone??null,i.projectId??null,i.goalId??null,i.taskId??null]);if(!r.rows[0])throw new Error("Schedule disappeared during update");return schedule(r.rows[0]);}
  async deleteSchedule(p:PrincipalContext,id:Id):Promise<void>{await requireAccess(this,p,"schedule",id,"owner");const r=await this.db.query("DELETE FROM schedule WHERE id=$1",[id]);if(r.rowCount!==1)throw new Error("Schedule disappeared during delete");}

  async createAlarm(p:PrincipalContext,i:{title:string;triggerAt:string;recurrence?:string;timezone?:string;projectId?:Id;goalId?:Id;taskId?:Id}):Promise<Alarm>{await this.targetAccess(p,i.projectId,i.goalId,i.taskId);return this.createOwned(p,"alarm",`INSERT INTO alarm (project_id,goal_id,task_id,title,trigger_at,recurrence,timezone,created_by_principal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[i.projectId??null,i.goalId??null,i.taskId??null,i.title,i.triggerAt,i.recurrence??null,i.timezone??null],alarm);}
  async getAlarm(p:PrincipalContext,id:Id):Promise<Alarm|null>{await requireAccess(this,p,"alarm",id,"viewer");const r=await this.db.query("SELECT * FROM alarm WHERE id=$1",[id]);return r.rows[0]?alarm(r.rows[0]):null;}
  async listAlarms(p:PrincipalContext):Promise<Alarm[]>{const r=await this.db.query("SELECT o.* FROM alarm o JOIN access_grant a ON a.object_id=o.id WHERE a.principal_id=$1 AND a.object_type='alarm' ORDER BY o.trigger_at",[p.principalId]);return r.rows.map(alarm);}
  async updateAlarm(p:PrincipalContext,id:Id,i:Partial<{title:string;triggerAt:string;recurrence:string;timezone:string;projectId:Id;goalId:Id;taskId:Id}>):Promise<Alarm>{await requireAccess(this,p,"alarm",id,"editor");await this.targetAccess(p,i.projectId,i.goalId,i.taskId);const r=await this.db.query("UPDATE alarm SET title=COALESCE($2,title),trigger_at=COALESCE($3,trigger_at),recurrence=COALESCE($4,recurrence),timezone=COALESCE($5,timezone),project_id=COALESCE($6,project_id),goal_id=COALESCE($7,goal_id),task_id=COALESCE($8,task_id),updated_at=now() WHERE id=$1 RETURNING *",[id,i.title??null,i.triggerAt??null,i.recurrence??null,i.timezone??null,i.projectId??null,i.goalId??null,i.taskId??null]);if(!r.rows[0])throw new Error("Alarm disappeared during update");return alarm(r.rows[0]);}
  async dismissAlarm(p:PrincipalContext,id:Id):Promise<Alarm>{await requireAccess(this,p,"alarm",id,"editor");const r=await this.db.query("UPDATE alarm SET dismissed_at=now(),updated_at=now() WHERE id=$1 RETURNING *",[id]);if(!r.rows[0])throw new Error("Alarm disappeared during dismiss");return alarm(r.rows[0]);}
  async deleteAlarm(p:PrincipalContext,id:Id):Promise<void>{await requireAccess(this,p,"alarm",id,"owner");const r=await this.db.query("DELETE FROM alarm WHERE id=$1",[id]);if(r.rowCount!==1)throw new Error("Alarm disappeared during delete");}
}

const actor=(r:any):Actor=>({id:r.id,type:r.type,name:r.name,...(r.description!==null?{description:r.description}:{}),metadata:r.metadata,createdByPrincipalId:r.created_by_principal_id,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
const plan=(r:any):Plan=>({id:r.id,title:r.title,markdown:r.markdown,createdByPrincipalId:r.created_by_principal_id,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
const label=(r:any):Label=>({id:r.id,name:r.name,...(r.description!==null?{description:r.description}:{}),createdByPrincipalId:r.created_by_principal_id,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
const repository=(r:any):Repository=>({id:r.id,provider:r.provider,externalId:r.external_id,owner:r.owner,name:r.name,url:r.url,metadata:r.metadata,createdByPrincipalId:r.created_by_principal_id,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
const target=(r:any):any=>r.project_id?{type:"project",id:r.project_id}:r.goal_id?{type:"goal",id:r.goal_id}:r.task_id?{type:"task",id:r.task_id}:undefined;
const schedule=(r:any):Schedule=>({id:r.id,...(target(r)?{target:target(r)}:{}),title:r.title,startAt:r.start_at.toISOString(),...(r.end_at?{endAt:r.end_at.toISOString()}:{}),...(r.recurrence?{recurrence:r.recurrence}:{}),...(r.timezone?{timezone:r.timezone}:{}),createdByPrincipalId:r.created_by_principal_id,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
const alarm=(r:any):Alarm=>({id:r.id,...(target(r)?{target:target(r)}:{}),title:r.title,triggerAt:r.trigger_at.toISOString(),...(r.recurrence?{recurrence:r.recurrence}:{}),...(r.timezone?{timezone:r.timezone}:{}),...(r.dismissed_at?{dismissedAt:r.dismissed_at.toISOString()}:{}),createdByPrincipalId:r.created_by_principal_id,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
