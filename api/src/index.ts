import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { router } from "./routes.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", router);

// Basic error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: "server_error" });
});

app.listen(config.port, () => {
  console.log(`[api] listening on http://localhost:${config.port}`);
});
