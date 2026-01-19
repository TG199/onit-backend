import pkg from "pg";
const { Pool } = pkg;

/**
 * Represents a Postgres client for interacting with the database.
 */
class DBClient {
  constructor(config = {}) {
    const isProduction = process.env.NODE_ENV === "production";

    // Support both DATABASE_URL (production) and individual credentials (development)
    if (process.env.DATABASE_URL) {
      // Production mode - use DATABASE_URL from Render
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction
          ? {
              rejectUnauthorized: false, // Required for Render's managed PostgreSQL
            }
          : false, // Disable SSL for local dev even with DATABASE_URL
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    } else {
      // Development mode - use individual credentials
      this.pool = new Pool({
        host: config.host || process.env.DB_HOST,
        port: Number(config.port || process.env.DB_PORT),
        database: config.database || process.env.DB_NAME,
        user: config.user || process.env.DB_USER,
        password: config.password || process.env.DB_PASSWORD,
        ssl: false, // No SSL for local development
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    }

    // Handle pool errors
    this.pool.on("error", (err) => {
      console.error("Unexpected error on idle client", err);
    });
  }

  /**
   * Connects to the Postgres database.
   */
  async connect() {
    try {
      const client = await this.pool.connect();
      console.log("✓ Connected to PostgreSQL database");
      client.release();
    } catch (error) {
      console.error("✗ Failed to connect to database:", error.message);
      throw error; // Throw instead of exit to allow proper error handling
    }
  }

  async disconnect() {
    try {
      await this.pool.end();
      console.log("✓ Database connection pool closed");
    } catch (error) {
      console.error("✗ Error closing database pool:", error.message);
    }
  }

  query(text, params) {
    return this.pool.query(text, params);
  }

  /**
   * Execute a database transaction
   * @param {Function} callback - Async function that receives the transaction client
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export default DBClient;
