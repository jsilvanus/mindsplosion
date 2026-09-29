import { initializeDatabase } from "../db/pool.js";
import { PrincipalsRepository } from "../db/principals-repository.js";
import { hashPassword } from "../http/password.js";
import { STDIO_PRINCIPAL_SUBJECT } from "../mcp/context.js";
import { loadDotEnv } from "../env.js";

// Small admin CLI for principals (the identities that own Mindsplosion data).
//   pnpm principal list
//   pnpm principal create <external-subject> [email]
//   pnpm principal set-email <id|external-subject> <email|->
//   pnpm principal disable <id|external-subject>
//   pnpm principal enable <id|external-subject>
//   pnpm principal set-password <id|external-subject>     (prompts, or reads one line from stdin)
//   pnpm principal clear-password <id|external-subject>
// An OIDC sign-in whose verified email matches a principal's email is linked to that principal.
// With a password, the principal can sign in on the built-in OAuth sign-in page with its email or
// external subject (JWT_SECRET set; see README).

const usage = "Usage: principal list | create <external-subject> [email] | set-email <id|external-subject> <email|-> | set-password <id|external-subject> | clear-password <id|external-subject> | disable <id|external-subject> | enable <id|external-subject>";

/** Reads a password without echo from a terminal, or the first line of piped stdin. */
async function readPassword(prompt: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    let data = "";
    for await (const chunk of stdin) data += chunk;
    return data.split(/\r?\n/)[0] ?? "";
  }
  process.stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          stdin.setRawMode(false);
          reject(new Error("Cancelled"));
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  loadDotEnv();
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
    case "set-password": {
      // The stdio principal is created on first use; create it here too, so a fresh
      // deployment can set its password before anything else has run.
      const principal = arg1 === STDIO_PRINCIPAL_SUBJECT
        ? (await principals.findByExternalSubject(arg1)) ?? (await principals.create(arg1))
        : await find(arg1);
      const password = await readPassword("New password: ");
      if (process.stdin.isTTY && (await readPassword("Repeat password: ")) !== password) throw new Error("The passwords do not match");
      await principals.setPasswordHash(principal.id, await hashPassword(password));
      console.log(`Password set for ${principal.email ?? principal.externalSubject}`);
      break;
    }
    case "clear-password":
      await principals.setPasswordHash((await find(arg1)).id, null);
      break;
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
