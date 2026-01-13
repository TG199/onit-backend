import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import redisClient from "../utils/redis.js";
import dbClient from "../utils/db.js";

const SALT_ROUNDS = 10;
const SESSION_TTL = 60 * 60 * 24; // 24 hours in seconds

/**
 * POST /auth/register
 */
export async function register(req, res) {
  const { email, phone, password, location } = req.body;

  if (!email || !phone || !password) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const result = await dbClient.query(
      `
      INSERT INTO users (id, email, phone, password_hash, location)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, role
      `,
      [uuidv4(), email, phone, passwordHash, location || null]
    );

    return res.status(201).json({
      message: "User registered successfully",
      user: result.rows[0],
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Email or phone already exists" });
    }

    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /auth/login
 */
export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  try {
    const result = await dbClient.query(
      `
      SELECT id, password_hash, role, is_blocked FROM users WHERE email = $1
      `,
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.is_blocked) {
      return res.status(403).json({ error: "Account is blocked" });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = uuidv4();
    await redisClient.set(`auth_${token}`, user.id, SESSION_TTL);

    return res.status(200).json({
      token,
      role: user.role,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /auth/logout
 */
export async function logout(req, res) {
  const token = req.headers["x-token"];
  if (token) {
    await redisClient.del(`auth_${token}`);
  }

  return res.status(204).end();
}
