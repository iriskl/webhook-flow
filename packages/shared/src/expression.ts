import type { WorkflowRuntimeContext } from "./types.js";

type CompareOperator = "==" | "!=" | ">" | ">=" | "<" | "<=";

const unsafePattern = /[;{}()[\]`]|(?:\b(?:constructor|prototype|globalThis|process|Function|eval|import)\b)/;
const comparisonPattern =
  /^\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\s*(==|!=|>=|<=|>|<)\s*(?:"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?)|(true|false|null))\s*$/;

export interface ExpressionResult {
  ok: boolean;
  value?: boolean;
  error?: string;
}

export function validateExpression(expr: string): ExpressionResult {
  return evaluateExpression(expr, { body: {}, headers: {}, event: {} });
}

export function evaluateExpression(expr: string | undefined, context: WorkflowRuntimeContext): ExpressionResult {
  if (!expr || expr.trim() === "") {
    return { ok: true, value: true };
  }
  // 表达式只做字段比较和布尔组合，明确禁止任意 JavaScript，降低 Webhook payload 触发代码执行的风险。
  if (unsafePattern.test(expr)) {
    return { ok: false, error: "表达式包含禁用语法" };
  }

  const orParts = expr.split(/\s+\|\|\s+/);
  try {
    const value = orParts.some((orPart) =>
      orPart.split(/\s+&&\s+/).every((andPart) => evaluateComparison(andPart, context))
    );
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function evaluateComparison(source: string, context: WorkflowRuntimeContext): boolean {
  const match = source.match(comparisonPattern);
  if (!match) {
    throw new Error(`表达式格式不支持：${source.trim()}`);
  }
  const [, path, operator, doubleQuoted, singleQuoted, numeric, boolLike] = match;
  const left = readPath(context, path);
  const right =
    doubleQuoted ?? singleQuoted ?? (numeric !== undefined ? Number(numeric) : parseLiteral(boolLike));
  return compareValues(left, operator as CompareOperator, right);
}

function parseLiteral(value: string | undefined): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  return value;
}

function readPath(context: WorkflowRuntimeContext, path: string | undefined): unknown {
  if (!path) return undefined;
  const parts = path.split(".");
  const root = parts.shift();
  if (root !== "body" && root !== "headers" && root !== "event") {
    throw new Error(`表达式只能读取 body、headers、event：${path}`);
  }
  let current: unknown = context[root];
  for (const part of parts) {
    if (current === null || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function compareValues(left: unknown, operator: CompareOperator, right: unknown): boolean {
  switch (operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return Number(left) > Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<":
      return Number(left) < Number(right);
    case "<=":
      return Number(left) <= Number(right);
  }
}
