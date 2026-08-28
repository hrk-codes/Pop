# V0.5 Memory System Design

**Status:** Phase 82 design only. No database, retrieval, personalization, or memory UI is enabled.

POP V0.5 uses the least-memory principle: store the smallest durable, scoped fact that improves a
future task. Memory is local-first, inspectable, correctable, deletable, and independent from action
authority.

## Why memory is a separate subsystem

| Concept         | Question it answers                   | Typical lifetime        | Source of truth         |
| --------------- | ------------------------------------- | ----------------------- | ----------------------- |
| Setting         | How did the user configure POP?       | Until changed           | Explicit configuration  |
| Current context | What is happening right now?          | Seconds or minutes      | Authorized observations |
| Session memory  | What matters during this interaction? | Current task or process | Bounded in-memory state |
| Action ledger   | What did POP attempt and verify?      | Audit retention         | Action subsystem        |
| Memory          | What reusable fact should POP keep?   | Scoped retention        | Memory store            |

Context is replaceable working state. A setting is application configuration. An action-ledger row is
evidence of an attempted action. None should silently become a persistent preference.

## Domain vocabulary

The following contracts define Phase 83 without creating runtime files yet. Runtime schemas must
validate unknown input before creating these values.

```ts
type MemoryType = 'PREFERENCE' | 'KNOWLEDGE' | 'INTERACTION_SUMMARY';

type MemorySource = 'USER_EXPLICIT' | 'USER_CONFIRMED' | 'BEHAVIOR_INFERRED' | 'SYSTEM_DERIVED';

type MemoryStatus = 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED' | 'EXPIRED';

type MemorySensitivity = 'PUBLIC' | 'NORMAL' | 'PERSONAL' | 'SENSITIVE' | 'SECRET' | 'BLOCKED';

type MemoryRetention =
  | { kind: 'SESSION' }
  | { kind: 'TEMPORARY'; expiresAt: number }
  | { kind: 'PERSISTENT'; expiresAt?: number }
  | { kind: 'UNTIL_USER_DELETES' };

type MemoryCloudPolicy = 'LOCAL_ONLY' | 'CLOUD_ALLOWED';
```

`SESSION` values stay outside the future persistent store. A candidate classified as `SECRET` or
`BLOCKED` is denied regardless of source, confidence, scope, or user preference.

### Scope

A memory can be constrained by several dimensions at once. For example, one preference may apply only
to the POP project while performing `EXPLAIN_ARCHITECTURE`. A single flat scope enum would lose that
meaning, so scope is a validated set of selectors.

```ts
type MemoryScopeSelector =
  | { dimension: 'APPLICATION'; applicationId: string }
  | { dimension: 'DOMAIN'; domain: string }
  | { dimension: 'TASK'; task: string }
  | { dimension: 'PROJECT'; projectId: string };

type MemoryScope =
  | { kind: 'GLOBAL' }
  | {
      kind: 'SCOPED';
      selectors: readonly [MemoryScopeSelector, ...MemoryScopeSelector[]];
    };
```

Validation requires unique selector dimensions, normalized domain/application identifiers, and an
explicit permitted project identity. A filesystem path alone must not create project scope.

### Typed values

Memory retains semantic type so stored knowledge cannot masquerade as policy instructions.

```ts
interface PreferenceValue {
  attribute: string;
  value: string | number | boolean | readonly string[];
}

interface KnowledgeValue {
  fact: string;
}

interface InteractionSummaryValue {
  summary: string;
}

interface MemoryValueByType {
  PREFERENCE: PreferenceValue;
  KNOWLEDGE: KnowledgeValue;
  INTERACTION_SUMMARY: InteractionSummaryValue;
}
```

### Candidate before record

An observation, deterministic parser, or model may only propose a candidate. It cannot write a durable
record. The candidate exists so schema, sensitivity, usefulness, duplication, conflict, and policy
checks happen before storage.

```ts
interface MemoryCandidate<T extends MemoryType = MemoryType> {
  id: string;
  type: T;
  scope: MemoryScope;
  key: string;
  value: MemoryValueByType[T];
  source: MemorySource;
  confidence: number;
  sensitivity: MemorySensitivity;
  retention: MemoryRetention;
  cloudPolicy: MemoryCloudPolicy;
  reason: string;
  createdAt: number;
}
```

Confidence is a bounded ranking and policy signal, not a calibrated probability. Explicit and confirmed
sources normally outrank inferred sources when relevance is equal. Inferred candidates default to an
`ASK` decision and never silently become permanent memory.

### Persistent record

Only a successful policy and confirmation path can create a record.

