import type { Db } from "./pool.js";
import type { Principal, PrincipalType, Id } from "../domain/model.js";

interface PrincipalRow {
  id: string;
  type: PrincipalType;
  external_subject: string;
  created_at: Date;
}

export class PrincipalsRepository {
  constructor(private readonly db: Db) {}

  async findByExternalSubject(externalSubject: string): Promise<Principal | null> {
    const result = await this.db.query<PrincipalRow>(
      "SELECT * FROM principal WHERE external_subject = $1",
      [externalSubject],
    );
    return result.rows[0] ? this.toPrincipal(result.rows[0]) : null;
  }

  async findById(id: Id): Promise<Principal | null> {
    const result = await this.db.query<PrincipalRow>(
      "SELECT * FROM principal WHERE id = $1",
      [id],
    );
    return result.rows[0] ? this.toPrincipal(result.rows[0]) : null;
  }

  async create(
    externalSubject: string,
    type: PrincipalType = "user",
  ): Promise<Principal> {
    const result = await this.db.query<PrincipalRow>(
      `INSERT INTO principal (type, external_subject)
       VALUES ($1, $2)
       RETURNING *`,
      [type, externalSubject],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Principal creation returned no row");
    return this.toPrincipal(row);
  }

  private toPrincipal(row: PrincipalRow): Principal {
    return {
      id: row.id,
      type: row.type,
      externalSubject: row.external_subject,
      createdAt: row.created_at.toISOString(),
    };
  }
}
