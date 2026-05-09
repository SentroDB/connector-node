"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _ServerMounter_ServerMounter;
Object.defineProperty(exports, "__esModule", { value: true });
const koa_1 = __importDefault(require("koa"));
const path_1 = __importDefault(require("path"));
const router_1 = require("../router/router");
const constants_1 = require("../utils/constants");
const http_1 = require("http");
const types_generator_1 = require("../generators/types.generator");
const jsonParser_1 = __importDefault(require("../middlewares/jsonParser"));
class ServerMounter {
    constructor() {
        this.schemaDetails = constants_1.EMPTY_SCHEMA_DETAILS;
        this.server = null;
        this.routerManager = null;
        this.databaseHandler = null;
        this.connector = null;
        this.onFirstStart = [];
        this.onEachStart = [];
        this.onStop = [];
    }
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _ServerMounter_ServerMounter)) {
            __classPrivateFieldSet(this, _a, new _a(), "f", _ServerMounter_ServerMounter);
        }
        return __classPrivateFieldGet(this, _a, "f", _ServerMounter_ServerMounter);
    }
    init() {
        this.server = new koa_1.default();
        this.routerManager = new router_1.RouterManager();
        // write types file
        (0, types_generator_1.generateDbManagerTypes)(this.schemaDetails, {
            outDir: "../.admin",
            fileName: "dbmanager-types.ts",
            preferRequireMain: true,
            banner: "Derived from schemaDetails",
            skipIfUnchanged: true,
        });
    }
    async mount(router) {
        for (const task of this.onFirstStart)
            await task();
        await this.remount(router);
    }
    async remount(router) {
        for (const task of this.onEachStart)
            await task(router);
    }
    async stop() {
        for (const task of this.onStop)
            await task();
    }
    get completeMountPrefix() {
        return path_1.default.posix.join('/', '', 'dbmanager');
    }
    getConnectCallback() {
        if (!this.server || !this.routerManager) {
            throw new Error("Server or router manager is not initialized");
        }
        let handler = null;
        this.routerManager.generateDefaultRoutes();
        this.routerManager.generateWebhookRoutes();
        this.routerManager.generateApprovalRoutes();
        this.routerManager.generateViewRoutes();
        this.routerManager.generateRoutesFromSchema();
        // convert bigints to strings for koa-json to avoid precision issues
        this.server.use(async (ctx, next) => {
            await next();
            if (ctx.body) {
                ctx.body = JSON.parse(JSON.stringify(ctx.body, (_key, value) => typeof value === "bigint" ? value.toString() : value));
            }
        });
        this.server.use((0, jsonParser_1.default)());
        this.server.use(this.routerManager.router.routes());
        handler = this.server.callback();
        return (req, res) => {
            if (handler) {
                console.log("Recieved request on:", req.url, res.statusCode);
                handler(req, res);
            }
            else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'DBManager is not started' }));
            }
        };
    }
    mountOnExpress(express) {
        express.use(this.completeMountPrefix, this.getConnectCallback());
        return this;
    }
    mountOnFastify(fastify) {
        const callback = this.getConnectCallback();
        this.useCallbackOnFastify(fastify, callback);
    }
    mountOnNestJs(app) {
        const adapter = app.getHttpAdapter();
        const connectCallback = this.getConnectCallback();
        if (adapter.constructor.name === 'ExpressAdapter') {
            console.log("Mounting on express:", this.completeMountPrefix);
            app.use(this.completeMountPrefix, connectCallback);
        }
        else {
            this.useCallbackOnFastify(app, connectCallback);
        }
    }
    async startStandaloneServer({ port }) {
        const connectCallback = this.getConnectCallback();
        const _server = (0, http_1.createServer)(connectCallback);
        _server.listen(port, () => {
            console.log(`Server started on port ${port}`);
        });
        _server.on('error', (err) => {
            console.error("Server error", err);
        });
    }
    useCallbackOnFastify(fastify, callback) {
        try {
            fastify.use(this.completeMountPrefix, callback);
        }
        catch (e) {
            // 'fastify 3'
            if (e.code === 'FST_ERR_MISSING_MIDDLEWARE') {
                fastify
                    .register(Promise.resolve().then(() => __importStar(require('@fastify/express'))))
                    .then(() => {
                    fastify.use(this.completeMountPrefix, callback);
                })
                    .catch((err) => {
                    console.error("Error", err.message);
                });
            }
            else {
                throw e;
            }
        }
    }
}
_a = ServerMounter;
_ServerMounter_ServerMounter = { value: void 0 };
exports.default = ServerMounter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyTW91bnRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvY29yZS9zZXJ2ZXJNb3VudGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsOENBQXNCO0FBQ3RCLGdEQUF3QjtBQUl4Qiw2Q0FBaUQ7QUFDakQsa0RBQTBEO0FBQzFELCtCQUFvQztBQUNwQyxtRUFBdUU7QUFFdkUsMkVBQTZEO0FBRTdELE1BQXFCLGFBQWE7SUFjaEM7UUFYTyxrQkFBYSxHQUFpQyxnQ0FBb0IsQ0FBQztRQUNuRSxXQUFNLEdBQWUsSUFBSSxDQUFDO1FBQzFCLGtCQUFhLEdBQXlCLElBQUksQ0FBQztRQUMzQyxvQkFBZSxHQUEyQixJQUFJLENBQUM7UUFFL0MsY0FBUyxHQUFxQixJQUFJLENBQUM7UUFFekIsaUJBQVksR0FBNEIsRUFBRSxDQUFDO1FBQzNDLGdCQUFXLEdBQTBDLEVBQUUsQ0FBQztRQUN4RCxXQUFNLEdBQTRCLEVBQUUsQ0FBQztJQUV0QyxDQUFDO0lBRVYsTUFBTSxLQUFLLFFBQVE7UUFDeEIsSUFBSSxDQUFDLHVCQUFBLElBQUksd0NBQWUsRUFBRSxDQUFDO1lBQ3pCLHVCQUFBLElBQUksTUFBa0IsSUFBSSxFQUFhLEVBQUUsb0NBQUEsQ0FBQztRQUM1QyxDQUFDO1FBQ0QsT0FBTyx1QkFBQSxJQUFJLHdDQUFlLENBQUM7SUFDN0IsQ0FBQztJQUVNLElBQUk7UUFDVCxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksYUFBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLHNCQUFhLEVBQUUsQ0FBQztRQUV6QyxtQkFBbUI7UUFDbkIsSUFBQSx3Q0FBc0IsRUFBQyxJQUFJLENBQUMsYUFBYSxFQUFFO1lBQ3pDLE1BQU0sRUFBRSxXQUFXO1lBQ25CLFFBQVEsRUFBRSxvQkFBb0I7WUFDOUIs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