# V0.6 Tool System Design

**Status:** Phase 111 design only. No tool, MCP, API, OAuth, process, or workflow runtime is enabled.

POP uses tools when a structured operation is more reliable than manipulating a visual interface.
Direct APIs provide typed inputs and results, lower latency, clearer verification, and fewer fragile UI
assumptions. UI automation remains a separately authorized fallback when no structured capability
exists.

## Tool is not MCP

POP owns a provider-neutral tool vocabulary. MCP is one adapter into that vocabulary, alongside future
internal and native API adapters.

```text
Internal tool ----\
Native API --------> POP ToolDefinition -> ToolRegistry -> ToolPolicy
MCP server -> MCP adapter /
```

An MCP server never enters POP Core directly. Changing protocol versions or SDKs should affect the MCP
adapter, connection manager, and transport layer, not policy, registry, approval, or result handling.

## Verified MCP baseline

As of 2026-08-28, the official TypeScript client v2 is `@modelcontextprotocol/client`, and the official
stable protocol revision is `2026-07-28`. New POP code should use the split v2 client package rather
than the monolithic v1 `@modelcontextprotocol/sdk` package.

The client must explicitly configure protocol negotiation. POP's initial policy should pin
`2026-07-28` for managed/tested servers and use a separately approved compatibility policy when a
known server requires a legacy era. Negotiation results and failures must remain visible; authentication
errors and server failures must never be misreported as version compatibility.

The initial transport choices remain stdio for approved local servers and Streamable HTTP over HTTPS
for remote servers. New code must not depend on deprecated Roots, Sampling, MCP Logging, or legacy
HTTP+SSE behavior. List-result cache hints may inform catalog freshness, but POP retains its own
registry and health policy.

References:

