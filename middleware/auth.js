import { dbClient, redisClient } from "../server.js";

export async function auth(req, res, next) {
  const token = req.headers["x-token"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const userId = await redisClient.get(`auth_${token}`);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const result = await dbClient.query(
    "SELECT id, role, is_blocked FROM users WHERE id = $1",
    [userId]
  );

  const user = result.rows[0];
  if (!user || user.is_blocked) {
    return res.status(403).json({ error: "Access denied" });
  }

  req.user = user;
  next();
}
