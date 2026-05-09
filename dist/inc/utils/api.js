"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wretchApi = void 0;
const wretch_1 = __importDefault(require("wretch"));
const queryString_1 = __importDefault(require("wretch/addons/queryString"));
exports.wretchApi = (0, wretch_1.default)().addon(queryString_1.default)
    .options({ credentials: "include" })
    .headers({
    "Content-Type": "application/json",
})
    .catcherFallback(async (err) => {
    throw err;
})
    .resolve(async (resolver) => {
    return resolver.res(async (res) => {
        if (res.ok) {
            try {
                return await resolver.json();
            }
            catch (error) {
                try {
                    return await resolver.text();
                }
                catch (error) {
                    return null;
                }
            }
        }
        throw await resolver.json();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy91dGlscy9hcGkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsb0RBQTRCO0FBRTVCLDRFQUF5RDtBQW1DNUMsUUFBQSxTQUFTLEdBQUcsSUFBQSxnQkFBTSxHQUFFLENBQUMsS0FBSyxDQUFDLHFCQUFnQixDQUFDO0tBQ3BELE9BQU8sQ0FBQyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsQ0FBQztLQUNuQyxPQUFPLENBQUM7SUFDTCxjQUFjLEVBQUUsa0JBQWtCO0NBQ3JDLENBQUM7S0FDRCxlQUFlLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxFQUFFO0lBQzNCLE1BQU0sR0FBRyxDQUFDO0FBQ2QsQ0FBQyxDQUFDO0tBQ0QsT0FBTyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsRUFBRTtJQUN4QixPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQzlCLElBQUksR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ1QsSUFBSSxDQUFDO2dCQUNELE9BQU8sTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDakMsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2IsSUFBSSxDQUFDO29CQUNELE9BQU8sTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2pDLENBQUM7Z0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztvQkFDYixPQUFPLElBQUksQ0FBQztnQkFDaEIsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDO1FBQ0QsTUFBTSxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNoQyxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUMsQ0FBQyxDQUFDIn0=