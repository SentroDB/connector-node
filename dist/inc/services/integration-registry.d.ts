export declare class IntegrationRegistry {
    #private;
    static get instance(): IntegrationRegistry;
    private integrations;
    /**
     * Register an integration with a unique ID
     * @param id - Unique identifier for the integration
     * @param integration - The integration instance to register
     * @throws Error if ID is empty or integration already exists
     */
    register<T>(id: string, integration: T): void;
    /**
     * Retrieve an integration by ID
     * @param id - The integration ID
     * @returns The integration instance or undefined if not found
     */
    get<T>(id: string): T | undefined;
    /**
     * Check if an integration exists
     * @param id - The integration ID
     * @returns true if the integration exists, false otherwise
     */
    has(id: string): boolean;
    /**
     * Remove an integration by ID
     * @param id - The integration ID
     * @returns true if removed, false if not found
     */
    remove(id: string): boolean;
    /**
     * Clear all registered integrations
     * Useful for testing
     */
    clear(): void;
    /**
     * Get all registered integration IDs
     * @returns Array of all integration IDs
     */
    getAllIds(): string[];
}
//# sourceMappingURL=integration-registry.d.ts.map