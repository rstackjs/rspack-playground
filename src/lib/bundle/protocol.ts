import type { BundleResult, SourceFile } from "@/store/bundler";

export interface BundleWorkerRequest {
  id: number;
  files: SourceFile[];
  version: string;
}

export interface BundleWorkerSuccessResponse {
  id: number;
  ok: true;
  result: BundleResult;
}

export interface BundleWorkerErrorResponse {
  id: number;
  ok: false;
  error: string;
}

export type BundleWorkerResponse = BundleWorkerSuccessResponse | BundleWorkerErrorResponse;
