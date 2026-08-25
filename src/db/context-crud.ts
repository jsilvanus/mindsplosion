import type { Db } from "./pool.js";
import { requireAccess } from "../domain/authorization.js";
import type { PrincipalContext } from "../domain/authorization.js";
import type { Id } from "../domain/model.js";

export class ContextCrud {
  constructor(private readonly db: Db) {}

  async attachPlan(p:PrincipalContext,planId:Id,targetType:"project"|"goal"|"task",targetId:Id):Promise<void>{
    await requireAccess(this,p,"plan",planId,"editor");
    await requireAccess(this,p,targetType,targetId,"viewer");
    await this.db.query(`INSERT INTO plan_${targetType}(plan_id,${targetType}_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[planId,targetId]);
  }
  async detachPlan(p:PrincipalContext,planId:Id,targetType:"project"|"goal"|"task",targetId:Id):Promise<void>{
    await requireAccess(this,p,"plan",planId,"editor");
    await requireAccess(this,p,targetType,targetId,"viewer");
    await this.db.query(`DELETE FROM plan_${targetType} WHERE plan_id=$1 AND ${targetType}_id=$2`,[planId,targetId]);
  }
  async attachNote(p:PrincipalContext,noteId:Id,targetType:"project"|"goal"|"task",targetId:Id):Promise<void>{
    await requireAccess(this,p,"note",noteId,"editor");
    await requireAccess(this,p,targetType,targetId,"viewer");
    await this.db.query(`INSERT INTO note_${targetType}(note_id,${targetType}_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[noteId,targetId]);
  }
  async detachNote(p:PrincipalContext,noteId:Id,targetType:"project"|"goal"|"task",targetId:Id):Promise<void>{
    await requireAccess(this,p,"note",noteId,"editor");
    await requireAccess(this,p,targetType,targetId,"viewer");
    await this.db.query(`DELETE FROM note_${targetType} WHERE note_id=$1 AND ${targetType}_id=$2`,[noteId,targetId]);
  }
}
