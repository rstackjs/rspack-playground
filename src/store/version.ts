import rspackBrowserPackage from "@rspack/browser/package.json";
import { atom } from "jotai";
import { isCanaryRspackVersion } from "@/lib/rspack-version";
import { deserializeShareData } from "@/lib/share";

export { isCanaryRspackVersion } from "@/lib/rspack-version";

export const deprecatedRspackVersions = ["2.0.0-rc.1"] as const;
const canaryVersionLimit = 10;

interface NpmRegistryPackageMetadata {
  time?: Record<string, string>;
  versions?: Record<string, unknown>;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export function isDeprecatedRspackVersion(version: string) {
  return deprecatedRspackVersions.includes(version as (typeof deprecatedRspackVersions)[number]);
}

function getEnabledRspackVersions(versions: string[]) {
  return versions.filter(
    (version) => !isDeprecatedRspackVersion(version) && !isCanaryRspackVersion(version),
  );
}

function compareVersionStrings(a: string, b: string) {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  if (parsedA && parsedB) {
    return compareParsedVersions(parsedB, parsedA);
  }

  return compareVersionNames(a, b);
}

function compareVersionNames(a: string, b: string) {
  return b.localeCompare(a, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function parseVersion(version: string): ParsedVersion | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.*)?$/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compareParsedVersions(a: ParsedVersion, b: ParsedVersion) {
  const releaseDiff = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (releaseDiff !== 0) {
    return releaseDiff;
  }

  if (a.prerelease.length === 0 && b.prerelease.length === 0) {
    return 0;
  }
  if (a.prerelease.length === 0) {
    return 1;
  }
  if (b.prerelease.length === 0) {
    return -1;
  }

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i++) {
    const itemA = a.prerelease[i];
    const itemB = b.prerelease[i];
    if (itemA === undefined) return -1;
    if (itemB === undefined) return 1;

    const numberA = getPrereleaseNumber(itemA);
    const numberB = getPrereleaseNumber(itemB);
    if (numberA !== null && numberB !== null) {
      const diff = numberA - numberB;
      if (diff !== 0) return diff;
      continue;
    }
    if (numberA !== null) return -1;
    if (numberB !== null) return 1;

    const diff = itemA.localeCompare(itemB);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function getPrereleaseNumber(value: string) {
  return /^\d+$/.test(value) ? Number(value) : null;
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
