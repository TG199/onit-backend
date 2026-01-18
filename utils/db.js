import pkg from "pg";
const { Pool } = pkg;

/**
 * Represents a Postgres client for interacting with the database.
 */
class DBClient {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
  }

  /**
   * Connects to the Postgres database.
   */
  async connect() {
    try {
      const client = await this.pool.connect();
      console.log("Connected to Pg database");
      client.release();
    } catch (error) {
      console.error("Failed to connect to database:", error.message);
      process.exit(1);
    }
  }

  async disconnect() {
    await this.pool.end();
  }

  query(text, params) {
    return this.pool.query(text, params);
  }
}

export default DBClient;
