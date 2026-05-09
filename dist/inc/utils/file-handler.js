"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findProjectRoot = exports.generateJson = exports.writeJsonToFile = void 0;
const path_1 = __importDefault(require("path"));
const graceful_fs_1 = __importDefault(require("graceful-fs"));
const api_1 = require("./api");
const constants_1 = require("./constants");
const writeJsonToFile = async (data) => {
    const rootDir = path_1.default.resolve(require.main?.path || process.cwd());
    const filePath = path_1.default.join(rootDir, `../${constants_1.ADMIN_DIR_NAME}/dbmanager-schema.json`);
    graceful_fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
    graceful_fs_1.default.writeFileSync(filePath, JSON.stringify(data, null, 4));
    console.log("Downloaded json to file");
};
exports.writeJsonToFile = writeJsonToFile;
const generateJson = async (config) => {
    const response = await api_1.wretchApi
        .headers({
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.secretKey}`,
    })
        .url(`${config.apiUrl ?? "http://localhost:3000"}/client/generate`)
        .get();
    if (!response) {
        throw new Error("Failed to generate json");
    }
    return response;
};
exports.generateJson = generateJson;
const findProjectRoot = (start = process.cwd()) => {
    let dir = start;
    for (;;) {
        if (graceful_fs_1.default.existsSync(path_1.default.join(dir, "package.json")))
            return dir;
        const parent = path_1.default.dirname(dir);
        if (parent === dir)
            return process.cwd();
        dir = parent;
    }
};
exports.findProjectRoot = findProjectRoot;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZS1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy91dGlscy9maWxlLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsZ0RBQXdCO0FBQ3hCLDhEQUE2QjtBQUU3QiwrQkFBa0M7QUFFbEMsMkNBQTZDO0FBRXRDLE1BQU0sZUFBZSxHQUFHLEtBQUssRUFBRSxJQUFrQyxFQUFFLEVBQUU7SUFDMUUsTUFBTSxPQUFPLEdBQUcsY0FBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUNsRSxNQUFNLFFBQVEsR0FBRyxjQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLDBCQUFjLHdCQUF3QixDQUFDLENBQUM7SUFFbEYscUJBQUUsQ0FBQyxTQUFTLENBQUMsY0FBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQzFELHFCQUFFLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxRCxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixDQUFDLENBQUM7QUFDekMsQ0FBQyxDQUFDO0FBUFcsUUFBQSxlQUFlLG1CQU8xQjtBQUVLLE1BQU0sWUFBWSxHQUFHLEtBQUssRUFBRSxNQUF1QixFQUFFLEVBQUU7SUFDNUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxlQUFTO1NBQzdCLE9BQU8sQ0FBQztRQUNQLGNBQWMsRUFBRSxrQkFBa0I7UUFDbEMsYUFBYSxFQUFFLFVBQVUsTUFBTSxDQUFDLFNBQVMsRUFBRTtLQUM1QyxDQUFDO1NBQ0QsR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sSUFBSSx1QkFBdUIsa0JBQWtCLENBQUM7U0FDbEUsR0FBRyxFQUFnQyxDQUFDO0lBRXZDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM3QyxDQUFDO0lBRUQsT0FBTyxRQUFRLENBQUM7QUFDbEIsQ0FBQyxDQUFDO0FBZFcsUUFBQSxZQUFZLGdCQWN2QjtBQUVLLE1BQU0sZUFBZSxHQUFHLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBVSxFQUFFO0lBQy9ELElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQztJQUNoQixTQUFTLENBQUM7UUFDUixJQUFJLHFCQUFFLENBQUMsVUFBVSxDQUFDLGNBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1lBQUUsT0FBTyxHQUFHLENBQUM7UUFDOUQsTUFBTSxNQUFNLEdBQUcsY0FBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqQyxJQUFJLE1BQU0sS0FBSyxHQUFHO1lBQUUsT0FBTyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekMsR0FBRyxHQUFHLE1BQU0sQ0FBQztJQUNmLENBQUM7QUFDSCxDQUFDLENBQUM7QUFSVyxRQUFBLGVBQWUsbUJBUTFCIn0=