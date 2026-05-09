import path from "path";
import fs from "graceful-fs";
import type { ViewConfig, ViewWithTemplate } from "@sentrodb/connector-node-types";
import { VIEWS_DIR_NAME } from "../utils/constants";
import { findProjectRoot } from "../utils/file-handler";

const CONFIG_EXT = ".json";
const TEMPLATE_EXT_BY_ENGINE: Record<ViewConfig["engine"], string> = {
  ejs: ".ejs",
};

export class ViewsStore {
  static #ViewsStore: ViewsStore;

  static get instance() {
    if (!this.#ViewsStore) {
      this.#ViewsStore = new ViewsStore();
    }
    return this.#ViewsStore;
  }

  private get dir(): string {
    return path.join(findProjectRoot(), VIEWS_DIR_NAME);
  }

  private ensureDir(): void {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  public list(): ViewConfig[] {
    this.ensureDir();
    const entries = fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(CONFIG_EXT));

    return entries
      .map((file) => this.readConfig(path.basename(file, CONFIG_EXT)))
      .filter((v): v is ViewConfig => v !== null);
  }

  public get(slug: string): ViewWithTemplate | null {
    const config = this.readConfig(slug);
    if (!config) return null;

    const template = this.readTemplate(slug, config.engine);
    return { ...config, template };
  }

  public create(
    input: Omit<ViewConfig, "createdAt" | "updatedAt"> & { template: string }
  ): ViewWithTemplate {
    const existing = this.readConfig(input.slug);
    if (existing) {
      const err: any = new Error(`View "${input.slug}" already exists`);
      err.status = 409;
      throw err;
    }

    const now = new Date().toISOString();
    const config: ViewConfig = {
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

  public update(
    slug: string,
    patch: Partial<Omit<ViewConfig, "slug" | "createdAt">> & { template?: string }
  ): ViewWithTemplate {
    const existing = this.readConfig(slug);
    if (!existing) {
      const err: any = new Error(`View "${slug}" not found`);
      err.status = 404;
      throw err;
    }

    const nextEngine = patch.engine ?? existing.engine;

    const config: ViewConfig = {
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

    const template =
      patch.template !== undefined
        ? (this.writeTemplate(slug, nextEngine, patch.template), patch.template)
        : this.readTemplate(slug, nextEngine);

    return { ...config, template };
  }

  public delete(slug: string): boolean {
    const existing = this.readConfig(slug);
    if (!existing) return false;

    this.deleteConfig(slug);
    this.deleteTemplate(slug, existing.engine);
    return true;
  }

  // ─── File I/O ───────────────────────────────────────────────────────

  private readConfig(slug: string): ViewConfig | null {
    const file = path.join(this.dir, `${slug}${CONFIG_EXT}`);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8")) as ViewConfig;
    } catch (e) {
      console.error(`Failed to parse view config ${file}:`, e);
      return null;
    }
  }

  private writeConfig(config: ViewConfig): void {
    this.ensureDir();
    const file = path.join(this.dir, `${config.slug}${CONFIG_EXT}`);
    fs.writeFileSync(file, JSON.stringify(config, null, 2), "utf-8");
  }

  private deleteConfig(slug: string): void {
    const file = path.join(this.dir, `${slug}${CONFIG_EXT}`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  private readTemplate(slug: string, engine: ViewConfig["engine"]): string {
    const file = path.join(this.dir, `${slug}${TEMPLATE_EXT_BY_ENGINE[engine]}`);
    if (!fs.existsSync(file)) return "";
    return fs.readFileSync(file, "utf-8");
  }

  private writeTemplate(
    slug: string,
    engine: ViewConfig["engine"],
    template: string
  ): void {
    this.ensureDir();
    const file = path.join(this.dir, `${slug}${TEMPLATE_EXT_BY_ENGINE[engine]}`);
    fs.writeFileSync(file, template, "utf-8");
  }

  private deleteTemplate(slug: string, engine: ViewConfig["engine"]): void {
    const file = path.join(this.dir, `${slug}${TEMPLATE_EXT_BY_ENGINE[engine]}`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
