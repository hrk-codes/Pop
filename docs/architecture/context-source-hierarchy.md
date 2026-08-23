# Context Source Hierarchy

## Purpose

POP chooses the least invasive source that can answer the current question reliably. Vision is a final
fallback sensor, not the default context mechanism.

```text
application adapter
  -> structured application API
  -> Windows UI Automation
  -> local OCR, only if later justified
  -> visual model
```

The resolver stops as soon as an authorized source provides sufficient fresh context. “Unknown app”
does not mean “capture the screen.”

## Source model

| Source          | Example                               | Initial reliability | Cost/latency     | Privacy surface               |
| --------------- | ------------------------------------- | ------------------- | ---------------- | ----------------------------- |
| `VSCODE_API`    | Selection, language, diagnostics      | Very high           | Very low         | Narrow and structured         |
| `BROWSER_DOM`   | Approved-domain selection/draft       | Very high           | Very low         | Narrow but webpage-controlled |
| `UI_AUTOMATION` | Focused control, dialog, button names | High                | Low and bounded  | Foreground subtree only       |
| `OCR`           | Text from an approved crop            | Medium/high         | Local processing | Image region enters memory    |
| `VISION`        | UI scene interpretation               | Variable            | Highest/network  | Approved image leaves device  |

Reliability is a policy baseline, not certainty. Freshness, schema completeness, corroboration, and
known provider limitations modify confidence.

## Trust boundary

Every adapter, UIA provider, OCR engine, and model is a sensor. Its output is untrusted until runtime
schema, size, permission, sensitivity, source, and freshness checks pass. No source can grant itself a
higher permission or select an executable action.

## Data flow

```text
user purpose
  -> monitoring/application permission
  -> source availability
  -> source-specific permission
  -> bounded observation
  -> normalized item with provenance + TTL
  -> context-state engine
  -> activity/intent/confidence/suggestion policy
```

If UIA is sufficient, no screenshot is created. If a visual model is required, explicit visual consent
and a valid capture target are checked before capture.

## Failure behavior

Unavailable or insufficient sources return typed outcomes such as `unavailable`, `denied`, `stale`, or
`insufficient`; they do not fabricate context. The resolver may offer the next authorized source, but it
must not silently escalate from structured data to capture or from one cloud provider to another.

## Privacy and latency

Structured-first resolution reduces payload size, local CPU, cloud latency, and accidental disclosure.
Idle sensor CPU and API traffic must be zero or near zero. UIA traversal is purpose-driven and bounded;
visual capture is one-shot and user-visible.

## Future extension

New context providers may be registered with declared capabilities, reliability, permission needs, and
cost. Provider registration must not change the fixed rule that policy and user control remain in POP
Core.
