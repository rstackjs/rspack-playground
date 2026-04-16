export function isCanaryRspackVersion(version: string) {
  const normalizedVersion = version.split("+", 1)[0] ?? version;
  const prerelease = normalizedVersion.split("-").slice(1).join("-");
  return prerelease.toLowerCase().includes("canary");
}
