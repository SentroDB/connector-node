import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  SchemaDetails,
  Table,
  Column,
  Index,
  Customization,
} from "@sentrodb/connector-node-types";
import { ADMIN_DIR_NAME } from "../utils/constants";

type GenOpts = {
  /** Defaults to writing one directory up from require.main.path (next to your JSON). */
  outDir?: string; // default: "../"
  fileName?: string; // default: "types.ts"
  preferRequireMain?: boolean; // default: true
  banner?: string; // optional header lines
  customizations?: Customization<DBManagerSchema.TableName>[]; // optional – to derive helpers (hidden tables, readonly cols)
  skipIfUnchanged?: boolean; // default: true
};

const DEFAULT_FILE_NAME = "types.ts";

function emitAggregateMaps(tables: Table[]): string {
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

export function generateDbManagerTypes(
  schema: SchemaDetails,
  opts: GenOpts = {}
): { filePath: string; written: boolean } {
  const {
    outDir = `../${ADMIN_DIR_NAME}`,
    fileName = DEFAULT_FILE_NAME,
    preferRequireMain = true,
    banner,
    customizations,
    skipIfUnchanged = true,
  } = opts;

  const rootDir = path.resolve(
    preferRequireMain && require?.main?.path ? require.main.path : process.cwd()
  );
  const outputDir = path.resolve(rootDir, outDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const filePath = path.join(outputDir, fileName);
  const contents = render(schema, { banner, customizations });

  if (skipIfUnchanged && fs.existsSync(filePath)) {
    const old = fs.readFileSync(filePath, "utf-8");
    const same = sha(stripTsHeader(old)) === sha(stripTsHeader(contents));
    if (same) return { filePath, written: false };
  }

  fs.writeFileSync(filePath, contents, "utf-8");

  generateGlobalTypes(outputDir, fileName);
  console.log("Global types generated");

  return { filePath, written: true };
}

/* ------------------------------------------------------------------------ */

function generateGlobalTypes(outputDir: string, fileName: string): void {
  const dts = `
// AUTO-GENERATED — DO NOT EDIT.
// This file binds the generated TableName to the global Schema namespace.

import type * as T from "./${fileName?.replace(/\.ts$/, "") ?? "types"
    }";

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
  const dtsFile = path.join(outputDir, "global.d.ts");
  fs.writeFileSync(dtsFile, dts, "utf-8");
}

function render(
  schema: SchemaDetails,
  ctx: {
    banner?: string;
    customizations?: Customization<DBManagerSchema.TableName>[];
  }
): string {
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

function emitUnion(name: string, values: string[]): string {
  if (!values.length) return `export type ${name} = never;`;
  return `export type ${name} =\n${values
    .map((v) => `  | ${JSON.stringify(v)}`)
    .join("\n")};`;
}

function emitColumnsByTable(tables: Table[]): string {
  const body = tables
    .map((t) => {
      const cols =
        dedupeColumns(t.columns).map((c) => JSON.stringify(c.name)).join(" | ") || "never";
      return `  ${safeProp(t.name)}: ${cols};`;
    })
    .join("\n");
  return `export type ColumnsByTable = {\n${body}\n};`;
}

function dedupeColumns(columns: Column[]): Column[] {
  const seen = new Set<string>();
  const out: Column[] = [];
  for (const c of columns) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
  }
  return out;
}

function emitEnumsFromColumns(tables: Table[]): string {
  const blocks: string[] = [];
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

function emitTableBlock(table: Table, allTables: Table[]): string {
  const T = safeType(table.name);

  // Row
  const rowBody = table.columns
    .map(
      (c) => `  ${safeProp(c.name)}: ${tsTypeForColumnInTable(table.name, c)};`
    )
    .join("\n");
  const row = `export type Row_${T} = {\n${rowBody}\n};`;

  // Insert (omit generated; required if NOT NULL and no default)
  const insertBody = table.columns
    .filter((c) => !isGenerated(c))
    .map((c) => {
      const required = isNotNull(c) && !hasDefault(c);
      return `  ${safeProp(c.name)}${required ? "" : "?"
        }: ${tsTypeForColumnInTable(table.name, c)};`;
    })
    .join("\n");
  const insert = `export type Insert_${T} = {\n${insertBody}\n};`;

  // Update (all optional; enforce PK in handlers if you want)
  const updateBody = table.columns
    .map(
      (c) => `  ${safeProp(c.name)}?: ${tsTypeForColumnInTable(table.name, c)};`
    )
    .join("\n");
  const update = `export type Update_${T} = {\n${updateBody}\n};`;

  const deleteBody = table.columns
    .map(
      (c) => `  ${safeProp(c.name)}?: ${tsTypeForColumnInTable(table.name, c)};`
    )
    .join("\n");
  const deleteType = `export type Delete_${T} = {\n${deleteBody}\n};`;

  const pkCols = getPrimaryKeyColumns(table);
  const pk =
    pkCols.length > 0
      ? `export type PK_${T} = ${pkCols
        .map((c) => JSON.stringify(c))
        .join(" | ")};`
      : `export type PK_${T} = never;`;

  // Relations: from constraints where reference != null
  const fkEntries = (table.constraints ?? [])
    .filter((k) => k.reference && k.reference.table && k.reference.column)
    .map(
      (k) =>
        `  ${safeProp(k.column)}: { refTable: ${JSON.stringify(
          k.reference!.table
        )}; refColumn: ${JSON.stringify(
          k.reference!.column
        )}; onUpdate: ${JSON.stringify(
          k.onUpdate
        )}; onDelete: ${JSON.stringify(k.onDelete)}; relationshipType: ${JSON.stringify(k.relationshipType)}; isUnique: ${JSON.stringify(k.isUnique)} };`
    );

  const rel =
    fkEntries.length > 0
      ? `export type Relations_${T} = {\n${fkEntries.join("\n")}\n};`
      : `export type Relations_${T} = Record<string, never>;`;

  return [row, insert, update, deleteType, pk, rel].join("\n\n");
}

function emitCustomizationHelpers(
  customizations: Customization<DBManagerSchema.TableName>[]
): string {
  // Hidden tables
  const hidden = customizations
    .filter((t) => t.customization && t.customization.isVisible === false)
    .map((t) => JSON.stringify(t.name));
  const hiddenBlock = hidden.length
    ? `export type HiddenTables = ${hidden.join(" | ")};`
    : `export type HiddenTables = never;`;

  // Readonly columns per table
  const perTableBlocks: string[] = [];
  for (const t of customizations) {
    const readOnlyCols =
      t.columns
        ?.filter((c) => c.customization?.readOnly)
        ?.map((c) => JSON.stringify(c.name)) ?? [];
    const tn = safeType(t.name);
    perTableBlocks.push(
      `export type ReadonlyColumns_${tn} = ${readOnlyCols.length ? readOnlyCols.join(" | ") : "never"
      };`
    );
  }

  return [hiddenBlock, ...perTableBlocks].join("\n");
}

/* --------------------------------- Rules --------------------------------- */

function tsTypeForColumnInTable(tableName: string, col: Column): string {
  const t = (col.type || "").toLowerCase();

  // Base SQL → TS mapping (extend as you like)
  let base: string;
  if (t.includes("int") || t === "serial" || t === "bigserial") base = "number";
  else if (
    t.includes("decimal") ||
    t.includes("numeric") ||
    t.includes("money")
  )
    base = "number";
  else if (t.includes("float") || t.includes("double") || t.includes("real"))
    base = "number";
  else if (t.includes("bool")) base = "boolean";
  else if (t.includes("json")) base = "unknown";
  else if (t.includes("date") || t.includes("time")) base = "string";
  else if (t.includes("uuid")) base = "string";
  else if (t.includes("char") || t.includes("text")) base = "string";
  else if (t.includes("binary") || t.includes("blob") || t.includes("bytea"))
    base = "string";
  else base = "unknown";

  // If this column has enum_values, **use the specific enum type**
  if (col.enum_values && col.enum_values.length) {
    const tn = safeType(tableName);
    const cn = safeType(col.name);
    base = `Enum_${tn}_${cn}`;
  }

  // Nullability (your shape: nullable=true means it can be null)
  return col.nullable ? `${base} | null` : base;
}

function enumRefForColumn(col: Column): string {
  // Type name: Enum_<Table>_<Column> — table name must be provided by caller; since we don't have it here,
  // we'll bake column-specific enums in emitEnumsFromColumns() with names that include table/column.
  // Here we just return a safe placeholder that matches the emitted name. We need the table name context,
  // so we’ll compute it in emitTableBlock instead. Workaround: we return "string" here and let enums be informational.
  // --- Alternative ---
  // For accurate refs, we resolve in emitTableBlock; so this function is unused there.
  return "string";
}

function isGenerated(col: Column): boolean {
  return (
    !!col.autoincrement || !!(col.generatedType && col.generatedType.trim())
  );
}
function hasDefault(col: Column): boolean {
  return col.default !== null && col.default !== undefined;
}
function isNotNull(col: Column): boolean {
  // your interface: nullable: boolean (true means nullable)
  return !col.nullable;
}

function getPrimaryKeyColumns(table: Table): string[] {
  const idx = (table.indexes ?? []).find((i: Index) => i.is_primary);
  if (idx?.columns?.length) return idx.columns;
  // fallback: some DBs mark per column
  const byCol = table.columns
    .filter((c) => truthy(c.primary_key))
    .map((c) => c.name);
  return byCol;
}

function truthy(v: unknown): boolean {
  return !!v && String(v).toLowerCase() !== "false" && String(v) !== "0";
}

/* --------------------------------- Utils --------------------------------- */

function safeProp(name: string): string {
  return /^[A-Za-z_]\w*$/.test(name) ? name : JSON.stringify(name);
}

function safeType(name: string): string {
  return name
    .replace(/[^A-Za-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join("");
}

function sha(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function stripTsHeader(s: string): string {
  return s.replace(/Generated at: .*?\n/, "Generated at: <redacted>\n");
}
