import type { Db } from "./pool.js";
import type { Principal, PrincipalType, Id } from "../domain/model.js";

interface PrincipalRow {
  id: string;
  type: PrincipalType;
  external_subject: string;
  email: string | null;
  disabled_at: Date | null;
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

  /** Case-insensitive email lookup. */
  async findByEmail(email: string): Promise<Principal | null> {
    const result = await this.db.query<PrincipalRow>(
      "SELECT * FROM principal WHERE lower(email) = lower($1)",
      [email],
    );
    return result.rows[0] ? this.toPrincipal(result.rows[0]) : null;
  }

  async list(): Promise<Principal[]> {
    const result = await this.db.query<PrincipalRow>(
      "SELECT * FROM principal ORDER BY created_at, id",
    );
    return result.rows.map((row) => this.toPrincipal(row));
  }

  async create(
    externalSubject: string,
    type: PrincipalType = "user",
    email?: string,
  ): Promise<Principal> {
    const result = await this.db.query<PrincipalRow>(
      `INSERT INTO principal (type, external_subject, email)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [type, externalSubject, email ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Principal creation returned no row");
    return this.toPrincipal(row);
  }

  async setEmail(id: Id, email: string | null): Promise<void> {
    await this.db.query("UPDATE principal SET email = $1 WHERE id = $2", [email, id]);
  }

  async setDisabled(id: Id, disabled: boolean): Promise<void> {
    await this.db.query(
      disabled
        ? "UPDATE principal SET disabled_at = now() WHERE id = $1 AND disabled_at IS NULL"
        : "UPDATE principal SET disabled_at = NULL WHERE id = $1",
      [id],
    );
  }

  private toPrincipal(row: PrincipalRow): Principal {
    return {
      id: row.id,
      type: row.type,
      externalSubject: row.external_subject,
      ...(row.email ? { email: row.email } : {}),
      ...(row.disabled_at ? { disabledAt: new Date(row.disabled_at).toISOString() } : {}),
      createdAt: row.created_at.toISOString(),
    };
  }
}
