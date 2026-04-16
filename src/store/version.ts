import rspackBrowserPackage from "@rspack/browser/package.json";
import { atom } from "jotai";
import { deserializeShareData } from "@/lib/share";

export const deprecatedRspackVersions = ["2.0.0-rc.1"] as const;
const canaryVersionLimit = 10;

interface NpmRegistryPackageMetadata {
  time?: Record<string, string>;
  versions?: Record<string, unknown>;
}

export function isDeprecatedRspackVersion(version: string) {
  return deprecatedRspackVersions.includes(version as (typeof deprecatedRspackVersions)[number]);
}

export function isCanaryRspackVersion(version: string) {
  const normalizedVersion = version.split("+", 1)[0] ?? version;
  const prerelease = normalizedVersion.split("-").slice(1).join("-");
  return prerelease.toLowerCase().includes("canary");
}

function getEnabledRspackVersions(versions: string[]) {
  return versions.filter(
    (version) => !isDeprecatedRspackVersion(version) && !isCanaryRspackVersion(version),
  );
}

function compareVersionStrings(a: string, b: string) {
  return b.localeCompare(a, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortVersionsByPublishedTime(
  versions: string[],
  publishedTime: Record<string, string> | undefined,
) {
  return [...versions].sort((a, b) => {
    const timeA = publishedTime?.[a];
    const timeB = publishedTime?.[b];
    if (timeA && timeB) {
      return Date.parse(timeB) - Date.parse(timeA);
    }
    if (timeB) return 1;
    if (timeA) return -1;
    return compareVersionStrings(a, b);
  });
}

async function fetchRegistryMetadata(packageName: string): Promise<NpmRegistryPackageMetadata> {
  const res = await fetch(`https://registry.npmjs.org/${packageName}`);
  return (await res.json()) as NpmRegistryPackageMetadata;
}

function getInitRspackVersionFromHash() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const shareData = deserializeShareData(hash);
    if (shareData) {
      return shareData.rspackVersion;
    }
  }
}

export function getSafeInitRspackVersion() {
  const initialVersion = getInitRspackVersionFromHash();
  if (initialVersion && !isDeprecatedRspackVersion(initialVersion)) {
    return initialVersion;
  }

  if (!isDeprecatedRspackVersion(rspackBrowserPackage.version)) {
    return rspackBrowserPackage.version;
  }

  // Only used for generating the initial preset before registry versions load.
  return "1.0.0";
}

export const availableVersionsAtom = atom(async () => {
  const data = await fetchRegistryMetadata("@rspack/browser");
  return Object.keys(data.versions ?? {}).sort(compareVersionStrings);
});

export const recentCanaryRspackVersionsAtom = atom(async () => {
  const data = await fetchRegistryMetadata("@rspack-canary/browser");
  const versions = sortVersionsByPublishedTime(Object.keys(data.versions ?? {}), data.time);
  return versions.slice(0, canaryVersionLimit);
});

export const enabledRspackVersionsAtom = atom(async (get) => {
  const versions = await get(availableVersionsAtom);
  return getEnabledRspackVersions(versions);
});

export const deprecatedAvailableRspackVersionsAtom = atom(async (get) => {
  const versions = await get(availableVersionsAtom);
  return versions.filter((version) => isDeprecatedRspackVersion(version));
});

const defaultRspackVersionAtom = atom(async (get) => {
  const versions = await get(enabledRspackVersionsAtom);
  const initialVersion = getInitRspackVersionFromHash();

  return (
    (initialVersion && !isDeprecatedRspackVersion(initialVersion) ? initialVersion : undefined) ??
    (versions.includes(rspackBrowserPackage.version)
      ? rspackBrowserPackage.version
      : (versions[0] ?? ""))
  );
});

const overwrittenRspackVersionAtom = atom<string | null>(null);

export const rspackVersionAtom = atom(
  (get) => {
    const overwritten = get(overwrittenRspackVersionAtom);
    if (overwritten) return overwritten;
    return get(defaultRspackVersionAtom);
  },
  (_, set, newVersion: string) => {
    set(overwrittenRspackVersionAtom, newVersion);
  },
);
