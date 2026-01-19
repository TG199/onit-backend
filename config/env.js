import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV !== "production") {
  dotenv.config({
    path: path.join(__dirname, "../.env"),
  });
}

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(5000),

  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().min(1).optional(),

  REDIS_URL: z.string().optional(),
});

const env = EnvSchema.parse(process.env);

if (env.NODE_ENV === "production") {
  if (
    !env.DATABASE_URL &&
    (!env.DB_HOST ||
      !env.DB_PORT ||
      !env.DB_NAME ||
      !env.DB_USER ||
      !env.DB_PASSWORD)
  ) {
    throw new Error(
      "Production requires either DATABASE_URL or all individual database credentials (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)",
    );
  }
} else {
  const required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
}
export default env;
