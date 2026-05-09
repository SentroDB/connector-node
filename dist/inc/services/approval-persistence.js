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
var _a, _ApprovalPersistence_instance;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalPersistence = void 0;
const path_1 = __importDefault(require("path"));
const graceful_fs_1 = __importDefault(require("graceful-fs"));
const constants_1 = require("../utils/constants");
const file_handler_1 = require("../utils/file-handler");
const EMPTY = { policies: [], requests: [] };
class ApprovalPersistence {
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _ApprovalPersistence_instance))
            __classPrivateFieldSet(this, _a, new _a(), "f", _ApprovalPersistence_instance);
        return __classPrivateFieldGet(this, _a, "f", _ApprovalPersistence_instance);
    }
    filePath() {
        return path_1.default.join((0, file_handler_1.findProjectRoot)(), constants_1.APPROVALS_FILE_NAME);
    }
    read() {
        const filePath = this.filePath();
        if (!graceful_fs_1.default.existsSync(filePath)) {
            graceful_fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
            graceful_fs_1.default.writeFileSync(filePath, JSON.stringify(EMPTY, null, 2), "utf-8");
            return { ...EMPTY };
        }
        try {
            const raw = graceful_fs_1.default.readFileSync(filePath, "utf-8");
            const parsed = JSON.parse(raw);
            return {
                policies: Array.isArray(parsed.policies) ? parsed.policies : [],
                requests: Array.isArray(parsed.requests) ? parsed.requests : [],
            };
        }
        catch (e) {
            console.error("[Approvals] Failed to parse approvals.json", e);
            graceful_fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
            graceful_fs_1.default.writeFileSync(filePath, JSON.stringify(EMPTY, null, 2), "utf-8");
            return { ...EMPTY };
        }
    }
    write(data) {
        const filePath = this.filePath();
        graceful_fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
        graceful_fs_1.default.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    }
}
exports.ApprovalPersistence = ApprovalPersistence;
_a = ApprovalPersistence;
_ApprovalPersistence_instance = { value: void 0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwcm92YWwtcGVyc2lzdGVuY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5jL3NlcnZpY2VzL2FwcHJvdmFsLXBlcnNpc3RlbmNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGdEQUF3QjtBQUN4Qiw4REFBNkI7QUFDN0Isa0RBQXlEO0FBQ3pELHdEQUF3RDtBQVF4RCxNQUFNLEtBQUssR0FBc0IsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQztBQUVoRSxNQUFhLG1CQUFtQjtJQUU5QixNQUFNLEtBQUssUUFBUTtRQUNqQixJQUFJLENBQUMsdUJBQUEsSUFBSSx5Q0FBVTtZQUFFLHVCQUFBLElBQUksTUFBYSxJQUFJLEVBQW1CLEVBQUUscUNBQUEsQ0FBQztRQUNoRSxPQUFPLHVCQUFBLElBQUkseUNBQVUsQ0FBQztJQUN4QixDQUFDO0lBRU8sUUFBUTtRQUNkLE9BQU8sY0FBSSxDQUFDLElBQUksQ0FBQyxJQUFBLDhCQUFlLEdBQUUsRUFBRSwrQkFBbUIsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRCxJQUFJO1FBQ0YsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRWpDLElBQUksQ0FBQyxxQkFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQzdCLHFCQUFFLENBQUMsU0FBUyxDQUFDLGNBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUMxRCxxQkFBRSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3BFLE9BQU8sRUFBRSxHQUFHLEtBQUssRUFBRSxDQUFDO1FBQ3RCLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSCxNQUFNLEdBQUcsR0FBRyxxQkFBRSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDL0MsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMvQixPQUFPO2dCQUNMLFFBQVEsRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDL0QsUUFBUSxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFO2FBQ2hFLENBQUM7UUFDSixDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsNENBQTRDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDL0QscUJBQUUsQ0FBQyxTQUFTLENBQUMsY0FBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzFELHFCQUFFLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDcEUsT0FBTyxFQUFFLEdBQUcsS0FBSyxFQUFFLENBQUM7UUFDdEIsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsSUFBdUI7UUFDM0IsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2pDLHFCQUFFLENBQUMsU0FBUyxDQUFDLGNBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUMxRCxxQkFBRSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3JFLENBQUM7Q0FDRjtBQXhDRCxrREF3Q0M7O0FBdkNRLGlEQUFTLENBQXNCIn0=