- [MCP 2026-07-28 release](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [`@modelcontextprotocol/client` v2](https://github.com/modelcontextprotocol/typescript-sdk/tree/main/packages/client)
- [Protocol negotiation guidance](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md)

## Domain contracts

The contracts below define Phase 112 without adding runtime files or dependencies yet. Every value
crossing a process, network, adapter, or model boundary still requires runtime validation.

```ts
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

interface JsonSchema {
  readonly $schema?: 'https://json-schema.org/draft/2020-12/schema';
  readonly [key: string]: JsonValue | undefined;
}

type ToolSource = 'INTERNAL' | 'MCP_LOCAL' | 'MCP_REMOTE' | 'NATIVE_API';

type ToolAuthority =
  'USER_EXPLICIT' | 'USER_CONFIRMED' | 'POP_INTERNAL' | 'MODEL_PROPOSAL' | 'UNTRUSTED_CONTENT';

type ToolCapability =
  'READ' | 'SEARCH' | 'CREATE' | 'UPDATE' | 'DELETE' | 'SEND' | 'EXECUTE' | 'ADMIN';

type ToolRisk =
  | 'T0_READ_ONLY'
  | 'T1_LOW_SIDE_EFFECT'
  | 'T2_CONTENT_CREATION'
  | 'T3_EXTERNAL_SIDE_EFFECT'
  | 'T4_DESTRUCTIVE'
  | 'T5_PROHIBITED';
```

`UNTRUSTED_CONTENT` and `MODEL_PROPOSAL` are never execution authority. `T4_DESTRUCTIVE` defaults to
deny in V0.6, and `T5_PROHIBITED` is always denied. Risk classification cannot be lowered by a model,
tool description, server response, memory, or previous approval.

### Tool definition

```ts
interface ToolDefinition {
  id: string;
  namespace: string;
  name: string;
  description: string;
  source: ToolSource;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  risk: ToolRisk;
  capabilities: readonly ToolCapability[];
  serverId?: string;
  version?: string;
}
```

`id` is stable and namespaced, such as `github.search_issues`. Descriptions and schemas discovered from
a server are untrusted metadata. They inform validation and selection but cannot alter policy, request
new credentials, connect another server, or instruct POP to execute.

### Tool call

```ts
type ToolCallStatus =
  | 'PROPOSED'
  | 'VALIDATING'
  | 'POLICY_PENDING'
  | 'APPROVAL_PENDING'
  | 'APPROVED'
  | 'EXECUTING'
  | 'VALIDATING_RESULT'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'DENIED'
  | 'CANCELLED'
  | 'FAILED';

interface ToolCall {
  id: string;
  toolId: string;
  arguments: JsonValue;
  authority: ToolAuthority;
  requestedAt: number;
  contextRef?: string;
  status: ToolCallStatus;
}
```

Arguments become executable only after the selected definition is current, JSON Schema validation
succeeds, size and semantic limits pass, policy allows the call, and any required one-time approval is
bound to the exact tool and normalized arguments.

### Tool result

```ts
interface ToolError {
  code: string;
  message: string;
  retryable: boolean;
}

interface ToolVerification {
  status: 'NOT_REQUIRED' | 'PENDING' | 'VERIFIED' | 'FAILED';
  method?: string;
  checkedAt?: number;
}

interface ToolResult {
  callId: string;
  toolId: string;
  success: boolean;
  data?: JsonValue;
  error?: ToolError;
  sourceRef: string;
  startedAt: number;
  finishedAt: number;
  truncated: boolean;
  verification: ToolVerification;
}
```

Transport success is not outcome verification. A consequential remote write may need a fresh read to
prove the intended object exists with the intended values. Tool output remains untrusted external data
even when schema-valid, and must be bounded and sanitized before UI or model use.

### Permissions and policy

```ts
type ToolPermission = 'ALLOW' | 'ASK' | 'DENY';

interface ToolPermissionPolicy {
  server: ToolPermission;
  byToolId: Readonly<Record<string, ToolPermission>>;
  byCapability: Readonly<Partial<Record<ToolCapability, ToolPermission>>>;
}

type ToolPolicyDecision =
  | { decision: 'ALLOW'; reasonCodes: readonly string[] }
  | {
      decision: 'ASK';
      reasonCodes: readonly string[];
      approvalSummary: string;
      approvalExpiresAt: number;
    }
  | { decision: 'DENY'; reasonCodes: readonly string[] };
```

The deterministic policy combines authority, risk, server trust, server/tool/capability permissions,
current context, and action mode. More restrictive decisions win. Approval permits only the exact call
shown to the user; it cannot override prohibited risk, invalid arguments, missing credentials, stale
targets, or a denied server.

### Registry entry

```ts
type ToolAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'DISABLED' | 'BLOCKED';
type ToolHealth = 'UNKNOWN' | 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

interface ToolRegistryEntry {
  definition: ToolDefinition;
  availability: ToolAvailability;
  health: ToolHealth;
  permission: ToolPermissionPolicy;
  discoveredAt: number;
  refreshAfter?: number;
}
```

The registry normalizes internal, native API, and MCP tools. It supports exact ID lookup and bounded
search by namespace, capability, and keywords. It never sends the full catalog to a model by default.

## MCP server boundary

```ts
type McpServerTrust = 'UNTRUSTED' | 'USER_APPROVED' | 'TRUSTED_LOCAL' | 'MANAGED';

interface LocalProcessSpec {
  executable: string;
  args: readonly string[];
  cwd?: string;
  allowedEnvKeys: readonly string[];
  startupTimeoutMs: number;
}

interface ProtocolPolicy {
  mode: 'PIN_MODERN' | 'APPROVED_COMPATIBILITY';
  modernVersion: '2026-07-28';
  allowedLegacyVersions?: readonly string[];
}

interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'streamable_http';
  enabled: boolean;
  trust: McpServerTrust;
  protocolPolicy: ProtocolPolicy;
  permissions: ToolPermissionPolicy;
  command?: LocalProcessSpec;
  url?: string;
  authProfileId?: string;
}
```

Validation requires exactly one transport configuration. A local server uses a structured executable
and argument list, never a shell command string. It receives only explicitly allowed environment keys;
POP must not pass `GROQ_API_KEY`, unrelated credentials, database keys, or its complete environment.
A remote server must use HTTPS outside explicitly isolated localhost testing.

Unknown server URLs and executable suggestions from models, webpages, tool descriptions, or tool
results remain untrusted and cannot create or enable configuration. Starting a stdio server executes
local code, so the user must inspect and approve the executable, arguments, working directory, and
environment allow-list before the process starts.

## Required data flow

```text
User goal
  -> CapabilityRouter
  -> bounded ToolCandidate set
  -> deterministic ToolPolicy
  -> DENY | one-time ASK | ALLOW
  -> argument construction
  -> JSON Schema and semantic validation
  -> ToolExecutor adapter
  -> bounded ToolResult
  -> result schema validation and sanitization
  -> outcome verification when required
  -> metadata-only ToolLedger
  -> current context, UI, or AI
```

The model may propose a tool or arguments. It cannot connect a server, grant permission, approve a
write, lower risk, skip validation, or cause an unbounded retry loop.

## Cross-system boundaries

```text
ToolResult -> current context
ToolResult -> MemoryCandidate -> MemoryPolicy -> optional MemoryRecord

Tool workflow requiring UI manipulation
  -> ActionIntent -> ActionPolicy -> approval -> execution -> verification
```

Tool results never become persistent memory automatically. Memory may improve tool selection or fill a
non-sensitive default, but it cannot grant server, tool, or capability permission. A tool also cannot
bypass the V0.4 action system merely because its workflow contains a UI step.

## Bounded workflows

A later workflow wraps the same per-call pipeline. Initial limits must include maximum steps, wall-clock
duration, tool calls, retries, result bytes, AI calls, and at most one explicitly approved write. The
default failure behavior is stop, preserve verified partial results, and explain which step failed.
Full autonomous loops remain out of scope.

## Minimum Phase 112 files

Phase 112 should add one provider-neutral package and no external execution:

```text
packages/tools/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    types.ts
    schemas.ts
    types.test.mjs
```

`types.ts` owns the domain contracts. `schemas.ts` performs runtime validation and normalization.
Tests cover IDs/namespaces, JSON values, risk/capability combinations, state values, and rejection of
shell-string fields, unknown authority, invalid schemas, oversized metadata, and permission-bearing
model content. No registry, policy engine, MCP dependency, server process, OAuth, tool call, ledger, or
workflow belongs in Phase 112.

## Phase 111 decision

The tool domain and adapter boundaries are defined. Phase 111 adds no external access, credentials,
child process, network endpoint, persistent data, action authority, or model capability.
