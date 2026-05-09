import { ModelCustomizer } from "../customizers/modelCustomizer";
import { DatabaseHandler } from "../types/db";
import { ConnectorConfig } from "../types/global";
import ServerMounter from "./serverMounter";
export default class Connector {
    serverMounter: ServerMounter;
    private hooks;
    private integrations;
    constructor(config: ConnectorConfig);
    customize: <T extends DBManagerSchema.TableName>(customizer: () => ModelCustomizer<T>) => this;
    /**
     * Register an integration with a unique ID
     * @param id - Unique identifier for the integration
     * @param integration - The integration instance to register
     * @returns this for method chaining
     */
    use<T>(id: string, integration: T): this;
    /**
     * Retrieve a registered integration by ID
     * @param id - The integration ID
     * @returns The integration instance or undefined if not found
     */
    using<T>(id: string): T | undefined;
    start(): Promise<void>;
    setDatabaseHandler(databaseHandler: DatabaseHandler): Promise<void>;
    mountOnNestJs(app: any): void;
    startStandaloneServer({ port }: {
        port: number;
    }): void;
}
//# sourceMappingURL=connector.d.ts.map