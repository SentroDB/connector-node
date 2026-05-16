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
            outDir: ".admin",
            fileName: "types.ts",
            preferRequireMain: false,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyTW91bnRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvY29yZS9zZXJ2ZXJNb3VudGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsOENBQXNCO0FBQ3RCLGdEQUF3QjtBQUl4Qiw2Q0FBaUQ7QUFDakQsa0RBQTBEO0FBQzFELCtCQUFvQztBQUNwQyxtRUFBdUU7QUFFdkUsMkVBQTZEO0FBRTdELE1BQXFCLGFBQWE7SUFjaEM7UUFYTyxrQkFBYSxHQUFpQyxnQ0FBb0IsQ0FBQztRQUNuRSxXQUFNLEdBQWUsSUFBSSxDQUFDO1FBQzFCLGtCQUFhLEdBQXlCLElBQUksQ0FBQztRQUMzQyxvQkFBZSxHQUEyQixJQUFJLENBQUM7UUFFL0MsY0FBUyxHQUFxQixJQUFJLENBQUM7UUFFekIsaUJBQVksR0FBNEIsRUFBRSxDQUFDO1FBQzNDLGdCQUFXLEdBQTBDLEVBQUUsQ0FBQztRQUN4RCxXQUFNLEdBQTRCLEVBQUUsQ0FBQztJQUV0QyxDQUFDO0lBRVYsTUFBTSxLQUFLLFFBQVE7UUFDeEIsSUFBSSxDQUFDLHVCQUFBLElBQUksd0NBQWUsRUFBRSxDQUFDO1lBQ3pCLHVCQUFBLElBQUksTUFBa0IsSUFBSSxFQUFhLEVBQUUsb0NBQUEsQ0FBQztRQUM1QyxDQUFDO1FBQ0QsT0FBTyx1QkFBQSxJQUFJLHdDQUFlLENBQUM7SUFDN0IsQ0FBQztJQUVNLElBQUk7UUFDVCxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksYUFBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLHNCQUFhLEVBQUUsQ0FBQztRQUV6QyxtQkFBbUI7UUFDbkIsSUFBQSx3Q0FBc0IsRUFBQyxJQUFJLENBQUMsYUFBYSxFQUFFO1lBQ3pDLE1BQU0sRUFBRSxRQUFRO1lBQ2hCLFFBQVEsRUFBRSxVQUFVO1lBQ3BCLGlC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