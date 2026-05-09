import path from "path";
import fs from "graceful-fs";
import { ConnectorConfig } from "../types/global";
import { wretchApi } from "./api";
import DBManagerTypes from "@sentrodb/connector-node-types";
import { ADMIN_DIR_NAME } from "./constants";

export const writeJsonToFile = async (data: DBManagerTypes.SchemaDetails) => {
  const rootDir = path.resolve(require.main?.path || process.cwd());
  const filePath = path.join(rootDir, `../${ADMIN_DIR_NAME}/dbmanager-schema.json`);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
  console.log("Downloaded json to file");
};

export const generateJson = async (config: ConnectorConfig) => {
  const response = await wretchApi
    .headers({
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.secretKey}`,
    })
    .url(`${config.apiUrl ?? "http://localhost:3000"}/client/generate`)
    .get<DBManagerTypes.SchemaDetails>();

  if (!response) {
    throw new Error("Failed to generate json");
  }

  return response;
};

export const findProjectRoot = (start = process.cwd()): string => {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
};
