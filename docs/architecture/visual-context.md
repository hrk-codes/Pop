# Visual Context Domain Model

## Purpose

The visual domain converts read-only UIA, optional OCR, or one-shot vision results into short-lived,
source-labelled observations. A model observes; POP Core decides permissions, activity, intent,
confidence, and suggestions.

This is a Phase 26 design. No schema package, Windows API, OCR provider, or visual model is implemented
until the V0.2 completion gate passes.

## Shared primitives

```ts
type UnixMilliseconds = number;
type ConfidenceScore = number; // Runtime schema enforces 0 <= value <= 1.

type ContextSource = 'VSCODE_API' | 'BROWSER_DOM' | 'UI_AUTOMATION' | 'OCR' | 'VISION';

interface ObservationProvenance {
  source: ContextSource;
  confidence: ConfidenceScore;
  observedAt: UnixMilliseconds;
  expiresAt: UnixMilliseconds;
}

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: 'PHYSICAL_PIXELS';
}
```

Coordinates are finite integers, dimensions are positive and bounded, and confidence is advisory. A
source baseline never overrides contradictory freshness or validation evidence.

## VisualPermission

Structured and visual access are separate policies.

```ts
type VisualPermission = 'NONE' | 'MANUAL_REGION' | 'FOREGROUND_SNAPSHOT';
```

`NONE` is the default for every application, including unknown applications. `MANUAL_REGION` permits a
user-selected one-shot crop. `FOREGROUND_SNAPSHOT` is a distinct later capability, never implied by
manual access. An allow-once grant is operation-scoped metadata, not a persisted fourth permission.

## CaptureTarget

```ts
type CaptureTarget =
  | {
      kind: 'REGION';
      displayId: string;
      bounds: Rectangle;
      expectedWindowId?: string;
    }
  | {
      kind: 'WINDOW';
      windowId: string;
      expectedApplicationId: string;
    };
```

The discriminated union prevents loose coordinates and makes identity revalidation mandatory. Phase 32
produces only `REGION`; the `WINDOW` variant reserves the approved snapshot path without enabling it.

## CaptureSession

```ts
type CaptureStatus =
  | 'REQUESTED'
  | 'PERMISSION_CHECK'
  | 'SELECTING'
  | 'CAPTURING'
  | 'PREPROCESSING'
  | 'READY_FOR_ANALYSIS'
  | 'ANALYZING'
  | 'COMPLETED'
  | 'DESTROYED'
  | 'PERMISSION_DENIED'
  | 'CAPTURE_FAILED'
  | 'ANALYSIS_FAILED'
  | 'CANCELLED';

interface CaptureSession {
  id: string;
  target?: CaptureTarget;
  applicationId?: string;
  permission: VisualPermission;
  consent: 'PERSISTED_PERMISSION' | 'ALLOW_ONCE';
  createdAt: UnixMilliseconds;
  expiresAt: UnixMilliseconds;
  status: CaptureStatus;
}
```

Transition validation rejects skipped permission states and terminal-state reuse. Image bytes are not a
field on serializable session state; they remain in an opaque native resource owned by Rust.

## UI automation observations

```ts
type UIControlType =
  | 'WINDOW'
  | 'DIALOG'
  | 'DOCUMENT'
  | 'TEXT'
  | 'BUTTON'
  | 'INPUT'
  | 'CHECKBOX'
  | 'MENU'
  | 'LIST'
  | 'UNKNOWN';

interface UIElementObservation {
  id: string;
  name?: string;
  controlType: UIControlType;
  bounds?: Rectangle;
  enabled?: boolean;
  focusable?: boolean;
  focused?: boolean;
  valuePreview?: string;
  protected: boolean;
  children: UIElementObservation[];
}

interface UIAutomationObservation {
  id: string;
  applicationId: string;
  windowId: string;
  root: UIElementObservation;
  elementCount: number;
  truncated: boolean;
  provenance: ObservationProvenance & { source: 'UI_AUTOMATION' };
}
```

Protected fields have no `valuePreview`. Trees are bounded before serialization, and validation checks
that reported counts, bounds, depth, and total text fit policy.

## OCRObservation

```ts
interface OCRTextLine {
  text: string;
  bounds?: Rectangle;
  confidence?: ConfidenceScore;
}

interface OCRObservation {
  id: string;
  captureSessionId: string;
  lines: OCRTextLine[];
  language?: string;
  truncated: boolean;
  provenance: ObservationProvenance & { source: 'OCR' };
}
```

This contract does not select an OCR engine. Phase 44 implements a provider only if measurement shows a
material privacy, latency, accuracy, or cost benefit.

