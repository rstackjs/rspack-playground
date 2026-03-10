export interface RspackDependency {
  type?: string;
  targetModule?: string;
  targetModuleName?: string;
  userRequest?: string;
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  [key: string]: any;
}

export interface RspackBlock {
  dependencies?: RspackDependency[];
  [key: string]: any;
}

export interface RspackModuleDeps {
  path: string;
  name: string;
  deps: RspackDependency[];
  presentationalDeps?: RspackDependency[];
  blocks?: RspackBlock[];
}

export class DependenciesPlugin {
  extractedModules: RspackModuleDeps[] = [];

  apply(compiler: any) {
    function extractDep(dep: any, moduleGraph: any): RspackDependency {
      const raw = getRawData(dep);
      try {
        const target = moduleGraph?.getModule?.(dep);
        if (target) {
          const targetPath = target.resource || target.identifier?.() || "";
          raw.targetModule = targetPath;
          // Strip leading slash to match input file tab names
          raw.targetModuleName = targetPath.startsWith("/")
            ? targetPath.slice(1)
            : targetPath;
        }
      } catch { /* ignore */ }
      return raw;
    }

    compiler.hooks.compilation.tap("DepsExtractor", (compilation: any) => {
      compilation.hooks.optimizeChunkModules.tap(
        "DepsExtractor",
        () => {
          try {
            const modules = compilation.modules;
            const moduleGraph = compilation.moduleGraph;
            if (!modules) return;

            this.extractedModules = [...modules].map((mod: any) => {
              const modulePath = mod.resource || mod.identifier?.() || "";

              const deps: RspackDependency[] = (mod.dependencies || []).map(
                (dep: any) => extractDep(dep, moduleGraph),
              );

              const presentationalDeps: RspackDependency[] = (mod.presentationalDependencies || []).map(
                (dep: any) => extractDep(dep, moduleGraph),
              );

              const blocks: any[] = (mod.blocks || []).map((block: any) => {
                const serialized = getRawData(block);
                serialized.dependencies = (block.dependencies || []).map(
                  (dep: any) => extractDep(dep, moduleGraph),
                );
                return serialized;
              });

              return {
                path: modulePath,
                name: modulePath,
                deps,
                presentationalDeps,
                blocks,
              };
            });
          } catch (e) {
            console.warn("[DepsExtractor] Failed to extract deps:", e);
          }
        },
      );
    });
  }
}

/**
 * Safely serialize a dependency/block object from rspack internals.
 * Handles circular references, functions, and huge internal objects.
 */
function getRawData(obj: any): any {
  const seen = new WeakSet();

  const serialize = (val: any): any => {
    if (val === null || val === undefined) return val;
    if (typeof val !== "object" && typeof val !== "function") return val;
    if (typeof val === "function") return undefined;
    if (seen.has(val)) return "[Circular]";
    seen.add(val);

    if (Array.isArray(val)) return val.map(serialize);
    if (val instanceof Set) return Array.from(val).map(serialize);
    if (val instanceof Map) {
      const o: Record<string, any> = {};
      for (const [k, v] of val) o[String(k)] = serialize(v);
      return o;
    }

    const result: Record<string, any> = {};
    const allKeys = new Set<string>();
    let cur = val;
    while (cur && cur !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(cur)) allKeys.add(key);
      cur = Object.getPrototypeOf(cur);
    }

    for (const key of allKeys) {
      if (key === "constructor" || key.startsWith("_") || key === "compilation") continue;
      try {
        const v = val[key];
        if (typeof v === "function") continue;
        result[key] = serialize(v);
      } catch {
        // skip inaccessible properties
      }
    }
    return result;
  };

  return serialize(obj);
}