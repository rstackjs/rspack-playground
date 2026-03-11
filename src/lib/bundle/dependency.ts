// biome-ignore-all lint/suspicious/noExplicitAny: Rspack internal objects are untyped
export interface RspackDependency {
  type?: string;
  targetModule?: string;
  targetModuleName?: string;
  userRequest?: string;
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  [key: string]: unknown;
}

export interface RspackBlock {
  dependencies?: RspackDependency[];
  [key: string]: unknown;
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

  apply(compiler: unknown) {
    function extractDep(dep: unknown, moduleGraph: unknown): RspackDependency {
      const raw = getRawData(dep) as RspackDependency;
      try {
        const target = (moduleGraph as any)?.getModule?.(dep);
        if (target) {
          const targetPath =
            (target as any).resource || (target as any).identifier?.() || "";
          raw.targetModule = targetPath;
          // Strip leading slash to match input file tab names
          raw.targetModuleName = targetPath.startsWith("/")
            ? targetPath.slice(1)
            : targetPath;
        }
      } catch {
        /* ignore */
      }
      return raw;
    }

    (compiler as any).hooks.compilation.tap(
      "DepsExtractor",
      (compilation: unknown) => {
        (compilation as any).hooks.optimizeChunkModules.tap(
          "DepsExtractor",
          () => {
            try {
              const modules = (compilation as any).modules;
              const moduleGraph = (compilation as any).moduleGraph;
              if (!modules) return;

              this.extractedModules = Array.from(
                modules as Iterable<unknown>,
              ).map((mod: unknown) => {
                const modulePath =
                  (mod as any).resource || (mod as any).identifier?.() || "";

                const deps: RspackDependency[] = (
                  (mod as any).dependencies || []
                ).map((dep: unknown) => extractDep(dep, moduleGraph));

                const presentationalDeps: RspackDependency[] = (
                  (mod as any).presentationalDependencies || []
                ).map((dep: unknown) => extractDep(dep, moduleGraph));

                const blocks: RspackBlock[] = ((mod as any).blocks || []).map(
                  (block: unknown) => {
                    const serialized = getRawData(block) as RspackBlock;
                    serialized.dependencies = (
                      (block as any).dependencies || []
                    ).map((dep: unknown) => extractDep(dep, moduleGraph));
                    return serialized;
                  },
                );

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
      },
    );
  }
}

/**
 * Safely serialize a dependency/block object from rspack internals.
 * Handles circular references, functions, and huge internal objects.
 */
function getRawData(obj: unknown): unknown {
  const seen = new WeakSet<object>();

  const serialize = (val: unknown): unknown => {
    if (val === null || val === undefined) return val;
    if (typeof val !== "object" && typeof val !== "function") return val;
    if (typeof val === "function") return undefined;
    if (seen.has(val)) return "[Circular]";
    seen.add(val);

    if (Array.isArray(val)) return val.map(serialize);
    if (val instanceof Set) return Array.from(val).map(serialize);
    if (val instanceof Map) {
      const o: Record<string, unknown> = {};
      for (const [k, v] of val) o[String(k)] = serialize(v);
      return o;
    }

    const result: Record<string, unknown> = {};
    const allKeys = new Set<string>();
    let cur = val;
    while (cur && cur !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(cur)) allKeys.add(key);
      cur = Object.getPrototypeOf(cur);
    }

    for (const key of allKeys) {
      if (key === "constructor" || key.startsWith("_") || key === "compilation")
        continue;
      try {
        const v = (val as Record<string, unknown>)[key];
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