## VisualObservation

```ts
type VisualElementType =
  'BUTTON' | 'TEXT' | 'INPUT' | 'DIALOG' | 'MENU' | 'ICON' | 'IMAGE' | 'UNKNOWN';

interface VisualTextObservation {
  text: string;
  confidence?: ConfidenceScore;
  bounds?: Rectangle;
}

interface VisualElementObservation {
  type: VisualElementType;
  label?: string;
  bounds?: Rectangle;
  confidence: ConfidenceScore;
  evidence: 'OBSERVED' | 'INFERRED';
}

interface VisualObservation {
  id: string;
  captureSessionId: string;
  sceneType: string;
  summary: string;
  visibleText: VisualTextObservation[];
  elements: VisualElementObservation[];
  warnings: string[];
  confidence: ConfidenceScore;
  provenance: ObservationProvenance & { source: 'VISION' };
}
```

Unknown fields, executable command fields, oversized arrays/text, invalid bounds, and out-of-range
confidence are rejected. Model self-confidence is not treated as calibrated truth.

## VisualInput, VisionTask, and VisionRequest

```ts
interface VisualInput {
  mediaType: 'image/png';
  width: number;
  height: number;
  encodedBytes: number;
  dataRef: string; // Opaque backend reference; never a frontend secret-bearing URL.
}

type VisionTask =
  | 'UNDERSTAND_UI'
  | 'READ_VISIBLE_ERROR'
  | 'EXPLAIN_REGION'
  | 'DESCRIBE_STATE'
  | 'EXTRACT_VISIBLE_TEXT';

interface VisualPrivacyMetadata {
  applicationId: string;
  permission: VisualPermission;
  consent: 'PERSISTED_PERMISSION' | 'ALLOW_ONCE';
  rawImageStored: false;
}

interface VisionRequest {
  id: string;
  captureSessionId: string;
  task: VisionTask;
  image: VisualInput;
  structuredContext?: UIAutomationObservation;
  userQuestion?: string;
  requestedOutput: 'STRUCTURED';
  privacy: VisualPrivacyMetadata;
}
```

The backend resolves `dataRef` only after permission, budget, sensitivity, and provider-policy checks.
React and extensions never receive the Groq key or make provider requests.

## VisionProvider

```ts
interface VisionCapabilities {
  tasks: VisionTask[];
  maxImages: number;
  maxWidth: number;
  maxHeight: number;
  maxEncodedBytes: number;
  structuredOutput: boolean;
}

interface VisionProvider {
  analyze(request: VisionRequest, signal?: AbortSignal): Promise<VisualObservation>;
  healthCheck(): Promise<boolean>;
  capabilities(): VisionCapabilities;
}
```

The model ID is provider configuration. Automatic fallback is off by default, and user content never
moves to a different provider without prior permission.

## Sensor relationship

```text
UI Automation -> sufficient normalized observation ------------------+
       |                                                               |
       +-> insufficient -> visual permission -> one-shot capture       |
                                          -> VisionProvider             |
                                          -> VisualObservation ---------+
                                                                          |
                                                                          v
                                            provenance-preserving ContextState
                                              -> Activity -> Intent
                                              -> Confidence -> Suggestion
                                              -> explicit user action
```

Structured UIA wins a conflict with uncertain vision while both observations remain available for
explanation. Fusion never discards provenance or silently turns inference into fact.

## Expiration and cleanup

Visual observations use short TTLs and invalidate on foreground-window change, target movement/closure,
refresh, monitoring off, permission revocation, or context replacement. Expiration removes image-derived
content from active context. Raw buffers are released after analysis and never enter long-term memory.

## Minimum Phase 27 implementation

Create one package only when the V0.2 gate passes:

```text
packages/visual-types/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    types.ts
    schemas.ts
    schemas.test.ts
```

`types.ts` owns serializable contracts. `schemas.ts` validates unknown process/provider data with strict
schemas. Tests cover valid examples, unknown fields, confidence ranges, geometry, bounds, text/array
limits, lifecycle states, and executable-output rejection. Phase 27 does not add providers, prompts,
Windows APIs, UI, image files, or empty OCR/security packages.

The package may depend only on runtime-schema tooling and `@pop/shared`. It must not depend on React,
Tauri, Groq, context-state, suggestions, or a concrete model.

## Failure and future behavior

Invalid or uncertain observations are rejected or surfaced with uncertainty; POP does not invent missing
UI. Later phases add Rust UIA/capture equivalents and keep process-boundary validation independent.
V0.4 actions must use separate permissions and fresh verification; these observation types grant no
authority to click, type, submit, delete, or execute.
