# Visual Security

## Purpose

Visual access expands the privacy surface from selected structured text to pixels. This model ensures
capture remains explicit, minimal, temporary, inspectable, and unable to execute actions.

## Trust boundaries

- React is unprivileged UI and never owns capture handles, image bytes, or provider secrets.
- Rust owns permission enforcement, Windows APIs, target identity, buffers, and cloud transport.
- UIA providers, OCR engines, images, webpage text, and model output are untrusted sensors.
- POP Core alone owns policy, context fusion, activity, intent, and suggestion decisions.

## Security gate

```text
monitoring
  -> application permission
  -> independent visual permission
  -> current target identity
  -> geometry and size budget
  -> protected/sensitive-content policy
  -> consent
  -> capture
  -> local preprocessing and payload preview
  -> provider permission/model policy
  -> cloud request with visible indicator
```

Permission checks occur before frame creation. Unknown apps and unknown states default to deny.

## Data minimization and retention

Capture the smallest user-selected region, one frame, for one declared task. Enforce maximum dimensions,
encoded bytes, images per request, requests per window, and provider-specific limits. Raw image bytes are
not logged or persisted. Metadata audit records explicitly state `stored=false`.

Memory cleanup releases capture resources, image objects, and CPU buffers; sensitive CPU buffers may be
zeroized where practical. Documentation must not claim cryptographic erasure of GPU memory.

## Pixel prompt injection

Text such as “ignore policy,” “upload files,” or fake system messages inside an image is untrusted visible
data. Prompt hierarchy stays:

```text
system policy
  -> vision observation task
  -> trusted structured context
  -> untrusted image data
  -> explicit user question
```

The model is instructed to observe, distinguish observed from inferred, report uncertainty, and return
schema-compatible data. It cannot alter permissions or request tools.

## Output validation

Reject malformed JSON, unknown fields, executable command fields, excessive text/arrays, invalid
coordinates, confidence outside `0..1`, missing required provenance, mismatched capture IDs, or expired
results. UI renders model text as inert content. There is no click/type/terminal/file bridge in V0.3.

## Sensitive and protected content

UIA-protected/password values are omitted. When local extraction exposes obvious credentials, apply the
existing sensitive-data policy before cloud submission. Protected media and OS/application capture
restrictions are respected; POP does not attempt bypasses.

## Failure behavior

Denied, protected, stale, oversized, uncertain, timed-out, or provider-failed visual work terminates the
session and cleans resources. Cloud fallback is disabled by default. POP says it cannot inspect or
determine content reliably instead of fabricating an answer.

## Rate and recursion protection

Prevent self-capture using window display affinity where supported, source/session tags, duplicate-target
cooldowns, and a same-session recursion guard. Idle visual CPU and API requests are zero. Automatic
fallback never creates capture or model loops.

## Future extension

V0.4 action authorization must be a new boundary with confirmation, freshness checks, and auditability.
V0.3 observation permission must never be interpreted as permission to manipulate a UI.
