# Windows UI Automation

## Purpose

Microsoft UI Automation (UIA) gives POP semantic, read-only information about a foreground Windows
interface when no dedicated adapter is available. It is attempted before image capture because names,
control types, focus, and bounds are usually faster and more reliable than visual inference.

## Technical boundary

The trusted Rust backend acts as a UIA client through narrowly enabled features of the `windows` crate.
COM objects remain inside the Windows platform module. TypeScript and the rest of POP receive only
normalized serializable observations.

V0.3 may read properties. It must not use `InvokePattern`, `SetValue`, selection manipulation,
expand/collapse, scrolling, or any other control pattern that changes another application.

## Data flow

```text
foreground window identity
  -> structured-context permission
  -> COM/UIA root for that window
  -> focused/relevant bounded subtree
  -> protected-value removal
  -> normalized UIAutomationObservation
  -> expiry + provenance
  -> ContextState
```

The initial prototype reads a root and limited children only. A later phase may inspect a relevant
subtree, never the entire desktop tree by default.

## Required limits

- Maximum depth
- Maximum normalized element count
- Maximum total text characters
- Maximum value-preview length
- Maximum traversal duration
- Cancellation and COM error mapping

Limits are configuration owned by POP Core. Hitting a limit marks the observation `truncated`; it does
not trigger an unbounded retry.

## Failure behavior

Broken, slow, elevated, protected, or unsupported UIA providers fail safely with metadata and no stale
tree reuse. Password/protected fields omit values. A partial observation may be used only when its
limitations remain attached and it is sufficient for the user’s purpose.

## Privacy behavior

UIA is scoped to the expected foreground window and relevant subtree. Raw COM objects and unrelated
window trees are never logged. Production logs contain counts, duration, truncation, and failure codes,
not user-visible text.

## Performance approach

Inspection is event/purpose-driven, not a polling loop. Work runs off the UI thread with cancellation
and a strict time budget. Normalization happens once at the native boundary to avoid repeated COM calls.

## Future extension

V0.4 may evaluate carefully approved UI actions, but read and action interfaces must remain separate.
Nothing in the V0.3 observation model implies authority to manipulate a control.
