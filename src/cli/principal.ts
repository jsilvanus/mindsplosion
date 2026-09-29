import { initializeDatabase } from "../db/pool.js";
import { PrincipalsRepository } from "../db/principals-repository.js";

// Small admin CLI for principals (the identities that own Mindsplosion data).
//   pnpm principal list
//   pnpm principal create <external-subject> [email]
//   pnpm principal set-email <id|external-subject> <email|->
//   pnpm principal disable <id|external-subject>
//   pnpm principal enable <id|external-subject>
// An OIDC sign-in whose verified email matches a principal's email is linked to that principal.

const usage = "Usage: principal list | create <external-subject> [email] | set-email <id|external-subject> <email|-> | disable <id|external-subject> | enable <id|external-subject>";

async function main() {
  const [command, arg1, arg2] = process.argv.slice(2);
  const principals = new PrincipalsRepository(await initializeDatabase());

  const find = async (key: string | undefined) => {
    if (!key) throw new Error(usage);
    const principal = (await principals.findByExternalSubject(key))
      // Only id-shaped keys are looked up by id (PostgreSQL rejects non-uuid input for uuid columns).
      ?? (/^[0-9a-f-]{32,36}$/i.test(key) ? await principals.findById(key) : null);
    if (!principal) throw new Error(`No principal with id or external subject "${key}"`);
    return principal;
  };

  switch (command) {
    case "list":
      for (const p of await principals.list()) {
        console.log([p.id, p.type, p.externalSubject, p.email ?? "-", p.disabledAt ? `disabled ${p.disabledAt}` : "active"].join("\t"));
      }
      break;
    case "create": {
      if (!arg1) throw new Error(usage);
      const created = await principals.create(arg1, "user", arg2);
      console.log(created.id);
      break;
    }
    case "set-email": {
      if (!arg2) throw new Error(usage);
      await principals.setEmail((await find(arg1)).id, arg2 === "-" ? null : arg2);
      break;
    }
    case "disable":
    case "enable":
      await principals.setDisabled((await find(arg1)).id, command === "disable");
      break;
    default:
      throw new Error(usage);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
