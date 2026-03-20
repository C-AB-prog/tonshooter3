import { Request, Response, NextFunction } from "express";
import { verifyJwt } from "./jwt.js";

export type AuthedRequest = Request & { auth: { uid: string; tgUserId: bigint } };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const [, token] = header.split(" ");
  if (!token) return res.status(401).json({ error: "unauthorized" });

  try {
    const p = verifyJwt(token);
    (req as AuthedRequest).auth = { uid: p.uid, tgUserId: BigInt(p.tg) };
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}
