import type { SourceFile } from "../bundler";
import PresetBasicLibrary from "./basic-library";
import PresetEsmSh from "./esm-sh";
import PresetModuleFederationApp from "./module-federation-app";
import PresetReact from "./react";

export interface SourcePreset {
  name: string;
  files?: SourceFile[];
  createFiles?: (rspackVersion: string) => SourceFile[];
}

function cloneFiles(files: SourceFile[]) {
  return files.map((file) => ({ ...file }));
}

export function isRspackV2OrLater(rspackVersion: string) {
  const [majorText] = rspackVersion.split(".", 1);
  const major = Number.parseInt(majorText ?? "", 10);
  return Number.isFinite(major) && major >= 2;
}

export function getPresetFiles(
  preset: SourcePreset,
  rspackVersion: string,
): SourceFile[] {
  const files = preset.createFiles?.(rspackVersion) ?? preset.files ?? [];
  return cloneFiles(files);
}

export function getPresetByName(name: string) {
  return presets.find((preset) => preset.name === name);
}

export const presets: SourcePreset[] = [
  PresetBasicLibrary,
  PresetEsmSh,
  PresetReact,
  PresetModuleFederationApp,
];

export {
  PresetBasicLibrary,
  PresetEsmSh,
  PresetReact,
  PresetModuleFederationApp,
};
