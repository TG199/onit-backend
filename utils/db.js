import pkg from "pg";
const { Pool } = pkg;

/**
 * Represents a Postgres client for interacting with the database.
 */
class DBClient {
  constructor(config = {}) {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false,
        },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    } else {
      this.pool = new Pool({
        host: config.host || process.env.DB_HOST,
        port: Number(config.port || process.env.DB_PORT),
        database: config.database || process.env.DB_NAME,
        user: config.user || process.env.DB_USER,
        password: config.password || process.env.DB_PASSWORD,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    }

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
      throw error;
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
   * @param {Function} callback
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
