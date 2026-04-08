import rspackBrowserPackage from "@rspack/browser/package.json";
import { atom } from "jotai";
import { deserializeShareData } from "@/lib/share";

export const deprecatedRspackVersions = ["2.0.0-rc.1"] as const;

export function isDeprecatedRspackVersion(version: string) {
  return deprecatedRspackVersions.includes(
    version as (typeof deprecatedRspackVersions)[number],
  );
}

function getEnabledRspackVersions(versions: string[]) {
  return versions.filter((version) => !isDeprecatedRspackVersion(version));
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
  const res = await fetch("https://registry.npmjs.org/@rspack/browser");
  const data = await res.json();
  return Object.keys(data.versions).sort((a, b) => {
    return b.localeCompare(a, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
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
    (initialVersion && !isDeprecatedRspackVersion(initialVersion)
      ? initialVersion
      : undefined) ??
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
