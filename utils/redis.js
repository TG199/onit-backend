import redis from "redis";

class RedisClient {
  constructor() {
    // const isProduction = process.env.NODE_ENV === "production";

    // Support both REDIS_URL (production) and default localhost (development)
    const redisConfig = process.env.REDIS_URL
      ? {
          url: process.env.REDIS_URL,
          socket: {
            tls: false, // Only use TLS in production
            rejectUnauthorized: false,
          },
        }
      : {}; // Default to localhost in development (no TLS)

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
   * @returns {boolean} True if Redis client is connected, false otherwise
   */
  isAlive() {
    return this.client.isOpen;
  }

  /**
   * Gets the value associated with a key from Redis
   * @param {string} key - The Redis key
   * @returns {Promise<string | null>} The value for the key or null if the key doesn't exist
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
   * @param {string} key - The Redis key
   * @param {string} value - The value to store
   * @param {number} duration - The expiration duration in seconds
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
   * @param {string} key - The Redis key to delete
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
