import { Env } from "./types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function requireAdmin(request: Request, env: Env): Response | null {
  if (!env.LOCK_KEY) return null;
  if (request.headers.get("Authorization") !== `Bearer ${env.LOCK_KEY}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

interface ConversationRow {
  id: string;
  subject: string | null;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_key: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender: string;
  body: string;
  created_at: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // ---- Public widget API ----
    if (path === "/api/conversations" && request.method === "POST") {
      let body: unknown = null;
      try { body = await request.json(); } catch { /* fallthrough */ }
      if (!body || typeof body !== "object") return json({ error: "Bad JSON" }, 400);
      const b = body as Record<string, unknown>;
      const text = cleanStr(b.body, 4000);
      if (!text) return json({ error: "Missing body" }, 400);
      const now = new Date().toISOString();
      const id = uid("conv");
      const key = (typeof b.key === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(b.key))
        ? b.key : uid("vst").slice(5);
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO conversations (id, subject, visitor_name, visitor_email, visitor_key, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
        ).bind(id, cleanStr(b.subject, 200), cleanStr(b.name, 100), cleanStr(b.email, 200), key, now, now),
        env.DB.prepare(
          `INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES (?, ?, 'visitor', ?, ?)`
        ).bind(uid("msg"), id, text, now),
      ]);
      return json({ id, key });
    }

    const convMsg = path.match(/^\/api\/conversations\/([A-Za-z0-9_-]+)(\/messages)?$/);
    if (convMsg) {
      const id = convMsg[1];
      const conv = await env.DB.prepare("SELECT * FROM conversations WHERE id = ?")
        .bind(id).first<ConversationRow>();
      if (!conv) return json({ error: "Not found" }, 404);
      const key = url.searchParams.get("key") || "";
      if (request.method === "GET" && !convMsg[2]) {
        if (key !== conv.visitor_key) return json({ error: "Forbidden" }, 403);
        const { results } = await env.DB.prepare(
          "SELECT id, sender, body, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
        ).bind(id).all<MessageRow>();
        return json({ conversation: { ...conv, visitor_key: undefined }, messages: results });
      }
      if (request.method === "POST" && convMsg[2]) {
        let raw: unknown = null;
        try { raw = await request.json(); } catch { /* fallthrough */ }
        const rb = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
        if (rb.key !== conv.visitor_key) return json({ error: "Forbidden" }, 403);
        const text = cleanStr(rb.body, 4000);
        if (!text) return json({ error: "Missing body" }, 400);
        if (conv.status !== "open") return json({ error: "Conversation closed" }, 400);
        const now = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES (?, ?, 'visitor', ?, ?)`
          ).bind(uid("msg"), id, text, now),
          env.DB.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").bind(now, id),
        ]);
        return json({ success: true });
      }
    }

    // ---- Admin API (LOCK_KEY) ----
    if (path.startsWith("/api/admin/")) {
      const denied = requireAdmin(request, env);
      if (denied) return denied;
      const now = new Date().toISOString();

      if (path === "/api/admin/conversations" && request.method === "GET") {
        const status = url.searchParams.get("status");
        const q = status
          ? env.DB.prepare("SELECT * FROM conversations WHERE status = ? ORDER BY updated_at DESC").bind(status)
          : env.DB.prepare("SELECT * FROM conversations ORDER BY updated_at DESC");
        const { results } = await q.all<ConversationRow>();
        return json(results);
      }

      const adminConv = path.match(/^\/api\/admin\/conversations\/([A-Za-z0-9_-]+)(\/(reply|close|reopen))?$/);
      if (adminConv && request.method === "GET" && !adminConv[2]) {
        const conv = await env.DB.prepare("SELECT * FROM conversations WHERE id = ?")
          .bind(adminConv[1]).first<ConversationRow>();
        if (!conv) return json({ error: "Not found" }, 404);
        const { results } = await env.DB.prepare(
          "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
        ).bind(adminConv[1]).all<MessageRow>();
        return json({ conversation: conv, messages: results });
      }
      if (adminConv && request.method === "POST" && adminConv[2] === "/reply") {
        let raw: unknown = null;
        try { raw = await request.json(); } catch { /* fallthrough */ }
        const rb = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
        const text = cleanStr(rb.body, 4000);
        if (!text) return json({ error: "Missing body" }, 400);
        const conv = await env.DB.prepare("SELECT * FROM conversations WHERE id = ?")
          .bind(adminConv[1]).first<ConversationRow>();
        if (!conv) return json({ error: "Not found" }, 404);
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES (?, ?, 'agent', ?, ?)`
          ).bind(uid("msg"), adminConv[1], text, now),
          env.DB.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").bind(now, adminConv[1]),
        ]);
        if (conv.visitor_email) {
          await env.EMAIL.send({
            to: conv.visitor_email,
            from: "support@minntelligence.fyi",
            subject: `Re: ${conv.subject || "your support request"}`,
            text: `${text}\n\n— Amin, minntelligence`,
          }).catch(() => {});
        }
        return json({ success: true });
      }
      if (adminConv && request.method === "POST" && (adminConv[2] === "/close" || adminConv[2] === "/reopen")) {
        const status = adminConv[2] === "/close" ? "closed" : "open";
        await env.DB.prepare("UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?")
          .bind(status, now, adminConv[1]).run();
        return json({ success: true, status });
      }
      return json({ error: "Endpoint not found" }, 404);
    }

    if (path.startsWith("/api/")) return json({ error: "Endpoint not found" }, 404);

    // Static admin UI + widget script.
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    return await env.ASSETS.fetch(new Request(new URL("/", request.url)));
  },

  // Inbound email -> conversation. Match sender to latest open conversation
  // from that address, else open a new one.
  async email(message: unknown, env: Env): Promise<void> {
    const msg = message as {
      from: string; to: string; headers: Headers; raw: ReadableStream; reply: (x: unknown) => Promise<void>;
      setReject?: (r: string) => void;
    };
    try {
      const from = msg.from || "";
      const emailMatch = from.match(/<([^>]+)>/) || [null, from];
      const senderEmail = (emailMatch[1] || "").trim().toLowerCase();
      const subject = msg.headers.get("subject") || "";
      const buf = await new Response(msg.raw).arrayBuffer();
      const rawText = new TextDecoder().decode(buf.slice(0, 200000));
      const parts = rawText.split(/\r?\n\r?\n/);
      const snippet = (parts[1] || rawText).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
      if (!snippet) return;
      const now = new Date().toISOString();
      const existing = senderEmail
        ? await env.DB.prepare(
            "SELECT * FROM conversations WHERE lower(visitor_email) = ? AND status = 'open' ORDER BY updated_at DESC LIMIT 1"
          ).bind(senderEmail).first<ConversationRow>()
        : null;
      const convId = existing?.id || uid("conv");
      const batch = [];
      if (!existing) {
        batch.push(env.DB.prepare(
          `INSERT INTO conversations (id, subject, visitor_name, visitor_email, visitor_key, status, created_at, updated_at)
           VALUES (?, ?, NULL, ?, ?, 'open', ?, ?)`
        ).bind(convId, subject.slice(0, 200) || null, senderEmail || null, uid("eml").slice(4), now, now));
      } else {
        batch.push(env.DB.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").bind(now, convId));
      }
      batch.push(env.DB.prepare(
        `INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES (?, ?, 'visitor', ?, ?)`
      ).bind(uid("msg"), convId, snippet, now));
      await env.DB.batch(batch);
      // Dual delivery: inbox keeps it, Gmail gets a copy (one action per
      // Email Routing rule, so the worker forwards instead of a 2nd rule).
      if (env.FORWARD_TO) {
        await env.EMAIL.send({
          to: env.FORWARD_TO,
          from: "support@minntelligence.fyi",
          subject: `[support] ${subject.slice(0, 150) || "new message"} (from ${senderEmail || "web"})`,
          text: `From: ${from}\nConversation: ${convId}\n\n${snippet}`,
        }).catch(() => {});
      }
    } catch {
      // Never bounce on parse failures.
    }
  },
};
