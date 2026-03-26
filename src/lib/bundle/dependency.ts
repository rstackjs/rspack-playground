// biome-ignore-all lint/suspicious/noExplicitAny: Rspack internal objects are untyped
import { normalizePath } from "@/lib/normalizePath";

export type RspackModuleCategory = "source" | "dependency" | "runtime";

export interface RspackDependency {
  type?: string;
  targetModule?: string;
  targetModuleId?: string;
  targetModuleName?: string;
  targetModuleCategory?: RspackModuleCategory;
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
  id: string;
  path: string;
  name: string;
  category: RspackModuleCategory;
  deps: RspackDependency[];
  presentationalDeps?: RspackDependency[];
  blocks?: RspackBlock[];
}

export interface RspackChunkModuleRef {
  id: string;
  path: string;
  name: string;
  category: RspackModuleCategory;
}

export interface RspackChunkInfo {
  id: string;
  name: string;
  files: string[];
  runtime: string[];
  entry: boolean;
  initial: boolean;
  groups: string[];
  modules: RspackChunkModuleRef[];
}

export interface RspackChunkGroupInfo {
  id: string;
  name: string;
  initial: boolean;
  parents: string[];
  children: string[];
  chunks: string[];
  origins: string[];
}

export class DependenciesPlugin {
  extractedModules: RspackModuleDeps[] = [];
  extractedChunks: RspackChunkInfo[] = [];
  extractedChunkGroups: RspackChunkGroupInfo[] = [];

  apply(compiler: unknown) {
    function extractDep(dep: unknown, moduleGraph: unknown): RspackDependency {
      const raw = getRawData(dep) as RspackDependency;
      try {
        const target = (moduleGraph as any)?.getModule?.(dep);
        if (target) {
          raw.targetModule = getModulePath(target);
          raw.targetModuleId = getModuleId(target);
          raw.targetModuleName = getModuleName(target);
          raw.targetModuleCategory = getModuleCategory(target);
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
              const modules = toArray((compilation as any).modules);
              const moduleGraph = (compilation as any).moduleGraph;
              const chunkGraph = (compilation as any).chunkGraph;
              const chunks = toArray((compilation as any).chunks);
              const chunkGroups = getChunkGroups(compilation, chunks);

              this.extractedModules = modules.map((mod: unknown) => {
                const modulePath = getModulePath(mod);

                const deps: RspackDependency[] = toArray(
                  (mod as any).dependencies,
                ).map((dep: unknown) => extractDep(dep, moduleGraph));

                const presentationalDeps: RspackDependency[] = toArray(
                  (mod as any).presentationalDependencies,
                ).map((dep: unknown) => extractDep(dep, moduleGraph));

                const blocks: RspackBlock[] = toArray((mod as any).blocks).map(
                  (block: unknown) => {
                    const serialized = getRawData(block) as RspackBlock;
                    serialized.dependencies = toArray(
                      (block as any).dependencies,
                    ).map((dep: unknown) => extractDep(dep, moduleGraph));
                    return serialized;
                  },
                );

                return {
                  id: getModuleId(mod),
                  path: modulePath,
                  name: getModuleName(mod),
                  category: getModuleCategory(mod),
                  deps,
                  presentationalDeps,
                  blocks,
                };
              });

              const chunkGroupIdCache = new Map<any, string>();
              const getChunkGroupId = (group: unknown) => {
                if (chunkGroupIdCache.has(group)) {
                  return chunkGroupIdCache.get(group) ?? "";
                }

                const rawId =
                  (group as any)?.ukey ??
                  (group as any)?.groupDebugId ??
                  (group as any)?.index ??
                  (group as any)?.name ??
                  (group as any)?.options?.name ??
                  `group-${chunkGroupIdCache.size}`;
                const id = String(rawId);
                chunkGroupIdCache.set(group, id);
                return id;
              };

              const getChunkFallbackUkey = (
                chunk: unknown,
                fallbackIndex?: number,
              ) => {
                const directUkey =
                  (chunk as any)?.ukey ??
                  (chunk as any)?.debugId ??
                  (chunk as any)?.chunkDebugId;
                if (directUkey !== undefined && directUkey !== null && directUkey !== "") {
                  return String(directUkey);
                }

                if (fallbackIndex !== undefined) {
                  return `chunk-${fallbackIndex}`;
                }

                return "";
              };

              const chunkIdCache = new Map<any, string>();
              const getChunkId = (chunk: unknown) => {
                if (chunkIdCache.has(chunk)) {
                  return chunkIdCache.get(chunk) ?? "";
                }

                const files = toArray((chunk as any)?.files).map(String);
                const explicitId =
                  (chunk as any)?.id ?? toArray((chunk as any)?.ids)[0];
                const fallbackUkey = getChunkFallbackUkey(chunk, chunkIdCache.size);
                const rawId =
                  explicitId !== undefined && explicitId !== null && explicitId !== ""
                    ? explicitId
                    : fallbackUkey || (chunk as any)?.name || files[0] ||
                  `chunk-${chunkIdCache.size}`;
                const id = String(rawId);
                chunkIdCache.set(chunk, id);
                return id;
              };

              this.extractedChunks = chunks
                .map((chunk: unknown) => {
                  const modulesInChunk = getChunkModules(chunk, chunkGraph);
                  const chunkModules = new Map<string, RspackChunkModuleRef>();

                  for (const mod of modulesInChunk) {
                    const id = getModuleId(mod);
                    if (!id || chunkModules.has(id)) continue;
                    chunkModules.set(id, {
                      id,
                      path: getModulePath(mod),
                      name: getModuleName(mod),
                      category: getModuleCategory(mod),
                    });
                  }

                  const id = getChunkId(chunk);
                  return {
                    id,
                    name: getChunkName(chunk, id, getChunkFallbackUkey(chunk)),
                    files: toArray((chunk as any)?.files).map(String).sort(),
                    runtime: toArray((chunk as any)?.runtime).map(String).sort(),
                    entry: isChunkEntry(chunk),
                    initial: isChunkInitial(chunk),
                    groups: toArray((chunk as any)?.groupsIterable)
                      .map(getChunkGroupId)
                      .filter(Boolean)
                      .sort(),
                    modules: [...chunkModules.values()].sort(compareModules),
                  };
                })
                .sort(compareChunks);

              this.extractedChunkGroups = chunkGroups
                .map((group: unknown) => {
                  const id = getChunkGroupId(group);
                  return {
                    id,
                    name: getChunkGroupName(group, id),
                    initial: isChunkGroupInitial(group),
                    parents: getRelatedGroupIds(
                      group,
                      "parents",
                      getChunkGroupId,
                    ),
                    children: getRelatedGroupIds(
                      group,
                      "children",
                      getChunkGroupId,
                    ),
                    chunks: [...new Set(
                      toArray((group as any)?.chunks)
                        .map(getChunkId)
                        .filter(Boolean),
                    )].sort(),
                    origins: getChunkGroupOrigins(group),
                  };
                })
                .sort(compareChunkGroups);
            } catch (e) {
              console.warn("[DepsExtractor] Failed to extract deps:", e);
              this.extractedModules = [];
              this.extractedChunks = [];
              this.extractedChunkGroups = [];
            }
          },
        );
      },
    );
  }
}

