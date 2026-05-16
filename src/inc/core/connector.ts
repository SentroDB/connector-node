import { installSchemaNamespace } from "@sentrodb/connector-node-types";
import { ModelCustomizer } from "../customizers/modelCustomizer";
import { HookEngine } from "../services/hook-engine";
import { IntegrationRegistry } from "../services/integration-registry";
import { WebhookStore } from "../services/webhook-store";
import { ApprovalStore } from "../services/approval-store";
import { DatabaseHandler } from "../types/db";
import { ConnectorConfig } from "../types/global";
import ServerMounter from "./serverMounter";
import { CustomizationStore } from "./customizationStore";

export default class Connector {
  public serverMounter: ServerMounter = ServerMounter.instance;
  private hooks = HookEngine.instance;
  private integrations = IntegrationRegistry.instance;

  constructor(config: ConnectorConfig) {
    this.serverMounter.config = config;
    this.serverMounter.connector = this;
  }

  customize = <T extends DBManagerSchema.TableName>(
    customizer: () => ModelCustomizer<T>
  ) => {
    this.hooks.register<T>(() => customizer());
    return this;
  };

  /**
   * Register an integration with a unique ID
   * @param id - Unique identifier for the integration
   * @param integration - The integration instance to register
   * @returns this for method chaining
   */
  use<T>(id: string, integration: T): this {
    this.integrations.register(id, integration);
    return this;
  }

  async start() {
    if (!this.serverMounter.config) {
      throw new Error("Config is not set");
    }

    this.serverMounter.init();
    CustomizationStore.instance.load();
    WebhookStore.instance.load();
    ApprovalStore.instance.load();

    // const response = await generateJson(this.serverMounter.config);
    // this.serverMounter.schemaDetails = response;
  }

  async setDatabaseHandler(databaseHandler: DatabaseHandler) {
    if (!this.serverMounter.config) {
      throw new Error("Config is not set");
    }

    this.serverMounter.databaseHandler = databaseHandler;
    await this.serverMounter.databaseHandler.connect({
      config: this.serverMounter.config.db,
    });

    this.serverMounter.schemaDetails =
      await this.serverMounter.databaseHandler.getSchemaDetails();
    installSchemaNamespace(this.serverMounter.schemaDetails);
  }

  mountOnNestJs(app: any) {
    this.serverMounter.mountOnNestJs(app);
  }

  startStandaloneServer({ port }: { port: number }) {
    this.serverMounter.startStandaloneServer({ port });
  }
}
