"use strict";
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
var _a, _ViewsStore_ViewsStore;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewsStore = void 0;
const path_1 = __importDefault(require("path"));
const graceful_fs_1 = __importDefault(require("graceful-fs"));
const constants_1 = require("../utils/constants");
const file_handler_1 = require("../utils/file-handler");
const CONFIG_EXT = ".json";
const TEMPLATE_EXT_BY_ENGINE = {
    ejs: ".ejs",
};
class ViewsStore {
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _ViewsStore_ViewsStore)) {
            __classPrivateFieldSet(this, _a, new _a(), "f", _ViewsStore_ViewsStore);
        }
        return __classPrivateFieldGet(this, _a, "f", _ViewsStore_ViewsStore);
    }
    get dir() {
        return path_1.default.join((0, file_handler_1.findProjectRoot)(), constants_1.VIEWS_DIR_NAME);
    }
    ensureDir() {
        graceful_fs_1.default.mkdirSync(this.dir, { recursive: true });
    }
    list() {
        this.ensureDir();
        const entries = graceful_fs_1.default
            .readdirSync(this.dir)
            .filter((f) => f.endsWith(CONFIG_EXT));
        return entries
            .map((file) => this.readConfig(path_1.default.basename(file, CONFIG_EXT)))
            .filter((v) => v !== null);
    }
    get(slug) {
        const config = this.readConfig(slug);
        if (!config)
            return null;
        const template = this.readTemplate(slug, config.engine);
        return { ...config, template };
    }
    create(input) {
        const existing = this.readConfig(input.slug);
        if (existing) {
            const err = new Error(`View "${input.slug}" already exists`);
            err.status = 409;
            throw err;
        }
        const now = new Date().toISOString();
        const config = {
            slug: input.slug,
            name: input.name,
            description: input.description,
            engine: input.engine,
            tables: input.tables,
            createdAt: now,
            updatedAt: now,
        };
        this.writeConfig(config);
        this.writeTemplate(input.slug, input.engine, input.template);
        return { ...config, template: input.template };
    }
    update(slug, patch) {
        const existing = this.readConfig(slug);
        if (!existing) {
            const err = new Error(`View "${slug}" not found`);
            err.status = 404;
            throw err;
        }
        const nextEngine = patch.engine ?? existing.engine;
        const config = {
            ...existing,
            ...patch,
            slug,
            engine: nextEngine,
            createdAt: existing.createdAt,
            updatedAt: new Date().toISOString(),
        };
        if (patch.engine && patch.engine !== existing.engine) {
            this.deleteTemplate(slug, existing.engine);
        }
        this.writeConfig(config);
        const template = patch.template !== undefined
            ? (this.writeTemplate(slug, nextEngine, patch.template), patch.template)
            : this.readTemplate(slug, nextEngine);
        return { ...config, template };
    }
    delete(slug) {
        const existing = this.readConfig(slug);
        if (!existing)
            return false;
        this.deleteConfig(slug);
        this.deleteTemplate(slug, existing.engine);
        return true;
    }
    // ─── File I/O ───────────────────────────────────────────────────────
    readConfig(slug) {
        const file = path_1.default.join(this.dir, `${slug}${CONFIG_EXT}`);
        if (!graceful_fs_1.default.existsSync(file))
            return null;
        try {
            return JSON.parse(graceful_fs_1.default.readFileSync(file, "utf-8"));
        }
        catch (e) {
            console.error(`Failed to parse view config ${file}:`, e);
            return null;
        }
    }
    writeConfig(config) {
        this.ensureDir();
        const file = path_1.default.join(this.dir, `${config.slug}${CONFIG_EXT}`);
        graceful_fs_1.default.writeFileSync(file, JSON.stringify(config, null, 2), "utf-8");
    }
    deleteConfig(slug) {
        const file = path_1.default.join(this.dir, `${slug}${CONFIG_EXT}`);
        if (graceful_fs_1.default.existsSync(file))
            graceful_fs_1.default.unlinkSync(file);
    }
    readTemplate(slug, engine) {
        const file = path_1.default.join(this.dir, `${slug}${TEMPLATE_EXT_BY_ENGINE[engine]}`);
        if (!graceful_fs_1.default.existsSync(file))
            return "";
        return graceful_fs_1.default.readFileSync(file, "utf-8");
    }
    writeTemplate(slug, engine, template) {
        this.ensureDir();
        const file = path_1.default.join(this.dir, `${slug}${TEMPLATE_EXT_BY_ENGINE[engine]}`);
        graceful_fs_1.default.writeFileSync(file, template, "utf-8");
    }
    deleteTemplate(slug, engine) {
        const file = path_1.default.join(this.dir, `${slug}${TEMPLATE_EXT_BY_ENGINE[engine]}`);
        if (graceful_fs_1.default.existsSync(file))
            graceful_fs_1.default.unlinkSync(file);
    }
}
exports.ViewsStore = ViewsStore;
_a = ViewsStore;
_ViewsStore_ViewsStore = { value: void 0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld3NTdG9yZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvY29yZS92aWV3c1N0b3JlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGdEQUF3QjtBQUN4Qiw4REFBNkI7QUFFN0Isa0RBQW9EO0FBQ3BELHdEQUF3RDtBQUV4RCxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUM7QUFDM0IsTUFBTSxzQkFBc0IsR0FBeUM7SUFDbkUsR0FBRyxFQUFFLE1BQU07Q0FDWixDQUFDO0FBRUYsTUFBYSxVQUFVO0lBR3JCLE1BQU0sS0FBSyxRQUFRO1FBQ2pCLElBQUksQ0FBQyx1QkFBQSxJQUFJLGtDQUFZLEVBQUUsQ0FBQztZQUN0Qix1QkFBQSxJQUFJLE1BQWUsSUFBSSxFQUFVLEVBQUUsOEJBQUEsQ0FBQztRQUN0QyxDQUFDO1FBQ0QsT0FBTyx1QkFBQSxJQUFJLGtDQUFZLENBQUM7SUFDMUIsQ0FBQztJQUVELElBQVksR0FBRztRQUNiLE9BQU8sY0FBSSxDQUFDLElBQUksQ0FBQyxJQUFBLDhCQUFlLEdBQUUsRUFBRSwwQkFBYyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUVPLFNBQVM7UUFDZixxQkFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVNLElBQUk7UUFDVCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDakIsTUFBTSxPQUFPLEdBQUcscUJBQUU7YUFDZixXQUFXLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQzthQUNyQixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUV6QyxPQUFPLE9BQU87YUFDWCxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsY0FBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQzthQUMvRCxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQW1CLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVNLEdBQUcsQ0FBQyxJQUFZO1FBQ3JCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckMsSUFBSSxDQUFDLE1BQU07WUFBRSxPQUFPLElBQUksQ0FBQztRQUV6QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEQsT0FBTyxFQUFFLEdBQUcsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO0lBQ2pDLENBQUM7SUFFTSxNQUFNLENBQ1gsS0FBeUU7UUFFekUsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0MsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNiLE1BQU0sR0FBRyxHQUFRLElBQUksS0FBSyxDQUFDLFNBQVMsS0FBSyxDQUFDLElBQUksa0JBQWtCLENBQUMsQ0FBQztZQUNsRSxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztZQUNqQixNQUFNLEdBQUcsQ0FBQztRQUNaLENBQUM7UUFFRCxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3JDLE1BQU0sTUFBTSxHQUFlO1lBQ3pCLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtZQUNoQixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7WUFDaEIsV0FBVyxFQUFFLEtBQUssQ0FBQyxXQUFXO1lBQzlCLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTTtZQUNwQixNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDcEIsU0FBUyxFQUFFLEdBQUc7WUFDZCxTQUFTLEVBQUUsR0FBRztTQUNmLENBQUM7UUFFRixJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU3RCxPQUFPLEVBQUUsR0FBRyxNQUFNLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNqRCxDQUFDO0lBRU0sTUFBTSxDQUNYLElBQVksRUFDWixLQUE4RTtRQUU5RSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNkLE1BQU0sR0FBRyxHQUFRLElBQUksS0FBSyxDQUFDLFNBQVMsSUFBSSxhQUFhLENBQUMsQ0FBQztZQUN2RCxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztZQUNqQixNQUFNLEdBQUcsQ0FBQztRQUNaLENBQUM7UUFFRCxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFFbkQsTUFBTSxNQUFNLEdBQWU7WUFDekIsR0FBRyxRQUFRO1lBQ1gsR0FBRyxLQUFLO1lBQ1IsSUFBSTtZQUNKLE1BQU0sRUFBRSxVQUFVO1lBQ2xCLFNBQVMsRUFBRSxRQUFRLENBQUMsU0FBUztZQUM3QixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7U0FDcEMsQ0FBQztRQUVGLElBQUksS0FBSyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNyRCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUVELElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFekIsTUFBTSxRQUFRLEdBQ1osS0FBSyxDQUFDLFFBQVEsS0FBSyxTQUFTO1lBQzFCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQztZQUN4RSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFMUMsT0FBTyxFQUFFLEdBQUcsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO0lBQ2pDLENBQUM7SUFFTSxNQUFNLENBQUMsSUFBWTtRQUN4QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxRQUFRO1lBQUUsT0FBTyxLQUFLLENBQUM7UUFFNUIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4QixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDM0MsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQsdUVBQXVFO0lBRS9ELFVBQVUsQ0FBQyxJQUFZO1FBQzdCLE1BQU0sSUFBSSxHQUFHLGNBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksR0FBRyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ3pELElBQUksQ0FBQyxxQkFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUM7WUFBRSxPQUFPLElBQUksQ0FBQztRQUN0QyxJQUFJLENBQUM7WUFDSCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMscUJBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFlLENBQUM7UUFDbEUsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN6RCxPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7SUFDSCxDQUFDO0lBRU8sV0FBVyxDQUFDLE1BQWtCO1FBQ3BDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNqQixNQUFNLElBQUksR0FBRyxjQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUMsSUFBSSxHQUFHLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDaEUscUJBQUUsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRU8sWUFBWSxDQUFDLElBQVk7UUFDL0IsTUFBTSxJQUFJLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxHQUFHLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDekQsSUFBSSxxQkFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUM7WUFBRSxxQkFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRU8sWUFBWSxDQUFDLElBQVksRUFBRSxNQUE0QjtRQUM3RCxNQUFNLElBQUksR0FBRyxjQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLEdBQUcsc0JBQXNCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzdFLElBQUksQ0FBQyxxQkFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUM7WUFBRSxPQUFPLEVBQUUsQ0FBQztRQUNwQyxPQUFPLHFCQUFFLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRU8sYUFBYSxDQUNuQixJQUFZLEVBQ1osTUFBNEIsRUFDNUIsUUFBZ0I7UUFFaEIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2pCLE1BQU0sSUFBSSxHQUFHLGNBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksR0FBRyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDN0UscUJBQUUsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRU8sY0FBYyxDQUFDLElBQVksRUFBRSxNQUE0QjtRQUMvRCxNQUFNLElBQUksR0FBRyxjQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLEdBQUcsc0JBQXNCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzdFLElBQUkscUJBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO1lBQUUscUJBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDL0MsQ0FBQztDQUNGO0FBekpELGdDQXlKQzs7QUF4SlEsMENBQVcsQ0FBYSJ9