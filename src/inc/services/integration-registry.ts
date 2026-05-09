export class IntegrationRegistry {
  static #instance: IntegrationRegistry;
  static get instance() {
    if (!this.#instance) this.#instance = new IntegrationRegistry();
    return this.#instance;
  }

  private integrations = new Map<string, unknown>();

  /**
   * Register an integration with a unique ID
   * @param id - Unique identifier for the integration
   * @param integration - The integration instance to register
   * @throws Error if ID is empty or integration already exists
   */
  register<T>(id: string, integration: T): void {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new Error('Integration ID must be a non-empty string');
    }

    if (integration === null || integration === undefined) {
      throw new Error('Integration cannot be null or undefined');
    }

    if (this.integrations.has(id)) {
      throw new Error(`Integration with ID "${id}" is already registered`);
    }

    this.integrations.set(id, integration);
  }

  /**
   * Retrieve an integration by ID
   * @param id - The integration ID
   * @returns The integration instance or undefined if not found
   */
  get<T>(id: string): T | undefined {
    return this.integrations.get(id) as T | undefined;
  }

  /**
   * Check if an integration exists
   * @param id - The integration ID
   * @returns true if the integration exists, false otherwise
   */
  has(id: string): boolean {
    return this.integrations.has(id);
  }

  /**
   * Remove an integration by ID
   * @param id - The integration ID
   * @returns true if removed, false if not found
   */
  remove(id: string): boolean {
    return this.integrations.delete(id);
  }

  /**
   * Clear all registered integrations
   * Useful for testing
   */
  clear(): void {
    this.integrations.clear();
  }

  /**
   * Get all registered integration IDs
   * @returns Array of all integration IDs
   */
  getAllIds(): string[] {
    return Array.from(this.integrations.keys());
  }
}
