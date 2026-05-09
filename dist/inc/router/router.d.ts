import Router from "@koa/router";
import ServerMounter from "../core/serverMounter";
import { Route } from "../types/global";
export declare class RouterManager {
    router: Router;
    serverMounter: ServerMounter;
    constructor();
    addRoute(route: Route): void;
    private deepMerge;
    private applyCustomizations;
    private getSchema;
    generateDefaultRoutes(): void;
    generateRoutesFromSchema(): void;
    generateWebhookRoutes(): void;
    generateApprovalRoutes(): void;
    generateViewRoutes(): void;
}
//# sourceMappingURL=router.d.ts.map