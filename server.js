import env from "./config/env.js";
import express from "express";
import router from "./routes/index.js";
import RedisClient from "./utils/redis.js";
import DBClient from "./utils/db.js";

const app = express();

app.set("trust proxy", 1);

const dbClient = new DBClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});
const redisClient = new RedisClient();

app.use(express.json({ limit: "50mb" }));

if (env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, x-token",
    );
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}

app.use("/", router);
app.get("/health", async (req, res) => {
  try {
    await dbClient.query("SELECT 1");
    const redisAlive = redisClient.isAlive();

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      database: "connected",
      redis: redisAlive ? "connected" : "disconnected",
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

app.get("/", (req, res) => {
  res.json({
    message: "ONIT API Server",
    version: "1.0.0",
    environment: env.NODE_ENV,
    endpoints: {
      health: "/health",
      auth: "/auth/*",
      user: "/api/user/*",
      admin: "/api/admin/*",
    },
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.path}`,
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);

  res.status(err.statusCode || 500).json({
    error: err.message || "Internal Server Error",
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    console.log("HTTP server closed");

    try {
      await dbClient.disconnect();
      await redisClient.disconnect();
      console.log("✓ All connections closed successfully");
      process.exit(0);
    } catch (error) {
      console.error("✗ Error during shutdown:", error);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("Force shutdown after timeout");
    process.exit(1);
  }, 10000);
};

let server;

async function startServer() {
  try {
    await dbClient.connect();
    console.log(`✓ Database connection established (${env.NODE_ENV})`);

    const PORT = env.PORT || 5000;
    server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${env.NODE_ENV}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
    });

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("✗ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

export { dbClient, redisClient };
