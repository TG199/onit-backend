import pkg from "pg";
const { Pool } = pkg;

class DBClient {
  constructor() {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
    } else {
      this.pool = new Pool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      });
    }
  }

  async connect() {
    try {
      const client = await this.pool.connect();
      console.log("Connected to Pg database");
      client.release();
    } catch (error) {
      console.error("Failed to connect to database");
      console.error(error);
      process.exit(1);
    }
  }

  query(text, params) {
    return this.pool.query(text, params);
  }
}

export default DBClient;
