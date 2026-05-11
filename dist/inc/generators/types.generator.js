"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDbManagerTypes = generateDbManagerTypes;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const constants_1 = require("../utils/constants");
const DEFAULT_FILE_NAME = "types.ts";
function emitAggregateMaps(tables) {
    const rows = tables
        .map((t) => `  ${safeProp(t.name)}: Row_${safeType(t.name)};`)
        .join("\n");
    const inserts = tables
        .map((t) => `  ${safeProp(t.name)}: Insert_${safeType(t.name)};`)
        .join("\n");
    const updates = tables
        .map((t) => `  ${safeProp(t.name)}: Update_${safeType(t.name)};`)
        .join("\n");
    const deletes = tables
        .map((t) => `  ${safeProp(t.name)}: Delete_${safeType(t.name)};`)
        .join("\n");
    const pks = tables
        .map((t) => `  ${safeProp(t.name)}: PK_${safeType(t.name)};`)
        .join("\n");
    const rels = tables
        .map((t) => `  ${safeProp(t.name)}: Relations_${safeType(t.name)};`)
        .join("\n");
    return [
        `export type Row = {\n${rows}\n};`,
        `export type Insert = {\n${inserts}\n};`,
        `export type Update = {\n${updates}\n};`,
        `export type Delete = {\n${deletes}\n};`,
        `export type PK = {\n${pks}\n};`,
        `export type Relations = {\n${rels}\n};`,
    ].join("\n\n");
}
function generateDbManagerTypes(schema, opts = {}) {
    const { outDir = `../${constants_1.ADMIN_DIR_NAME}`, fileName = DEFAULT_FILE_NAME, preferRequireMain = true, banner, customizations, skipIfUnchanged = true, } = opts;
    const rootDir = node_path_1.default.resolve(preferRequireMain && require?.main?.path ? require.main.path : process.cwd());
    const outputDir = node_path_1.default.resolve(rootDir, outDir);
    node_fs_1.default.mkdirSync(outputDir, { recursive: true });
    const filePath = node_path_1.default.join(outputDir, fileName);
    const contents = render(schema, { banner, customizations });
    if (skipIfUnchanged && node_fs_1.default.existsSync(filePath)) {
        const old = node_fs_1.default.readFileSync(filePath, "utf-8");
        const same = sha(stripTsHeader(old)) === sha(stripTsHeader(contents));
        if (same)
            return { filePath, written: false };
    }
    node_fs_1.default.writeFileSync(filePath, contents, "utf-8");
    generateGlobalTypes(outputDir, fileName);
    console.log("Global types generated");
    return { filePath, written: true };
}
/* ------------------------------------------------------------------------ */
function generateGlobalTypes(outputDir, fileName) {
    const dts = `
// AUTO-GENERATED — DO NOT EDIT.
// This file binds the generated TableName to the global Schema namespace.

import type * as T from "./${fileName?.replace(/\.ts$/, "") ?? "types"}";

declare global {
  namespace DBManagerSchema {
    type TableName = T.TableName;
    type ListBy<TN extends DBManagerSchema.TableName> = { rows: RowBy<TN>[]; total: number };
    type RowBy<TN extends DBManagerSchema.TableName> = T.Row[TN];
    type InsertBy<TN extends DBManagerSchema.TableName> = T.Insert[TN];
    type UpdateBy<TN extends DBManagerSchema.TableName> = T.Update[TN];
    type DeleteBy<TN extends DBManagerSchema.TableName> = {where: T.Delete[TN], single: boolean};
    type PKBy<TN extends DBManagerSchema.TableName> = T.PK[TN];
  }

  var DBManagerSchema: {
    readonly tableNames: readonly DBManagerSchema.TableName[];
    hasTable(name: string): boolean;
  };
}

export {};
`.trimStart();
    const dtsFile = node_path_1.default.join(outputDir, "global.d.ts");
    node_fs_1.default.writeFileSync(dtsFile, dts, "utf-8");
}
function render(schema, ctx) {
    const now = new Date().toISOString();
    const header = [
        "/**",
        " * AUTO-GENERATED FILE — DO NOT EDIT.",
        ` * Generated at: ${now}`,
        ` * Schema hash: ${sha(JSON.stringify(schema))}`,
        ...(ctx.banner
            ? [" *", ...ctx.banner.split("\n").map((l) => ` * ${l}`)]
            : []),
        " */",
        "",
    ].join("\n");
    const tables = schema.tables ?? [];
    const tableNames = [...new Set(tables.map((t) => t.name))].sort();
    const tableUnion = emitUnion("TableName", tableNames);
    const columnsByTable = emitColumnsByTable(tables);
    // Enums: emit a union type per enum column: Enum_<Table>_<Column>
    const enumBlocks = emitEnumsFromColumns(tables);
    // Per-table Row/Insert/Update + PK + Relations
    const perTable = tables.map((t) => emitTableBlock(t, tables)).join("\n\n");
    // Helpers derived from customizations.json (optional)
    const customHelpers = ctx.customizations
        ? emitCustomizationHelpers(ctx.customizations)
        : "// No customization helpers (none provided)";
    const aggregateMaps = emitAggregateMaps(tables);
    return [
        header,
        `export type Engine = 'postgres' | 'mysql' | 'mssql';`,
        "",
        tableUnion,
        "",
        columnsByTable,
        "",
        enumBlocks || "// No enum columns detected",
        "",
        perTable,
        "",
        aggregateMaps,
        "",
        customHelpers,
        "",
        "// End of generated types.",
        "",
    ].join("\n");
}
/* -------------------------------- Emitters ------------------------------- */
function emitUnion(name, values) {
    if (!values.length)
        return `export type ${name} = never;`;
    return `export type ${name} =\n${values
        .map((v) => `  | ${JSON.stringify(v)}`)
        .join("\n")};`;
}
function emitColumnsByTable(tables) {
    const body = tables
        .map((t) => {
        const cols = dedupeColumns(t.columns).map((c) => JSON.stringify(c.name)).join(" | ") || "never";
        return `  ${safeProp(t.name)}: ${cols};`;
    })
        .join("\n");
    return `export type ColumnsByTable = {\n${body}\n};`;
}
function dedupeColumns(columns) {
    const seen = new Set();
    const out = [];
    for (const c of columns) {
        if (seen.has(c.name))
            continue;
        seen.add(c.name);
        out.push(c);
    }
    return out;
}
function emitEnumsFromColumns(tables) {
    const blocks = [];
    for (const t of tables) {
        for (const c of t.columns) {
            if (c.enum_values && c.enum_values.length) {
                const tn = safeType(t.name);
                const cn = safeType(c.name);
                const union = c.enum_values.map((v) => JSON.stringify(v)).join(" | ");
                blocks.push(`export type Enum_${tn}_${cn} = ${union};`);
            }
        }
    }
    return blocks.join("\n");
}
function emitTableBlock(table, allTables) {
    const T = safeType(table.name);
    // Row
    const rowBody = table.columns
        .map((c) => `  ${safeProp(c.name)}: ${tsTypeForColumnInTable(table.name, c)};`)
        .join("\n");
    const row = `export type Row_${T} = {\n${rowBody}\n};`;
    // Insert (omit generated; required if NOT NULL and no default)
    const insertBody = table.columns
        .filter((c) => !isGenerated(c))
        .map((c) => {
        const required = isNotNull(c) && !hasDefault(c);
        return `  ${safeProp(c.name)}${required ? "" : "?"}: ${tsTypeForColumnInTable(table.name, c)};`;
    })
        .join("\n");
    const insert = `export type Insert_${T} = {\n${insertBody}\n};`;
    // Update (all optional; enforce PK in handlers if you want)
    const updateBody = table.columns
        .map((c) => `  ${safeProp(c.name)}?: ${tsTypeForColumnInTable(table.name, c)};`)
        .join("\n");
    const update = `export type Update_${T} = {\n${updateBody}\n};`;
    const deleteBody = table.columns
        .map((c) => `  ${safeProp(c.name)}?: ${tsTypeForColumnInTable(table.name, c)};`)
        .join("\n");
    const deleteType = `export type Delete_${T} = {\n${deleteBody}\n};`;
    const pkCols = getPrimaryKeyColumns(table);
    const pk = pkCols.length > 0
        ? `export type PK_${T} = ${pkCols
            .map((c) => JSON.stringify(c))
            .join(" | ")};`
        : `export type PK_${T} = never;`;
    // Relations: from constraints where reference != null
    const fkEntries = (table.constraints ?? [])
        .filter((k) => k.reference && k.reference.table && k.reference.column)
        .map((k) => `  ${safeProp(k.column)}: { refTable: ${JSON.stringify(k.reference.table)}; refColumn: ${JSON.stringify(k.reference.column)}; onUpdate: ${JSON.stringify(k.onUpdate)}; onDelete: ${JSON.stringify(k.onDelete)}; relationshipType: ${JSON.stringify(k.relationshipType)}; isUnique: ${JSON.stringify(k.isUnique)} };`);
    const rel = fkEntries.length > 0
        ? `export type Relations_${T} = {\n${fkEntries.join("\n")}\n};`
        : `export type Relations_${T} = Record<string, never>;`;
    return [row, insert, update, deleteType, pk, rel].join("\n\n");
}
function emitCustomizationHelpers(customizations) {
    // Hidden tables
    const hidden = customizations
        .filter((t) => t.customization && t.customization.isVisible === false)
        .map((t) => JSON.stringify(t.name));
    const hiddenBlock = hidden.length
        ? `export type HiddenTables = ${hidden.join(" | ")};`
        : `export type HiddenTables = never;`;
    // Readonly columns per table
    const perTableBlocks = [];
    for (const t of customizations) {
        const readOnlyCols = t.columns
            ?.filter((c) => c.customization?.readOnly)
            ?.map((c) => JSON.stringify(c.name)) ?? [];
        const tn = safeType(t.name);
        perTableBlocks.push(`export type ReadonlyColumns_${tn} = ${readOnlyCols.length ? readOnlyCols.join(" | ") : "never"};`);
    }
    return [hiddenBlock, ...perTableBlocks].join("\n");
}
/* --------------------------------- Rules --------------------------------- */
function tsTypeForColumnInTable(tableName, col) {
    const t = (col.type || "").toLowerCase();
    // Base SQL → TS mapping (extend as you like)
    let base;
    if (t.includes("int") || t === "serial" || t === "bigserial")
        base = "number";
    else if (t.includes("decimal") ||
        t.includes("numeric") ||
        t.includes("money"))
        base = "number";
    else if (t.includes("float") || t.includes("double") || t.includes("real"))
        base = "number";
    else if (t.includes("bool"))
        base = "boolean";
    else if (t.includes("json"))
        base = "unknown";
    else if (t.includes("date") || t.includes("time"))
        base = "string";
    else if (t.includes("uuid"))
        base = "string";
    else if (t.includes("char") || t.includes("text"))
        base = "string";
    else if (t.includes("binary") || t.includes("blob") || t.includes("bytea"))
        base = "string";
    else
        base = "unknown";
    // If this column has enum_values, **use the specific enum type**
    if (col.enum_values && col.enum_values.length) {
        const tn = safeType(tableName);
        const cn = safeType(col.name);
        base = `Enum_${tn}_${cn}`;
    }
    // Nullability (your shape: nullable=true means it can be null)
    return col.nullable ? `${base} | null` : base;
}
function enumRefForColumn(col) {
    // Type name: Enum_<Table>_<Column> — table name must be provided by caller; since we don't have it here,
    // we'll bake column-specific enums in emitEnumsFromColumns() with names that include table/column.
    // Here we just return a safe placeholder that matches the emitted name. We need the table name context,
    // so we’ll compute it in emitTableBlock instead. Workaround: we return "string" here and let enums be informational.
    // --- Alternative ---
    // For accurate refs, we resolve in emitTableBlock; so this function is unused there.
    return "string";
}
function isGenerated(col) {
    return (!!col.autoincrement || !!(col.generatedType && col.generatedType.trim()));
}
function hasDefault(col) {
    return col.default !== null && col.default !== undefined;
}
function isNotNull(col) {
    // your interface: nullable: boolean (true means nullable)
    return !col.nullable;
}
function getPrimaryKeyColumns(table) {
    const idx = (table.indexes ?? []).find((i) => i.is_primary);
    if (idx?.columns?.length)
        return idx.columns;
    // fallback: some DBs mark per column
    const byCol = table.columns
        .filter((c) => truthy(c.primary_key))
        .map((c) => c.name);
    return byCol;
}
function truthy(v) {
    return !!v && String(v).toLowerCase() !== "false" && String(v) !== "0";
}
/* --------------------------------- Utils --------------------------------- */
function safeProp(name) {
    return /^[A-Za-z_]\w*$/.test(name) ? name : JSON.stringify(name);
}
function safeType(name) {
    return name
        .replace(/[^A-Za-z0-9]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((s) => s[0].toUpperCase() + s.slice(1))
        .join("");
}
function sha(s) {
    return node_crypto_1.default.createHash("sha256").update(s).digest("hex");
}
function stripTsHeader(s) {
    return s.replace(/Generated at: .*?\n/, "Generated at: <redacted>\n");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXMuZ2VuZXJhdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy9nZW5lcmF0b3JzL3R5cGVzLmdlbmVyYXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQXNEQSx3REFrQ0M7QUF4RkQsc0RBQXlCO0FBQ3pCLDBEQUE2QjtBQUM3Qiw4REFBaUM7QUFRakMsa0RBQW9EO0FBWXBELE1BQU0saUJBQWlCLEdBQUcsVUFBVSxDQUFDO0FBRXJDLFNBQVMsaUJBQWlCLENBQUMsTUFBZTtJQUN4QyxNQUFNLElBQUksR0FBRyxNQUFNO1NBQ2hCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztTQUM3RCxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDZCxNQUFNLE9BQU8sR0FBRyxNQUFNO1NBQ25CLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztTQUNoRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDZCxNQUFNLE9BQU8sR0FBRyxNQUFNO1NBQ25CLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztTQUNoRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDZCxNQUFNLE9BQU8sR0FBRyxNQUFNO1NBQ25CLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztTQUNoRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDZCxNQUFNLEdBQUcsR0FBRyxNQUFNO1NBQ2YsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1NBQzVELElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNkLE1BQU0sSUFBSSxHQUFHLE1BQU07U0FDaEIsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1NBQ25FLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUVkLE9BQU87UUFDTCx3QkFBd0IsSUFBSSxNQUFNO1FBQ2xDLDJCQUEyQixPQUFPLE1BQU07UUFDeEMsMkJBQTJCLE9BQU8sTUFBTTtRQUN4QywyQkFBMkIsT0FBTyxNQUFNO1FBQ3hDLHVCQUF1QixHQUFHLE1BQU07UUFDaEMsOEJBQThCLElBQUksTUFBTTtLQUN6QyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNqQixDQUFDO0FBRUQsU0FBZ0Isc0JBQXNCLENBQ3BDLE1BQXFCLEVBQ3JCLE9BQWdCLEVBQUU7SUFFbEIsTUFBTSxFQUNKLE1BQU0sR0FBRyxNQUFNLDBCQUFjLEVBQUUsRUFDL0IsUUFBUSxHQUFHLGlCQUFpQixFQUM1QixpQkFBaUIsR0FBRyxJQUFJLEVBQ3hCLE1BQU0sRUFDTixjQUFjLEVBQ2QsZUFBZSxHQUFHLElBQUksR0FDdkIsR0FBRyxJQUFJLENBQUM7SUFFVCxNQUFNLE9BQU8sR0FBRyxtQkFBSSxDQUFDLE9BQU8sQ0FDMUIsaUJBQWlCLElBQUksT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQzdFLENBQUM7SUFDRixNQUFNLFNBQVMsR0FBRyxtQkFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDaEQsaUJBQUUsQ0FBQyxTQUFTLENBQUMsU0FBUyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFFN0MsTUFBTSxRQUFRLEdBQUcsbUJBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ2hELE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztJQUU1RCxJQUFJLGVBQWUsSUFBSSxpQkFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1FBQy9DLE1BQU0sR0FBRyxHQUFHLGlCQUFFLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMvQyxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3RFLElBQUksSUFBSTtZQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO0lBQ2hELENBQUM7SUFFRCxpQkFBRSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBRTlDLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUN6QyxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFFdEMsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUM7QUFDckMsQ0FBQztBQUVELDhFQUE4RTtBQUU5RSxTQUFTLG1CQUFtQixDQUFDLFNBQWlCLEVBQUUsUUFBZ0I7SUFDOUQsTUFBTSxHQUFHLEdBQUc7Ozs7NkJBSWUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLElBQUksT0FDM0Q7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBb0JILENBQUMsU0FBUyxFQUFFLENBQUM7SUFDWixNQUFNLE9BQU8sR0FBRyxtQkFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDcEQsaUJBQUUsQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUMxQyxDQUFDO0FBRUQsU0FBUyxNQUFNLENBQ2IsTUFBcUIsRUFDckIsR0FHQztJQUVELE1BQU0sR0FBRyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDckMsTUFBTSxNQUFNLEdBQUc7UUFDYixLQUFLO1FBQ0wsdUNBQXVDO1FBQ3ZDLG9CQUFvQixHQUFHLEVBQUU7UUFDekIsbUJBQW1CLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUU7UUFDaEQsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNO1lBQ1osQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDekQsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNQLEtBQUs7UUFDTCxFQUFFO0tBQ0gsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFYixNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQztJQUNuQyxNQUFNLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUVsRSxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ3RELE1BQU0sY0FBYyxHQUFHLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRWxELGtFQUFrRTtJQUNsRSxNQUFNLFVBQVUsR0FBRyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUVoRCwrQ0FBK0M7SUFDL0MsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsY0FBYyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUUzRSxzREFBc0Q7SUFDdEQsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLGNBQWM7UUFDdEMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUM7UUFDOUMsQ0FBQyxDQUFDLDZDQUE2QyxDQUFDO0lBRWxELE1BQU0sYUFBYSxHQUFHLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRWhELE9BQU87UUFDTCxNQUFNO1FBQ04sc0RBQXNEO1FBQ3RELEVBQUU7UUFDRixVQUFVO1FBQ1YsRUFBRTtRQUNGLGNBQWM7UUFDZCxFQUFFO1FBQ0YsVUFBVSxJQUFJLDZCQUE2QjtRQUMzQyxFQUFFO1FBQ0YsUUFBUTtRQUNSLEVBQUU7UUFDRixhQUFhO1FBQ2IsRUFBRTtRQUNGLGFBQWE7UUFDYixFQUFFO1FBQ0YsNEJBQTRCO1FBQzVCLEVBQUU7S0FDSCxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNmLENBQUM7QUFFRCwrRUFBK0U7QUFFL0UsU0FBUyxTQUFTLENBQUMsSUFBWSxFQUFFLE1BQWdCO0lBQy9DLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTTtRQUFFLE9BQU8sZUFBZSxJQUFJLFdBQVcsQ0FBQztJQUMxRCxPQUFPLGVBQWUsSUFBSSxPQUFPLE1BQU07U0FDcEMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztTQUN0QyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztBQUNuQixDQUFDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxNQUFlO0lBQ3pDLE1BQU0sSUFBSSxHQUFHLE1BQU07U0FDaEIsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7UUFDVCxNQUFNLElBQUksR0FDUixhQUFhLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksT0FBTyxDQUFDO1FBQ3JGLE9BQU8sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksR0FBRyxDQUFDO0lBQzNDLENBQUMsQ0FBQztTQUNELElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNkLE9BQU8sbUNBQW1DLElBQUksTUFBTSxDQUFDO0FBQ3ZELENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxPQUFpQjtJQUN0QyxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBQy9CLE1BQU0sR0FBRyxHQUFhLEVBQUUsQ0FBQztJQUN6QixLQUFLLE1BQU0sQ0FBQyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQ3hCLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQUUsU0FBUztRQUMvQixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQixHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2QsQ0FBQztJQUNELE9BQU8sR0FBRyxDQUFDO0FBQ2IsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsTUFBZTtJQUMzQyxNQUFNLE1BQU0sR0FBYSxFQUFFLENBQUM7SUFDNUIsS0FBSyxNQUFNLENBQUMsSUFBSSxNQUFNLEVBQUUsQ0FBQztRQUN2QixLQUFLLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDMUMsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDNUIsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDNUIsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3RFLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxFQUFFLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQztZQUMxRCxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDM0IsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQVksRUFBRSxTQUFrQjtJQUN0RCxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRS9CLE1BQU07SUFDTixNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsT0FBTztTQUMxQixHQUFHLENBQ0YsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQzFFO1NBQ0EsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2QsTUFBTSxHQUFHLEdBQUcsbUJBQW1CLENBQUMsU0FBUyxPQUFPLE1BQU0sQ0FBQztJQUV2RCwrREFBK0Q7SUFDL0QsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLE9BQU87U0FDN0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUM5QixHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtRQUNULE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRCxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FDN0MsS0FBSyxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDbEQsQ0FBQyxDQUFDO1NBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2QsTUFBTSxNQUFNLEdBQUcsc0JBQXNCLENBQUMsU0FBUyxVQUFVLE1BQU0sQ0FBQztJQUVoRSw0REFBNEQ7SUFDNUQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLE9BQU87U0FDN0IsR0FBRyxDQUNGLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sc0JBQXNCLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUMzRTtTQUNBLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNkLE1BQU0sTUFBTSxHQUFHLHNCQUFzQixDQUFDLFNBQVMsVUFBVSxNQUFNLENBQUM7SUFFaEUsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLE9BQU87U0FDN0IsR0FBRyxDQUNGLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sc0JBQXNCLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUMzRTtTQUNBLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNkLE1BQU0sVUFBVSxHQUFHLHNCQUFzQixDQUFDLFNBQVMsVUFBVSxNQUFNLENBQUM7SUFFcEUsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDM0MsTUFBTSxFQUFFLEdBQ04sTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDO1FBQ2YsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLE1BQU0sTUFBTTthQUM5QixHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDN0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHO1FBQ2pCLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLENBQUM7SUFFckMsc0RBQXNEO0lBQ3RELE1BQU0sU0FBUyxHQUFHLENBQUMsS0FBSyxDQUFDLFdBQVcsSUFBSSxFQUFFLENBQUM7U0FDeEMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDO1NBQ3JFLEdBQUcsQ0FDRixDQUFDLENBQUMsRUFBRSxFQUFFLENBQ0osS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLFNBQVMsQ0FDcEQsQ0FBQyxDQUFDLFNBQVUsQ0FBQyxLQUFLLENBQ25CLGdCQUFnQixJQUFJLENBQUMsU0FBUyxDQUM3QixDQUFDLENBQUMsU0FBVSxDQUFDLE1BQU0sQ0FDcEIsZUFBZSxJQUFJLENBQUMsU0FBUyxDQUM1QixDQUFDLENBQUMsUUFBUSxDQUNYLGVBQWUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLHVCQUF1QixJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQ3BKLENBQUM7SUFFSixNQUFNLEdBQUcsR0FDUCxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUM7UUFDbEIsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLFNBQVMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTTtRQUMvRCxDQUFDLENBQUMseUJBQXlCLENBQUMsMkJBQTJCLENBQUM7SUFFNUQsT0FBTyxDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ2pFLENBQUM7QUFFRCxTQUFTLHdCQUF3QixDQUMvQixjQUEwRDtJQUUxRCxnQkFBZ0I7SUFDaEIsTUFBTSxNQUFNLEdBQUcsY0FBYztTQUMxQixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxhQUFhLElBQUksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxTQUFTLEtBQUssS0FBSyxDQUFDO1NBQ3JFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN0QyxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsTUFBTTtRQUMvQixDQUFDLENBQUMsOEJBQThCLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUc7UUFDckQsQ0FBQyxDQUFDLG1DQUFtQyxDQUFDO0lBRXhDLDZCQUE2QjtJQUM3QixNQUFNLGNBQWMsR0FBYSxFQUFFLENBQUM7SUFDcEMsS0FBSyxNQUFNLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUMvQixNQUFNLFlBQVksR0FDaEIsQ0FBQyxDQUFDLE9BQU87WUFDUCxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUM7WUFDMUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQy9DLE1BQU0sRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDNUIsY0FBYyxDQUFDLElBQUksQ0FDakIsK0JBQStCLEVBQUUsTUFBTSxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUN4RixHQUFHLENBQ0osQ0FBQztJQUNKLENBQUM7SUFFRCxPQUFPLENBQUMsV0FBVyxFQUFFLEdBQUcsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3JELENBQUM7QUFFRCwrRUFBK0U7QUFFL0UsU0FBUyxzQkFBc0IsQ0FBQyxTQUFpQixFQUFFLEdBQVc7SUFDNUQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBRXpDLDZDQUE2QztJQUM3QyxJQUFJLElBQVksQ0FBQztJQUNqQixJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLFFBQVEsSUFBSSxDQUFDLEtBQUssV0FBVztRQUFFLElBQUksR0FBRyxRQUFRLENBQUM7U0FDekUsSUFDSCxDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztRQUNyQixDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztRQUNyQixDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztRQUVuQixJQUFJLEdBQUcsUUFBUSxDQUFDO1NBQ2IsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFDeEUsSUFBSSxHQUFHLFFBQVEsQ0FBQztTQUNiLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFBRSxJQUFJLEdBQUcsU0FBUyxDQUFDO1NBQ3pDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFBRSxJQUFJLEdBQUcsU0FBUyxDQUFDO1NBQ3pDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztRQUFFLElBQUksR0FBRyxRQUFRLENBQUM7U0FDOUQsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztRQUFFLElBQUksR0FBRyxRQUFRLENBQUM7U0FDeEMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQUUsSUFBSSxHQUFHLFFBQVEsQ0FBQztTQUM5RCxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztRQUN4RSxJQUFJLEdBQUcsUUFBUSxDQUFDOztRQUNiLElBQUksR0FBRyxTQUFTLENBQUM7SUFFdEIsaUVBQWlFO0lBQ2pFLElBQUksR0FBRyxDQUFDLFdBQVcsSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQzlDLE1BQU0sRUFBRSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMvQixNQUFNLEVBQUUsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlCLElBQUksR0FBRyxRQUFRLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsK0RBQStEO0lBQy9ELE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ2hELENBQUM7QUFFRCxTQUFTLGdCQUFnQixDQUFDLEdBQVc7SUFDbkMseUdBQXlHO0lBQ3pHLG1HQUFtRztJQUNuRyx3R0FBd0c7SUFDeEcscUhBQXFIO0lBQ3JILHNCQUFzQjtJQUN0QixxRkFBcUY7SUFDckYsT0FBTyxRQUFRLENBQUM7QUFDbEIsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUFDLEdBQVc7SUFDOUIsT0FBTyxDQUNMLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUN6RSxDQUFDO0FBQ0osQ0FBQztBQUNELFNBQVMsVUFBVSxDQUFDLEdBQVc7SUFDN0IsT0FBTyxHQUFHLENBQUMsT0FBTyxLQUFLLElBQUksSUFBSSxHQUFHLENBQUMsT0FBTyxLQUFLLFNBQVMsQ0FBQztBQUMzRCxDQUFDO0FBQ0QsU0FBUyxTQUFTLENBQUMsR0FBVztJQUM1QiwwREFBMEQ7SUFDMUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUM7QUFDdkIsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsS0FBWTtJQUN4QyxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDbkUsSUFBSSxHQUFHLEVBQUUsT0FBTyxFQUFFLE1BQU07UUFBRSxPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUM7SUFDN0MscUNBQXFDO0lBQ3JDLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxPQUFPO1NBQ3hCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQztTQUNwQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN0QixPQUFPLEtBQUssQ0FBQztBQUNmLENBQUM7QUFFRCxTQUFTLE1BQU0sQ0FBQyxDQUFVO0lBQ3hCLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssT0FBTyxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDekUsQ0FBQztBQUVELCtFQUErRTtBQUUvRSxTQUFTLFFBQVEsQ0FBQyxJQUFZO0lBQzVCLE9BQU8sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDbkUsQ0FBQztBQUVELFNBQVMsUUFBUSxDQUFDLElBQVk7SUFDNUIsT0FBTyxJQUFJO1NBQ1IsT0FBTyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQztTQUM5QixLQUFLLENBQUMsR0FBRyxDQUFDO1NBQ1YsTUFBTSxDQUFDLE9BQU8sQ0FBQztTQUNmLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDM0MsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ2QsQ0FBQztBQUVELFNBQVMsR0FBRyxDQUFDLENBQVM7SUFDcEIsT0FBTyxxQkFBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQzdELENBQUM7QUFDRCxTQUFTLGFBQWEsQ0FBQyxDQUFTO0lBQzlCLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO0FBQ3hFLENBQUMifQ==