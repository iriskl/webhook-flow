import type { PrismaClient } from "@prisma/client";
import { defaultDemoWorkflow, deriveSigningKey } from "@webhook-flow/shared";

export async function createDemoEndpoint(prisma: PrismaClient) {
  const secret = "wfsec_test_secret";
  const endpoint = await prisma.endpoint.create({
    data: {
      name: "GitHub Demo",
      slug: `github-demo-${Math.random().toString(36).slice(2, 8)}`,
      secretHash: deriveSigningKey(secret)
    }
  });
  return { endpoint, secret };
}

export async function createDemoWorkflow(prisma: PrismaClient, endpointId: string) {
  return prisma.workflow.create({
    data: {
      endpointId,
      name: "github-main-push",
      dslText: defaultDemoWorkflow,
      dslFormat: "yaml",
      enabled: true
    }
  });
}
