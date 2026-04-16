import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { bundleActionAtom, type SourceFile } from "@/store/bundler";

export default function useBundle() {
  const runBundle = useSetAtom(bundleActionAtom);

  const handleBundle = useCallback(
    (files: SourceFile[], versionOverride?: string) => runBundle({ files, versionOverride }),
    [runBundle],
  );

  return handleBundle;
}
