import redis from "redis";

class RedisClient {
  constructor() {
    const redisConfig = process.env.REDIS_URL
      ? {
          url: process.env.REDIS_URL,
          socket: {
            tls: process.env.NODE_ENV === "production",
            rejectUnauthorized: false,
          },
        }
      : {};

    this.client = redis.createClient(redisConfig);

    this.client.on("error", (err) => {
      console.error(`✗ Redis client error: ${err}`);
    });

    this.client.on("connect", () => {
      console.log("✓ Connected to Redis");
    });

    this.client.on("ready", () => {
      console.log("✓ Redis client ready");
    });

    this.client.on("reconnecting", () => {
      console.log("⟳ Redis client reconnecting...");
    });

    // Connect to Redis
    this.client.connect().catch((err) => {
      console.error("✗ Failed to connect to Redis:", err);
    });
  }

  /**
   * Checks if Redis client is alive
   * @returns {boolean}
   */
  isAlive() {
    return this.client.isOpen;
  }

  /**
   * Gets the value associated with a key from Redis
   * @param {string} key
   * @returns {Promise<string | null>}
   */
  async get(key) {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error(`Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Sets a key-value pair in Redis with expiration
   * @param {string} key
   * @param {string} value
   * @param {number} duration
   * @returns {Promise<void>}
   */
  async set(key, value, duration) {
    try {
      return await this.client.setEx(key, duration, value);
    } catch (error) {
      console.error(`Error setting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Deletes a key-value pair from Redis
   * @param {string} key
   * @returns {Promise<void>}
   */
  async del(key) {
    try {
      return await this.client.del(key);
    } catch (error) {
      console.error(`Error deleting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Close the Redis connection
   */
  async disconnect() {
    try {
      await this.client.quit();
      console.log("✓ Redis connection closed");
    } catch (error) {
      console.error("✗ Error closing Redis connection:", error);
    }
  }
}

export default RedisClient;
