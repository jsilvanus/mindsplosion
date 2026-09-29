import type { FastifyReply } from "fastify";
import { contentSecurityPolicy } from "./oauth/csp.js";

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function page(title: string, body: string): string {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    escapeHtml(title) +
    "</title><style>body{font-family:system-ui,sans-serif;background:#f6f7f9;margin:0;padding:4rem 1rem}main{max-width:420px;margin:0 auto;background:#fff;padding:2rem;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.08)}h1{margin-top:0}label{display:block;margin-top:.8rem;font-weight:600}input{display:block;box-sizing:border-box;width:100%;margin-top:.3rem;padding:.6rem;border:1px solid #ccd;border-radius:7px;font:inherit}a.button,button{display:inline-block;margin-top:1rem;padding:.7rem 1.1rem;border:0;border-radius:7px;cursor:pointer;background:#2d5bd7;color:#fff;text-decoration:none;font:inherit}.secondary{margin-left:.5rem;background:#eee;color:#222}.error{color:#b00020}</style></head><body><main>" +
    body +
    "</main></body></html>";
}

export function errorPage(title: string, message: string): string {
  return page(title, `<h1>${escapeHtml(title)}</h1><p class="error">${escapeHtml(message)}</p><p>Return to your MCP client and connect again.</p>`);
}

/** HTML response with CSP; `formAction` lists extra form-action sources (see LEARNED notes in README). */
export function sendHtml(reply: FastifyReply, html: string, formAction: string[] = [], status = 200) {
  return reply
    .code(status)
    .header("Content-Security-Policy", contentSecurityPolicy(formAction))
    .header("Cache-Control", "no-store")
    .type("text/html; charset=utf-8")
    .send(html);
}
