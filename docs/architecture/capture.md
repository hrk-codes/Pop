# Visual Capture

## Purpose

Capture provides one approved image when adapters and UIA cannot answer a user’s question. The first
supported mode is manual region selection. It is not screen recording or ambient monitoring.

## Trust boundary

The Rust backend owns Windows capture APIs, window/display identity, DPI conversion, permission checks,
raw buffers, preprocessing, and cleanup. React may request a flow and display status/preview but cannot
access privileged capture APIs or provider secrets directly.

## Permission-before-capture flow

```text
monitoring on?
  -> application allowed?
  -> VisualPermission sufficient?
  -> expected foreground identity still valid?
  -> target/display geometry valid?
  -> sensitive/protected-content policy passes?
  -> one-time consent, when required?
  -> capture one region
```

Any failed gate produces no frame.

## Session lifecycle

```text
REQUESTED -> PERMISSION_CHECK -> SELECTING -> CAPTURING -> PREPROCESSING
  -> READY_FOR_ANALYSIS -> ANALYZING -> COMPLETED -> DESTROYED
```

`PERMISSION_DENIED`, `CAPTURE_FAILED`, `ANALYSIS_FAILED`, and `CANCELLED` transition directly toward
resource cleanup and `DESTROYED`. One-time permission expires with the operation.

## Geometry and latency

`CaptureTarget` carries a display ID plus a typed rectangle in an explicit coordinate space. Selection
and capture must account for virtual-desktop coordinates, negative monitor origins, per-monitor DPI,
and movement between selection and capture. A changed target cancels instead of risking unrelated
content.

The capture pipeline is opened only for the one frame and released immediately. Local crop, dimension
inspection, aspect-preserving resize, PNG encoding, and payload estimation happen before cloud access.

## Privacy behavior

Raw frames are memory-only by default. Normal operation creates no `captures/`, `screenshots/`, history,
or recording directory and writes no image bytes to logs. Preview cancel destroys temporary visual
context. Metadata-only audit events may record app ID, dimensions, mode, duration, provider, and
`stored=false`.

POP should attempt `WDA_EXCLUDEFROMCAPTURE` for its own supported top-level windows and report failure
accurately. It must not claim exclusion when Windows or the environment does not support it.

## Failure behavior

Protected content, denied access, invalid geometry, display changes, target changes, encoder failure,
and resource exhaustion fail closed with user-readable status. POP never bypasses application or OS
capture restrictions.

## Future extension

An approved one-shot foreground-window snapshot may be added only after manual region capture is stable.
Continuous, periodic, hidden, or background capture remains outside V0.3.
