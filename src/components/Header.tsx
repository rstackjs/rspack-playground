import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Clock, Download, RotateCcw, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import Github from "@/components/icon/Github";
import Logo from "@/components/icon/Rspack";
import { ModeToggle } from "@/components/ModeToggle";
import Preview from "@/components/Preview";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useBundle from "@/hooks/use-bundle";
import { useDownloadProject } from "@/hooks/use-download";
import { getShareUrl, type ShareData } from "@/lib/share";
import { bundleResultAtom, inputFilesAtom, isBundlingAtom } from "@/store/bundler";
import { getPresetByName, getPresetFiles, presets } from "@/store/presets";
import {
  deprecatedAvailableRspackVersionsAtom,
  enabledRspackVersionsAtom,
  isCanaryRspackVersion,
  recentCanaryRspackVersionsAtom,
  rspackVersionAtom,
} from "@/store/version";

function formatCanaryTimestamp(timestamp: string) {
  if (!/^\d{14}$/.test(timestamp)) {
    return timestamp;
  }

  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)} ${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}`;
}

function getVersionDisplay(version: string) {
  const canaryMatch = version.match(/^(.*-canary)-([0-9a-f]+)-(\d{14})$/i);
  if (!canaryMatch) {
    return {
      shortLabel: `v${version}`,
      detailLabel: null,
      fullLabel: `v${version}`,
    };
  }

  const [, releaseLabel, hash, timestamp] = canaryMatch;
  return {
    shortLabel: `v${releaseLabel}`,
    detailLabel: `${hash.slice(0, 8)} · ${formatCanaryTimestamp(timestamp)}`,
    fullLabel: `v${version}`,
  };
}

export default function Header() {
  const iconButtonClassName =
    "size-7 rounded-md border-0 bg-transparent text-muted-foreground shadow-none hover:bg-accent/80 hover:text-foreground";

  const [rspackVersion, setRspackVersion] = useAtom(rspackVersionAtom);
  const enabledVersions = useAtomValue(enabledRspackVersionsAtom);
  const canaryVersions = useAtomValue(recentCanaryRspackVersionsAtom);
  const deprecatedVersions = useAtomValue(deprecatedAvailableRspackVersionsAtom);
  const visibleCanaryVersions =
    isCanaryRspackVersion(rspackVersion) && !canaryVersions.includes(rspackVersion)
      ? [rspackVersion, ...canaryVersions]
      : canaryVersions;
  const selectedVersionDisplay = getVersionDisplay(rspackVersion);
  const [bundleResult] = useAtom(bundleResultAtom);
  const [isBundling] = useAtom(isBundlingAtom);
  const [inputFiles] = useAtom(inputFilesAtom);
  const setInputFiles = useSetAtom(inputFilesAtom);
  const handleBundle = useBundle();
  const downloadProject = useDownloadProject();

  const [selectedPreset, setSelectedPreset] = useState(presets[0].name);

  const handleReset = () => {
    const preset = getPresetByName(selectedPreset);
    const files = preset ? getPresetFiles(preset, rspackVersion) : [];
    setInputFiles(files);
    handleBundle(files);
    window.history.replaceState(null, "", window.location.pathname);
  };

  const handleShare = async () => {
    try {
      const shareData: ShareData = {
        rspackVersion,
        inputFiles,
      };

      const shareUrl = getShareUrl(shareData);
      await navigator.clipboard.writeText(shareUrl);
      window.history.replaceState(null, "", shareUrl);
      toast.success("Share link copied to clipboard!");
    } catch (error) {
      console.error("Failed to share:", error);
      toast.error("Failed to copy share link");
    }
  };

  const handleVersionChange = async (version: string) => {
    if (version === rspackVersion) {
      return;
    }

    setRspackVersion(version);
    window.history.replaceState(
      null,
      "",
      getShareUrl({
        rspackVersion: version,
        inputFiles,
      }),
    );
    await handleBundle(inputFiles, version);
  };

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-12 items-center px-3">
        <div className="flex max-h-full items-center space-x-2.5">
          <Logo className="h-8 w-8" />
          <h1 className="text-base font-semibold">Rspack Playground</h1>
        </div>
        <div className="flex-1" />
        <div className="flex items-center">
          <div className="flex items-center gap-2 pr-3">
            <div className="flex items-center space-x-1.5 text-[13px] text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {isBundling
                  ? "Bundling..."
                  : bundleResult
                    ? `${bundleResult.duration.toFixed(0)}ms`
                    : "--ms"}
              </span>
            </div>
            <Select
              value={rspackVersion}
              onValueChange={(version) => {
                void handleVersionChange(version);
              }}
              disabled={isBundling}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-[188px] border bg-background/80 px-2.5 text-xs shadow-none hover:bg-background"
                title={`Switch Rspack version (current: ${selectedVersionDisplay.fullLabel})`}
                aria-label={`Switch Rspack version, current ${selectedVersionDisplay.fullLabel}`}
              >
                <SelectValue placeholder="Rspack Version">
                  {selectedVersionDisplay.shortLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-64 w-[280px]">
                <SelectGroup>
                  <SelectLabel>Rspack Core</SelectLabel>
                  {enabledVersions.map((version) => (
                    <SelectItem key={version} value={version} title={`v${version}`}>
                      {getVersionDisplay(version).shortLabel}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {visibleCanaryVersions.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Rspack Canary</SelectLabel>
                      {visibleCanaryVersions.map((version) => {
                        const display = getVersionDisplay(version);
                        return (
                          <SelectItem
                            key={version}
                            value={version}
                            title={display.fullLabel}
                            className="items-start"
                          >
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate">{display.shortLabel}</span>
                              {display.detailLabel && (
                                <span className="text-muted-foreground truncate text-[11px]">
                                  {display.detailLabel}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  </>
                )}
                {deprecatedVersions.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Deprecated</SelectLabel>
                      {deprecatedVersions.map((version) => (
                        <SelectItem key={version} value={version} disabled title={`v${version}`}>
                          {getVersionDisplay(version).shortLabel}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-0.5 px-3">
            <Button
              variant="ghost"
              size="icon"
              className={iconButtonClassName}
              onClick={downloadProject}
              title="Download project (Source + Dist)"
              aria-label="Download project"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="sr-only">Download</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={iconButtonClassName}
              onClick={handleShare}
              title="Share current configuration"
              aria-label="Share current configuration"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="sr-only">Share</span>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={iconButtonClassName}
                  title="Reset to a preset"
                  aria-label="Reset to a preset"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="sr-only">Choose a preset</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Files</AlertDialogTitle>
                  <AlertDialogDescription>
                    <span>
                      This will reset all files to a preset. This action cannot be undone.
                    </span>
                    <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                      <SelectTrigger className="w-[180px] mt-4">
                        <SelectValue placeholder="Select a preset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Preset</SelectLabel>
                          {presets.map((preset) => (
                            <SelectItem key={preset.name} value={preset.name}>
                              {preset.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Preview />
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-0.5 pl-3">
            <ModeToggle />
            <Button variant="ghost" size="icon" className={iconButtonClassName} asChild>
              <a
                href="https://github.com/rspack-contrib/rspack-playground"
                target="_blank"
                rel="noopener noreferrer"
                title="View on GitHub"
                aria-label="View on GitHub"
              >
                <Github className="h-3.5 w-3.5" />
                <span className="sr-only">GitHub</span>
              </a>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
