# Data Flow

The V0.1 pipeline is event-driven and permission-gated:

```text
meaningful adapter event
  -> parse and validate envelope
  -> monitoring enabled?
  -> source and foreground application allowed?
  -> domain allowed, when applicable?
  -> context type allowed?
  -> classify and block sensitive content
  -> normalize to minimum context
  -> deterministic event rule
  -> show local suggestion
  -> explicit user action
  -> construct visible, minimized cloud payload
  -> provider request
  -> normalized response
  -> render in POP
```

Any failed gate drops the content before it reaches downstream systems. Foreground-process detection
provides an application identity but never grants content access by itself.

Every message will use a versioned envelope with a unique ID, source, type, timestamp, and validated
payload. AI requests carry a separate ID so stale results can be cancelled or ignored when context
changes.