function compareModules(a: RspackChunkModuleRef, b: RspackChunkModuleRef) {
  const categoryOrder = {
    source: 0,
    dependency: 1,
    runtime: 2,
  } satisfies Record<RspackModuleCategory, number>;

  return (
    categoryOrder[a.category] - categoryOrder[b.category] ||
    a.name.localeCompare(b.name)
  );
}

function compareChunks(a: RspackChunkInfo, b: RspackChunkInfo) {
  return (
    Number(b.entry) - Number(a.entry) ||
    Number(b.initial) - Number(a.initial) ||
    a.name.localeCompare(b.name)
  );
}

function compareChunkGroups(a: RspackChunkGroupInfo, b: RspackChunkGroupInfo) {
  return Number(b.initial) - Number(a.initial) || a.name.localeCompare(b.name);
}

function getChunkModules(chunk: unknown, chunkGraph: unknown): unknown[] {
  const graphModules = toArray(
    (chunkGraph as any)?.getChunkModulesIterable?.(chunk),
  );
  if (graphModules.length > 0) {
    return graphModules;
  }

  return toArray(
    (chunk as any)?.modulesIterable ?? (chunk as any)?.getModules?.(),
  );
}

function getChunkGroups(compilation: unknown, chunks: unknown[]) {
  const groups = toArray((compilation as any)?.chunkGroups);
  if (groups.length > 0) {
    return groups;
  }

  const seen = new Set<unknown>();
  const fallbackGroups: unknown[] = [];

  for (const chunk of chunks) {
    for (const group of toArray((chunk as any)?.groupsIterable)) {
      if (seen.has(group)) continue;
      seen.add(group);
      fallbackGroups.push(group);
    }
  }

  return fallbackGroups;
}

function getRelatedGroupIds(
  group: unknown,
  relation: "parents" | "children",
  getChunkGroupId: (group: unknown) => string,
) {
  const ids = new Set<string>();
  const relationKey =
    relation === "children" ? "childrenIterable" : "parentsIterable";

  for (const relatedGroup of toArray((group as any)?.[relationKey])) {
    const id = getChunkGroupId(relatedGroup);
    if (id) {
      ids.add(id);
    }
  }

  ids.delete(getChunkGroupId(group));
  return [...ids].sort();
}

