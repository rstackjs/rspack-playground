import type { BundleResult, SourceFile } from "@/store/bundler";

export interface BundleWorkerRequest {
  files: SourceFile[];
  version: string;
}

export interface BundleWorkerSuccessResponse {
  ok: true;
  result: BundleResult;
}

export interface BundleWorkerErrorResponse {
  ok: false;
  error: string;
}

export type BundleWorkerResponse = BundleWorkerSuccessResponse | BundleWorkerErrorResponse;
