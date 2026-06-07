import {
  evaluateExpression,
  parseWorkflowDsl,
  renderTemplateValue,
  type WorkflowDsl,
  type WorkflowRuntimeContext,
  type WorkflowTestPreview
} from "@webhook-flow/shared";

export function validateWorkflowText(text: string): ReturnType<typeof parseWorkflowDsl> {
  const parsed = parseWorkflowDsl(text);
  if (!parsed.ok || !parsed.workflow) return parsed;

  const errors: string[] = [];
  if (parsed.workflow.filter?.expr) {
    const result = evaluateExpression(parsed.workflow.filter.expr, { body: {}, headers: {}, event: {} });
    if (!result.ok) errors.push(`filter.expr: ${result.error}`);
  }
  for (const [index, step] of parsed.workflow.steps.entries()) {
    if (step.when) {
      const result = evaluateExpression(step.when, { body: {}, headers: {}, event: {} });
      if (!result.ok) errors.push(`steps.${index}.when: ${result.error}`);
    }
  }
  return errors.length > 0 ? { ...parsed, ok: false, errors } : parsed;
}

export function previewWorkflow(workflow: WorkflowDsl, context: WorkflowRuntimeContext): WorkflowTestPreview {
  const filterResult = evaluateExpression(workflow.filter?.expr, context);
  if (!filterResult.ok || filterResult.value === false) {
    return {
      filterMatched: false,
      skippedReason: filterResult.error ?? "filter 条件不匹配",
      steps: workflow.steps.map((step) => ({
        name: step.name,
        type: step.type,
        willRun: false,
        skippedReason: "workflow filter 未命中"
      }))
    };
  }

  return {
    filterMatched: true,
    steps: workflow.steps.map((step) => {
      const whenResult = evaluateExpression(step.when, context);
      const willRun = whenResult.ok && whenResult.value !== false;
      return {
        name: step.name,
        type: step.type,
        willRun,
        skippedReason: willRun ? undefined : whenResult.error ?? "step.when 条件不匹配",
        request: willRun
          ? {
              method: step.method,
              url: step.url,
              headers: step.headers,
              body: renderTemplateValue(step.body ?? {}, context)
            }
          : undefined
      };
    })
  };
}
