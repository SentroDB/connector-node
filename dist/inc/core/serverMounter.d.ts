import Router from '@koa/router';
import Koa from "koa";
import { DatabaseHandler } from "../types/db";
import DBManagerTypes from "@sentrodb/connector-node-types";
import { ConnectorConfig } from "../types/global";
import { RouterManager } from '../router/router';
import Connector from './connector';
export default class ServerMounter {
    #private;
    schemaDetails: DBManagerTypes.SchemaDetails;
    server: Koa | null;
    routerManager: RouterManager | null;
    databaseHandler: DatabaseHandler | null;
    config: ConnectorConfig | undefined;
    connector: Connector | null;
    private readonly onFirstStart;
    private readonly onEachStart;
    private readonly onStop;
    constructor();
    static get instance(): ServerMounter;
    init(): void;
    protected mount(router: Router): Promise<void>;
    protected remount(router: Router): Promise<void>;
    stop(): Promise<void>;
    private get completeMountPrefix();
    private getConnectCallback;
    mountOnExpress(express: any): this;
    mountOnFastify(fastify: any): void;
    mountOnNestJs(app: any): void;
    startStandaloneServer({ port }: {
        port: number;
    }): Promise<void>;
    private useCallbackOnFastify;
}
//# sourceMappingURL=serverMounter.d.ts.map