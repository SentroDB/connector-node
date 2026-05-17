import Router from '@koa/router';
import Koa from "koa";
import path from "path";
import { DatabaseHandler } from "../types/db";
import DBManagerTypes from "@sentrodb/connector-node-types";
import { ConnectorConfig, HttpCallback } from "../types/global";
import { RouterManager } from '../router/router';
import { EMPTY_SCHEMA_DETAILS } from '../utils/constants';
import { createServer } from 'http';
import { generateDbManagerTypes } from '../generators/types.generator';
import Connector from './connector';
import JsonParserMiddleware from '../middlewares/jsonParser';

export default class ServerMounter {
  static #ServerMounter: ServerMounter;

  public schemaDetails: DBManagerTypes.SchemaDetails = EMPTY_SCHEMA_DETAILS;
  public server: Koa | null = null;
  public routerManager: RouterManager | null = null;
  public databaseHandler: DatabaseHandler | null = null;
  public config: ConnectorConfig | undefined;
  public connector: Connector | null = null;

  private readonly onFirstStart: (() => Promise<void>)[] = [];
  private readonly onEachStart: ((router: Router) => Promise<void>)[] = [];
  private readonly onStop: (() => Promise<void>)[] = [];

  constructor() { }

  public static get instance() {
    if (!this.#ServerMounter) {
      this.#ServerMounter = new ServerMounter();
    }
    return this.#ServerMounter;
  }

  public init() {
    this.server = new Koa();
    this.routerManager = new RouterManager();

    // write types file
    generateDbManagerTypes(this.schemaDetails, {
      outDir: ".admin",
      fileName: "types.ts",
      preferRequireMain: false,
      banner: "Derived from schemaDetails",
      skipIfUnchanged: true,
    });
  }

  protected async mount(router: Router): Promise<void> {
    for (const task of this.onFirstStart) await task();

    await this.remount(router);
  }

  protected async remount(router: Router): Promise<void> {
    for (const task of this.onEachStart) await task(router);
  }

  public async stop(): Promise<void> {
    for (const task of this.onStop) await task();
  }

  private get completeMountPrefix(): string {
    return path.posix.join('/', '', 'dbmanager');
  }

  private getConnectCallback(): HttpCallback {
    if (!this.server || !this.routerManager) {
      throw new Error("Server or router manager is not initialized");
    }

    let handler: HttpCallback | null = null;

    this.routerManager.generateDefaultRoutes();
    this.routerManager.generateWebhookRoutes();
    this.routerManager.generateApprovalRoutes();
    this.routerManager.generateViewRoutes();
    this.routerManager.generateRoutesFromSchema();

    // convert bigints to strings for koa-json to avoid precision issues
    this.server.use(async (ctx, next) => {
      await next();

      if (ctx.body) {
        ctx.body = JSON.parse(
          JSON.stringify(ctx.body, (_key, value) =>
            typeof value === "bigint" ? value.toString() : value
          )
        );
      }
    });

    this.server.use(JsonParserMiddleware());
    this.server.use(this.routerManager.router.routes());

    handler = this.server.callback();

    return (req, res) => {
      if (handler) {
        console.log("Recieved request on:", req.url, res.statusCode);
        handler(req, res);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'DBManager is not started' }));
      }
    }
  }

  public mountOnExpress(express: any): this {
    express.use(this.completeMountPrefix, this.getConnectCallback());

    return this;
  }

  public mountOnFastify(fastify: any) {
    const callback = this.getConnectCallback();
    this.useCallbackOnFastify(fastify, callback);

  }

  public mountOnNestJs(app: any) {
    const adapter = app.getHttpAdapter();
    const connectCallback = this.getConnectCallback();

    if (adapter.constructor.name === 'ExpressAdapter') {
      console.log("Mounting on express:", this.completeMountPrefix);
      app.use(this.completeMountPrefix, connectCallback);
    } else {
      this.useCallbackOnFastify(app, connectCallback);
    }
  }

  public async startStandaloneServer({ port }: { port: number }) {
    const connectCallback = this.getConnectCallback();
    const mountPrefix = this.completeMountPrefix;
    const _server = createServer((req, res) => {
      const requestUrl = req.url ?? "/";

      if (
        requestUrl !== mountPrefix &&
        !requestUrl.startsWith(`${mountPrefix}/`) &&
        !requestUrl.startsWith(`${mountPrefix}?`)
      ) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `DBManager is mounted at ${mountPrefix}` }));
        return;
      }

      req.url = requestUrl.slice(mountPrefix.length) || "/";

      if (req.url.startsWith("?")) {
        req.url = `/${req.url}`;
      }

      connectCallback(req, res);
    });

    _server.listen(port, () => {
      console.log(`Server started on port ${port} at ${mountPrefix}`);
    });

    _server.on('error', (err) => {
      console.error("Server error", err);
    });
  }

  private useCallbackOnFastify(fastify: any, callback: HttpCallback): void {
    try {
      fastify.use(this.completeMountPrefix, callback);
    } catch (e: any) {
      // 'fastify 3'
      if (e.code === 'FST_ERR_MISSING_MIDDLEWARE') {
        fastify
          .register(import('@fastify/express'))
          .then(() => {
            fastify.use(this.completeMountPrefix, callback);
          })
          .catch((err: any) => {
            console.error("Error", err.message);
          });
      } else {
        throw e;
      }
    }
  }
}