function getChunkGroupOrigins(group: unknown) {
  const origins = new Set<string>();

  const name = (group as any)?.options?.name;
  if (name) {
    origins.add(String(name));
  }

  for (const origin of toArray((group as any)?.origins)) {
    const request = normalizePath(
      (origin as any)?.request || (origin as any)?.userRequest,
    );
    const module = (origin as any)?.module;
    const moduleName = module ? getModuleName(module) : "";
    const location = formatOriginLocation((origin as any)?.loc);
    const base = request || moduleName;

    if (base && location) {
      origins.add(`${base} @ ${location}`);
      continue;
    }

    if (base) {
      origins.add(base);
      continue;
    }

    if (location) {
      origins.add(location);
    }
  }

  return [...origins].sort();
}

function getChunkGroupName(group: unknown, id: string) {
  const explicitName = (group as any)?.name || (group as any)?.options?.name;
  if (explicitName) {
    return String(explicitName);
  }

  const ukey = (group as any)?.ukey;
  if (ukey !== undefined && ukey !== null && ukey !== "") {
    return `(unnamed chunk group: ${String(ukey)})`;
  }

  return `(unnamed chunk group: ${id})`;
}

function isChunkGroupInitial(group: unknown) {
  try {
    if (typeof (group as any)?.isInitial === "function") {
      return Boolean((group as any).isInitial());
    }
  } catch {
    /* ignore */
  }

  return false;
}

function isChunkEntry(chunk: unknown) {
  try {
    if (typeof (chunk as any)?.getNumberOfEntryModules === "function") {
      return (chunk as any).getNumberOfEntryModules() > 0;
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof (chunk as any)?.hasEntryModule === "function") {
      return Boolean((chunk as any).hasEntryModule());
    }
  } catch {
    /* ignore */
  }

  const entryModulesIterable =
    (chunk as any)?.entryModulesIterable ?? (chunk as any)?.entryModules;
  if (entryModulesIterable) {
    return toArray(entryModulesIterable).length > 0;
  }

  return Boolean((chunk as any)?.entryModule);
}

function isChunkInitial(chunk: unknown) {
  try {
    if (typeof (chunk as any)?.canBeInitial === "function") {
      return Boolean((chunk as any).canBeInitial());
    }
  } catch {
    /* ignore */
  }

  return isChunkEntry(chunk);
}

function getChunkName(chunk: unknown, id: string, fallbackUkey: string) {
  const explicitName = (chunk as any)?.name || toArray((chunk as any)?.idNameHints)[0];
  if (explicitName) {
    return String(explicitName);
  }

  const explicitId = (chunk as any)?.id ?? toArray((chunk as any)?.ids)[0];
  if (explicitId !== undefined && explicitId !== null && explicitId !== "") {
    return String(explicitId);
  }

  if (fallbackUkey) {
    return `(unnamed chunk: ${fallbackUkey})`;
  }

  return String(toArray((chunk as any)?.files)[0] || id);
}

function toArray<T>(value: Iterable<T> | ArrayLike<T> | null | undefined): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof (value as Iterable<T>)[Symbol.iterator] === "function") {
    return Array.from(value as Iterable<T>);
  }
  return [];
}

function formatOriginLocation(loc: unknown) {
  if (!loc) return "";
  if (typeof loc === "string") {
    return normalizePath(loc);
  }
  if (typeof loc !== "object") {
    return "";
  }

  const source = normalizePath((loc as any)?.source);
  const startLine = (loc as any)?.start?.line;
  const startColumn = (loc as any)?.start?.column;
  const endLine = (loc as any)?.end?.line;
  const endColumn = (loc as any)?.end?.column;
  const hasStart =
    typeof startLine === "number" && typeof startColumn === "number";
  const hasEnd = typeof endLine === "number" && typeof endColumn === "number";

  const range =
    hasStart && hasEnd
      ? `${startLine}:${startColumn}-${endLine}:${endColumn}`
      : hasStart
        ? `${startLine}:${startColumn}`
        : "";

  if (source && range) {
    return `${source}:${range}`;
  }
  return source || range;
}

function getModulePath(mod: unknown) {
  return String(
    (mod as any)?.resource ||
      (mod as any)?.rootModule?.resource ||
      (mod as any)?.nameForCondition?.() ||
      (mod as any)?.userRequest ||
      "",
  );
}

function getModuleId(mod: unknown) {
  const identifier =
    (mod as any)?.identifier?.() ??
    (mod as any)?.identifier ??
    (mod as any)?.id ??
    (mod as any)?.debugId ??
    getModulePath(mod);

  return String(identifier || "");
}

function getModuleName(mod: unknown) {
  const path = getModulePath(mod);
  if (path) {
    return normalizePath(path);
  }

  const readable =
    (mod as any)?.readableIdentifier?.((value: string) => value) ||
    (mod as any)?.identifier?.() ||
    (mod as any)?.identifier ||
    "";

  return normalizePath(String(readable || `module-${getModuleId(mod)}`));
}

function getModuleCategory(mod: unknown): RspackModuleCategory {
  const path = getModulePath(mod);
  if (!path) return "runtime";
  if (path.includes("node_modules")) return "dependency";
  return "source";
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
