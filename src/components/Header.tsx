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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useBundle from "@/hooks/use-bundle";
import { useDownloadProject } from "@/hooks/use-download";
import { getShareUrl, type ShareData } from "@/lib/share";
import {
  availableVersionsAtom,
  bundleResultAtom,
  inputFilesAtom,
  isBundlingAtom,
  rspackVersionAtom,
} from "@/store/bundler";
import { presets } from "@/store/presets";

export default function Header() {
  const [rspackVersion, setRspackVersion] = useAtom(rspackVersionAtom);
  const availableVersions = useAtomValue(availableVersionsAtom);
  const [bundleResult] = useAtom(bundleResultAtom);
  const [isBundling] = useAtom(isBundlingAtom);
  const [inputFiles] = useAtom(inputFilesAtom);
  const setInputFiles = useSetAtom(inputFilesAtom);
  const handleBundle = useBundle();
  const downloadProject = useDownloadProject();

  const [selectedPreset, setSelectedPreset] = useState(presets[0].name);

  const handleReset = () => {
    const preset = presets.find((p) => p.name === selectedPreset);
    const files = [...(preset?.files || [])];
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

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center space-x-3 max-h-full">
          <Logo className="w-10 h-10" />
          <h1 className="text-lg font-semibold">Rspack Playground</h1>
        </div>
        <div className="flex-1" />
        <div className="flex items-center space-x-3">
          {/* Bundle Duration */}
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              {isBundling
                ? "Bundling..."
                : bundleResult
                  ? `${bundleResult.duration.toFixed(0)}ms`
                  : "--ms"}
            </span>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" title="Reset to a preset">
                <RotateCcw className="h-4 w-4" />
                <span>Choose a preset</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Files</AlertDialogTitle>
                <AlertDialogDescription>
                  <span>
                    This will reset all files to a preset. This action cannot be
                    undone.
                  </span>
                  <Select
                    value={selectedPreset}
                    onValueChange={setSelectedPreset}
                  >
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
                <AlertDialogAction onClick={handleReset}>
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant="default"
            size="sm"
            onClick={handleShare}
            title="Share current configuration"
          >
            <Share2 className="h-4 w-4" />
            <span>Share</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadProject}
            title="Download project (Source + Dist)"
          >
            <Download className="h-4 w-4" />
            <span>Download</span>
          </Button>
          <Preview />
          <div className="flex items-center space-x-2 hidden">
            <span className="text-sm text-muted-foreground">Version:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  v{rspackVersion}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {availableVersions.map((version) => (
                  <DropdownMenuItem
                    key={version}
                    onClick={() => setRspackVersion(version)}
                    className={rspackVersion === version ? "bg-accent" : ""}
                  >
                    v{version}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <ModeToggle />
          <Button variant="ghost" size="icon" asChild>
            <a
              href="https://github.com/rspack-contrib/rspack-playground"
              target="_blank"
              rel="noopener noreferrer"
              title="View on GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