```ts
interface MemoryRecord<T extends MemoryType = MemoryType> {
  id: string;
  type: T;
  scope: MemoryScope;
  key: string;
  value: MemoryValueByType[T];
  searchableText: string;
  source: MemorySource;
  confidence: number;
  sensitivity: Exclude<MemorySensitivity, 'SECRET' | 'BLOCKED'>;
  retention: Exclude<MemoryRetention, { kind: 'SESSION' }>;
  status: MemoryStatus;
  cloudPolicy: MemoryCloudPolicy;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
  supersedesId?: string;
}
```

The future persistent schema must reject session memory, secrets, blocked values, malformed scopes,
and impossible retention/expiry combinations even if a caller bypasses frontend validation.

### Policy decision

```ts
type MemoryPolicyDecision =
  | { decision: 'SAVE'; reasonCodes: readonly string[] }
  | { decision: 'ASK'; reasonCodes: readonly string[]; prompt: string }
  | { decision: 'IGNORE'; reasonCodes: readonly string[] }
  | { decision: 'DENY'; reasonCodes: readonly string[] };
```

`DENY` is used for secrets, blocked sensitivity, forbidden scope, or unsafe content. `IGNORE` means a
valid but non-durable one-off fact. `ASK` is the default for inference and ambiguous scope. `SAVE` only
means eligible to persist through the trusted service; it never means eligible to perform an action.

### Query and bounded result

```ts
interface MemoryBudget {
  maxRecords: number;
  maxCharacters: number;
  maxApproximateTokens: number;
  maxCategories: number;
}

interface MemoryQuery {
  applicationId?: string;
  domain?: string;
  task?: string;
  projectId?: string;
  types?: readonly MemoryType[];
  queryText?: string;
  cloudEligibleOnly: boolean;
  now: number;
  budget: MemoryBudget;
}

interface RelevantMemory {
  record: MemoryRecord;
  score: number;
  reasons: readonly string[];
}

interface RelevantMemorySet {
  query: MemoryQuery;
  memories: readonly RelevantMemory[];
  totalCharacters: number;
  approximateTokens: number;
  truncated: boolean;
}
```

The result excludes non-active, expired, scope-incompatible, and over-budget records. Hosted AI tasks
also exclude `LOCAL_ONLY` records. Reasons remain visible so the user can inspect why personalization
was applied.

## Data flow

```text
Interaction
  -> MemoryCandidate
  -> runtime schema validation
  -> sensitivity and secret classification
  -> usefulness, duplicate, and conflict checks
  -> MemoryPolicyDecision: DENY | IGNORE | ASK | SAVE
  -> optional user confirmation
  -> trusted MemoryService
  -> MemoryStore

Authorized current context + current task
  -> MemoryQueryBuilder
  -> structured scope and type filters
  -> optional FTS5 text relevance
  -> deterministic ranking and MemoryBudget
  -> RelevantMemorySet
  -> personalization
  -> suggestion or AI task
```

Retrieval matters more than collection. POP should return a few correct memories for the current task,
not expose the whole database to a model.

## Action boundary

```text
RelevantMemorySet -> personalization -> suggestion or response

User action intent -> V0.4 ActionPolicy -> one-time approval
  -> fresh target/preconditions -> executor -> verification -> ActionLedger
```

Memory contracts contain no action permission, authority, approval token, executable command, target,
or risk override. A memory such as "user often accepts code fixes" cannot change an action decision.
Action history also cannot be promoted to memory without a separately validated candidate.

## Storage decision for later phases

SQLite remains the correct first persistence layer because POP's initial queries are structured by
type and scope, transactions can keep records and derived indexes consistent, and it requires no remote
service. FTS5 follows CRUD and scope correctness. Embeddings or a vector database are unnecessary until
retrieval evaluations prove a semantic-recall problem.

The trusted Rust backend will own database access. React, extensions, webpages, and models will call a
narrow `MemoryService`; none receives arbitrary SQL. Versioned migrations begin in Phase 85. Secrets
belong in OS-backed credential storage, never the memory database.

## Minimum Phase 83 files

Phase 83 should add only one focused, UI-independent domain package:

```text
packages/memory/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    types.ts
    schemas.ts
    types.test.mjs
```

`types.ts` owns the contracts above. `schemas.ts` performs runtime validation and normalization.
`types.test.mjs` verifies valid scopes and values plus rejection of secrets, session persistence,
duplicate scope dimensions, malformed expiry, and action-authority fields. No database, policy engine,
retrieval engine, React UI, or AI prompt integration belongs in Phase 83.

The package may depend on `@pop/shared` and a runtime-schema library selected during Phase 83. It must
not depend on React, Tauri, SQLite, provider SDKs, action executors, or adapter code.

## Phase 82 decision

The domain is defined, but implementation remains blocked by the V0.4 completion gate. Phase 82 adds
no persistent data, no context collection, no cloud transmission, and no action authority.
