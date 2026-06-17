"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const connector_node_types_1 = require("@sentrodb/connector-node-types");
const hook_engine_1 = require("../services/hook-engine");
const integration_registry_1 = require("../services/integration-registry");
const webhook_store_1 = require("../services/webhook-store");
const approval_store_1 = require("../services/approval-store");
const serverMounter_1 = __importDefault(require("./serverMounter"));
const customizationStore_1 = require("./customizationStore");
class Connector {
    constructor(config) {
        this.serverMounter = serverMounter_1.default.instance;
        this.hooks = hook_engine_1.HookEngine.instance;
        this.integrations = integration_registry_1.IntegrationRegistry.instance;
        this.customize = (customizer) => {
            this.hooks.register(() => customizer());
            return this;
        };
        this.serverMounter.config = config;
        this.serverMounter.connector = this;
    }
    /**
     * Register an integration with a unique ID
     * @param id - Unique identifier for the integration
     * @param integration - The integration instance to register
     * @returns this for method chaining
     */
    use(id, integration) {
        this.integrations.register(id, integration);
        return this;
    }
    async start() {
        if (!this.serverMounter.config) {
            throw new Error("Config is not set");
        }
        this.serverMounter.init();
        customizationStore_1.CustomizationStore.instance.load();
        webhook_store_1.WebhookStore.instance.load();
        approval_store_1.ApprovalStore.instance.load();
        // const response = await generateJson(this.serverMounter.config);
        // this.serverMounter.schemaDetails = response;
    }
    async setDatabaseHandler(databaseHandler) {
        if (!this.serverMounter.config) {
            throw new Error("Config is not set");
        }
        this.serverMounter.databaseHandler = databaseHandler;
        await this.serverMounter.databaseHandler.connect({
            config: this.serverMounter.config.db,
        });
        this.serverMounter.schemaDetails =
            await this.serverMounter.databaseHandler.getSchemaDetails();
        (0, connector_node_types_1.installSchemaNamespace)(this.serverMounter.schemaDetails);
    }
    mountOnNestJs(app) {
        this.serverMounter.mountOnNestJs(app);
    }
    mountOnExpress(app) {
        this.serverMounter.mountOnExpress(app);
    }
    mountOnFastify(fastify) {
        this.serverMounter.mountOnFastify(fastify);
    }
    startStandaloneServer({ port }) {
        this.serverMounter.startStandaloneServer({ port });
    }
}
exports.default = Connector;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29ubmVjdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy9jb3JlL2Nvbm5lY3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLHlFQUF3RTtBQUV4RSx5REFBcUQ7QUFDckQsMkVBQXVFO0FBQ3ZFLDZEQUF5RDtBQUN6RCwrREFBMkQ7QUFHM0Qsb0VBQTRDO0FBQzVDLDZEQUEwRDtBQUUxRCxNQUFxQixTQUFTO0lBSzVCLFlBQVksTUFBdUI7UUFKNUIsa0JBQWEsR0FBa0IsdUJBQWEsQ0FBQyxRQUFRLENBQUM7UUFDckQsVUFBSyxHQUFHLHdCQUFVLENBQUMsUUFBUSxDQUFDO1FBQzVCLGlCQUFZLEdBQUcsMENBQW1CLENBQUMsUUFBUSxDQUFDO1FBT3BELGNBQVMsR0FBRyxDQUNWLFVBQW9DLEVBQ3BDLEVBQUU7WUFDRixJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBSSxHQUFHLEVBQUUsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1lBQzNDLE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQyxDQUFDO1FBVEEsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ25DLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztJQUN0QyxDQUFDO0lBU0Q7Ozs7O09BS0c7SUFDSCxHQUFHLENBQUksRUFBVSxFQUFFLFdBQWM7UUFDL0IsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQzVDLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVELEtBQUssQ0FBQyxLQUFLO1FBQ1QsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFFRCxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzFCLHVDQUFrQixDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNuQyw0QkFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUM3Qiw4QkFBYSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUU5QixrRUFBa0U7UUFDbEUsK0NBQStDO0lBQ2pELENBQUM7SUFFRCxLQUFLLENBQUMsa0JBQWtCLENBQUMsZUFBZ0M7UUFDdkQsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFFRCxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7UUFDckQsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUM7WUFDL0MsTUFBTSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLEVBQUU7U0FDckMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhO1lBQzlCLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUM5RCxJQUFBLDZDQUFzQixFQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVELGFBQWEsQ0FBQyxHQUFRO1FBQ3BCLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFRCxjQUFjLENBQUMsR0FBUTtRQUNyQixJQUFJLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRUQsY0FBYyxDQUFDLE9BQVk7UUFDekIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELHFCQUFxQixDQUFDLEVBQUUsSUFBSSxFQUFvQjtRQUM5QyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNyRCxDQUFDO0NBQ0Y7QUF4RUQsNEJBd0VDIn0=