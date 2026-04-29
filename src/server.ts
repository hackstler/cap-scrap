import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { ExecuteRequest } from "./types";
import { processRows } from "./worker";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/ejecutar", async (c) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${process.env.AUTH_TOKEN}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: ExecuteRequest;
  try {
    body = await c.req.json<ExecuteRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.rows || body.rows.length === 0) {
    return c.json({ error: "No rows to process" }, 400);
  }

  if (!body.config?.dni || !body.config?.gmail) {
    return c.json({ error: "Missing config (dni, gmail)" }, 400);
  }

  // Respond immediately, process in background
  processRows(body).catch((err) => {
    console.error("Worker failed:", err);
  });

  return c.json({
    status: "accepted",
    rowCount: body.rows.length,
    message: `Processing ${body.rows.length} rows in background`,
  });
});

const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`cap-scrap running on port ${port}`);
});
