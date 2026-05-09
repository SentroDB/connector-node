"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableCustomizer = void 0;
const customizer_1 = require("./customizer");
class TableCustomizer {
    constructor(modelName) {
        this.modelName = modelName;
        this.customizer = customizer_1.Customizer.instance;
        this.customization = this.customizer.getCustomization(this.modelName);
    }
    getCustomization() {
        return this.customization;
    }
    addCustomization(customization) {
        this.customization = this.customizer.addCustomization(customization);
    }
    addColumnCustomization(column, customization) {
        this.customization = this.customizer.addColumnCustomization(this.modelName, column, customization);
    }
}
exports.TableCustomizer = TableCustomizer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFibGVDdXN0b21pemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy9jdXN0b21pemVycy90YWJsZUN1c3RvbWl6ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsNkNBQTBDO0FBRTFDLE1BQWEsZUFBZTtJQUt4QixZQUFZLFNBQW9DO1FBQzVDLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxVQUFVLEdBQUcsdUJBQVUsQ0FBQyxRQUFRLENBQUM7UUFDdEMsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBRU0sZ0JBQWdCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQztJQUM5QixDQUFDO0lBRU0sZ0JBQWdCLENBQUMsYUFBc0U7UUFDMUYsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ3pFLENBQUM7SUFFTSxzQkFBc0IsQ0FBQyxNQUFjLEVBQUUsYUFBbUQ7UUFDN0YsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsTUFBTSxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQ3ZHLENBQUM7Q0FDSjtBQXRCRCwwQ0FzQkMifQ==