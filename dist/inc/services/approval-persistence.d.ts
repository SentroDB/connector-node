import type { ApprovalPolicy, ApprovalRequest } from "../types/approval";
export interface ApprovalFileShape {
    policies: ApprovalPolicy[];
    requests: ApprovalRequest[];
}
export declare class ApprovalPersistence {
    #private;
    static get instance(): ApprovalPersistence;
    private filePath;
    read(): ApprovalFileShape;
    write(data: ApprovalFileShape): void;
}
//# sourceMappingURL=approval-persistence.d.ts.map