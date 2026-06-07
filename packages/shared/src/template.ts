import type { WorkflowRuntimeContext } from "./types.js";

const templatePattern = /\{\{\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\s*\}\}/g;

export function renderTemplateValue(value: unknown, context: WorkflowRuntimeContext): unknown {
  if (typeof value === "string") {
    return value.replace(templatePattern, (_match, path: string) => stringify(readPath(context, path)));
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderTemplateValue(item, context));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, renderTemplateValue(child, context)])
    );
  }
  return value;
}

function readPath(context: WorkflowRuntimeContext, path: string): unknown {
  const parts = path.split(".");
  const root = parts.shift();
  if (root !== "body" && root !== "headers" && root !== "event") {
    return "";
  }
  let current: unknown = context[root];
  for (const part of parts) {
    if (current === null || typeof current !== "object" || !(part in current)) return "";
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
