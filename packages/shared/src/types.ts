export type DslFormat = "yaml" | "json";
export type ExecutionStatus = "pending" | "running" | "success" | "failed" | "skipped";
export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";
export type RetryJobStatus = "pending" | "running" | "done" | "failed";

export interface WorkflowRuntimeContext {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  event: {
    id?: string;
    endpointSlug?: string;
    receivedAt?: string;
  };
}

export interface WorkflowTestPreview {
  filterMatched: boolean;
  skippedReason?: string;
  steps: Array<{
    name: string;
    type: string;
    willRun: boolean;
    skippedReason?: string;
    request?: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body: unknown;
    };
  }>;
}
