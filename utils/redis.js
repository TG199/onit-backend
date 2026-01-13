import redis from "redis";

class RedisClient {
  constructor() {
    this.client = redis.createClient();
    this.client.connect();

    this.client.on("error", (err) => {
      console.error(`Redis client error: ${err}`);
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
    return this.client.get(key);
  }

  /**
   * Sets a key-value pair in Redis with expiration
   * @param {string} key - The Redis key
   * @param {string} value - The value to store
   * @param {number} duration - The expiration duration in seconds
   * @returns {Promise<void>}
   */
  async set(key, value, duration) {
    return this.client.setEx(key, duration, value);
  }

  /**
   * Deletes a key-value pair from Redis
   * @param {string} key - The Redis key to delete
   * @returns {Promise<void>}
   */
  async del(key) {
    return this.client.del(key);
  }
}

// Create and export an instance of RedisClient
export default RedisClient;
