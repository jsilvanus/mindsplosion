import type { Db } from "./pool.js";
import type { PrincipalContext } from "../domain/authorization.js";
import { requireAccess } from "../domain/authorization.js";
import type { GoalActorRole, Id, Relationship, RelationshipType } from "../domain/model.js";

export class GraphCrud {
  constructor(private readonly db: Db) {}

  async addGoalToProject(p:PrincipalContext,projectId:Id,goalId:Id):Promise<void>{
    await requireAccess(this,p,"project",projectId,"editor");
    await requireAccess(this,p,"goal",goalId,"viewer");
    await this.db.query("INSERT INTO project_goal(project_id,goal_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[projectId,goalId]);
  }
  async removeGoalFromProject(p:PrincipalContext,projectId:Id,goalId:Id):Promise<void>{
    await requireAccess(this,p,"project",projectId,"editor");
    await requireAccess(this,p,"goal",goalId,"viewer");
    await this.db.query("DELETE FROM project_goal WHERE project_id=$1 AND goal_id=$2",[projectId,goalId]);
  }
  async setGoalActorRole(p:PrincipalContext,goalId:Id,actorId:Id,role:GoalActorRole):Promise<void>{
    await requireAccess(this,p,"goal",goalId,"editor");
    await requireAccess(this,p,"actor",actorId,"viewer");
    await this.db.query("INSERT INTO goal_actor(goal_id,actor_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[goalId,actorId,role]);
  }
  async removeGoalActorRole(p:PrincipalContext,goalId:Id,actorId:Id,role:GoalActorRole):Promise<void>{
    await requireAccess(this,p,"goal",goalId,"editor");
    await requireAccess(this,p,"actor",actorId,"viewer");
    await this.db.query("DELETE FROM goal_actor WHERE goal_id=$1 AND actor_id=$2 AND role=$3",[goalId,actorId,role]);
  }
  async assignTask(p:PrincipalContext,taskId:Id,actorId:Id):Promise<void>{
    await requireAccess(this,p,"task",taskId,"editor");
    await requireAccess(this,p,"actor",actorId,"viewer");
    await this.db.query("INSERT INTO task_assignee(task_id,actor_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[taskId,actorId]);
  }
  async unassignTask(p:PrincipalContext,taskId:Id,actorId:Id):Promise<void>{
    await requireAccess(this,p,"task",taskId,"editor");
    await requireAccess(this,p,"actor",actorId,"viewer");
    await this.db.query("DELETE FROM task_assignee WHERE task_id=$1 AND actor_id=$2",[taskId,actorId]);
  }
  async addRelationship(p:PrincipalContext,input:{sourceType:"project"|"goal";sourceId:Id;targetType:"project"|"goal";targetId:Id;type:RelationshipType;description?:string;metadata?:Record<string,unknown>}):Promise<Relationship>{
    await requireAccess(this,p,input.sourceType,input.sourceId,"editor");
    await requireAccess(this,p,input.targetType,input.targetId,"viewer");
    const r=await this.db.query<any>(`INSERT INTO relationship(source_type,source_id,target_type,target_id,type,description,metadata,created_by_principal_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(source_type,source_id,target_type,target_id,type) DO UPDATE SET description=EXCLUDED.description,metadata=EXCLUDED.metadata,updated_at=now() RETURNING *`,[input.sourceType,input.sourceId,input.targetType,input.targetId,input.type,input.description??null,input.metadata??{},p.principalId]);
    return relationship(r.rows[0]);
  }
  async getRelationship(p:PrincipalContext,id:Id):Promise<Relationship|null>{const r=await this.db.query<any>("SELECT * FROM relationship WHERE id=$1",[id]);if(!r.rows[0])return null;const row=r.rows[0];await requireAccess(this,p,row.source_type,row.source_id,"viewer");await requireAccess(this,p,row.target_type,row.target_id,"viewer");return relationship(row);}
  async deleteRelationship(p:PrincipalContext,id:Id):Promise<void>{const r=await this.db.query<any>("SELECT * FROM relationship WHERE id=$1",[id]);if(!r.rows[0])return;await requireAccess(this,p,r.rows[0].source_type,r.rows[0].source_id,"editor");await this.db.query("DELETE FROM relationship WHERE id=$1",[id]);}
  async linkRepository(p:PrincipalContext,projectId:Id,repositoryId:Id,path?:string):Promise<void>{await requireAccess(this,p,"project",projectId,"editor");await requireAccess(this,p,"repository",repositoryId,"viewer");await this.db.query("INSERT INTO project_repository(project_id,repository_id,path) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[projectId,repositoryId,path??null]);}
  async unlinkRepository(p:PrincipalContext,projectId:Id,repositoryId:Id,path?:string):Promise<void>{await requireAccess(this,p,"project",projectId,"editor");await requireAccess(this,p,"repository",repositoryId,"viewer");await this.db.query("DELETE FROM project_repository WHERE project_id=$1 AND repository_id=$2 AND path IS NOT DISTINCT FROM $3",[projectId,repositoryId,path??null]);}
  async label(p:PrincipalContext,objectType:"project"|"goal"|"task"|"plan"|"note",objectId:Id,labelId:Id):Promise<void>{await requireAccess(this,p,objectType,objectId,"editor");await requireAccess(this,p,"label",labelId,"viewer");await this.db.query(`INSERT INTO ${objectType}_label(${objectType}_id,label_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[objectId,labelId]);}
  async unlabel(p:PrincipalContext,objectType:"project"|"goal"|"task"|"plan"|"note",objectId:Id,labelId:Id):Promise<void>{await requireAccess(this,p,objectType,objectId,"editor");await requireAccess(this,p,"label",labelId,"viewer");await this.db.query(`DELETE FROM ${objectType}_label WHERE ${objectType}_id=$1 AND label_id=$2`,[objectId,labelId]);}
}

const relationship=(r:any):Relationship=>({id:r.id,source:{type:r.source_type,id:r.source_id},target:{type:r.target_type,id:r.target_id},type:r.type,...(r.description!==null?{description:r.description}:{}),metadata:r.metadata,createdByPrincipalId:r.created_by_principal_id,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
