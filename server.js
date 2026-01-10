import env from "./config/env.js";

import express from "express";
import router from "./routes/index.js";
import RedisClient from "./utils/redis.js";
import DBClient from "./utils/db.js";

console.log("ENV LOADED:", process.env.DB_USER);

const app = express();

const dbClient = new DBClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

await dbClient.connect();

const redisClient = new RedisClient();
app.use(express.json({ limit: "50mb" }));
app.use("/", router);
app.get("/health", async (_, res) => {
  try {
    await dbClient.query("SELECT 1");
    res.status(200).json({ status: "ok" });
  } catch {
    res.status(500).json({ status: "db down" });
  }
});

app.listen(env.PORT, () => {
  console.log(`Server running on ${env.PORT}`);
});

export { dbClient, redisClient };
