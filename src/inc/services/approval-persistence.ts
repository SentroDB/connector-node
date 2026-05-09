import path from "path";
import fs from "graceful-fs";
import { APPROVALS_FILE_NAME } from "../utils/constants";
import { findProjectRoot } from "../utils/file-handler";
import type { ApprovalPolicy, ApprovalRequest } from "../types/approval";

export interface ApprovalFileShape {
  policies: ApprovalPolicy[];
  requests: ApprovalRequest[];
}

const EMPTY: ApprovalFileShape = { policies: [], requests: [] };

export class ApprovalPersistence {
  static #instance: ApprovalPersistence;
  static get instance() {
    if (!this.#instance) this.#instance = new ApprovalPersistence();
    return this.#instance;
  }

  private filePath(): string {
    return path.join(findProjectRoot(), APPROVALS_FILE_NAME);
  }

  read(): ApprovalFileShape {
    const filePath = this.filePath();

    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(EMPTY, null, 2), "utf-8");
      return { ...EMPTY };
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        policies: Array.isArray(parsed.policies) ? parsed.policies : [],
        requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      };
    } catch (e) {
      console.error("[Approvals] Failed to parse approvals.json", e);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(EMPTY, null, 2), "utf-8");
      return { ...EMPTY };
    }
  }

  write(data: ApprovalFileShape): void {
    const filePath = this.filePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}
