/* eslint-disable @typescript-eslint/no-explicit-any -- exercises the JSON-RPC transport boundary. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DATA_TOOLS } from "../../electron/mcp-data-bridge.mjs";
import { createMcpActionGateway } from "../../electron/mcp-action-gateway.mjs";
import { createSitkuCore } from "../../mcp/sitku-mcp-core.mjs";

const tempDirs: string[] = [];
afterEach(() => {
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const resultText = (response: any) => JSON.parse(response.result.content[0].text);

describe("Team OS MCP contract", () => {
  it("advertises the full read surface and idempotent confirmation-gated writes", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-team-mcp-"));
    tempDirs.push(rootDir);
    const gateway = createMcpActionGateway({ rootDir });
    const core = createSitkuCore(() => rootDir, { extraTools: DATA_TOOLS, actionGateway: gateway });
    const listed: any = await core.dispatch({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const tools = new Map(listed.result.tools.map((tool: any) => [tool.name, tool]));

    for (const name of ["team_overview", "team_list_projects", "team_health", "team_list_reviews", "team_list_attendance", "team_list_payroll", "team_list_approvals", "team_activity"]) {
      expect(tools.get(name)?.annotations.readOnlyHint).toBe(true);
    }
    for (const name of ["team_add_project", "team_add_task", "team_add_kpi", "team_add_leave", "team_add_review", "team_add_payroll", "team_update_approval"]) {
      expect(tools.get(name)?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: true });
      expect(tools.get(name)?.inputSchema.required).toContain("idempotency_key");
    }
  });

  it("does not execute a Team OS write before the CEO approves it", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-team-approval-"));
    tempDirs.push(rootDir);
    const gateway = createMcpActionGateway({ rootDir });
    const core = createSitkuCore(() => rootDir, { extraTools: DATA_TOOLS, actionGateway: gateway });
    const response: any = await core.dispatch({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "team_add_project", arguments: { name: "Launch", idempotency_key: "project-launch-1" } },
    }, { client: { id: "codex", name: "Codex", scopes: ["*"] } });
    const proposal = resultText(response);

    expect(proposal.status).toBe("confirmation_required");
    expect(proposal.action.tool).toBe("team_add_project");
    expect(gateway.list()).toHaveLength(1);
    expect(gateway.reject(proposal.action.id).status).toBe("rejected");
  });

  it("publishes team overview and health resources", async () => {
    const core = createSitkuCore(() => "/tmp/vault", { extraTools: DATA_TOOLS });
    const response: any = await core.dispatch({ jsonrpc: "2.0", id: 1, method: "resources/list" });
    expect(response.result.resources.map((resource: any) => resource.uri)).toEqual(expect.arrayContaining([
      "sitku://team/overview",
      "sitku://team/health",
    ]));
  });
});
