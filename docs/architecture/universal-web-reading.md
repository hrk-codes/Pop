# Universal Web Reading

## Purpose

Universal web reading turns POP from an X-specific companion into a permission-scoped reading layer
for ordinary Chrome pages. The user highlights a passage; POP explains it automatically, creates a
different explanation with Up, drafts a grounded response with Down, or summarizes it with Right.
The current avatar, speech surface, and interaction language remain unchanged.

## Runtime Flow

```text
Deliberate browser selection
  -> length-aware stability delay
  -> page and domain policy
  -> bounded ContextObservation (WEB)
  -> authenticated native or loopback bridge
  -> Rust permission, foreground, privacy, and secret checks
  -> source-aware prompt plan
  -> streaming Groq response
  -> POP speech preview
```

## Why These Stacks

**WXT and Chrome Manifest V3** provide a typed extension build and isolated content scripts. The
adapter can observe standard browser selections without injecting application logic into the page.
Outside X it does not inspect input events or transmit page-wide text.

**The versioned Zod and Serde protocol** makes `WEB` an explicit source rather than disguising every
site as X. Type, size, hostname, application, and timestamp validation occur on both sides of the
bridge.

**Chrome Native Messaging with authenticated loopback fallback** connects the short-lived MV3 worker
to the local application without a pairing-code workflow. The Rust process remains the authority.

**Rust POP Core** owns monitoring, web permission, foreground validation, private-domain denial,
secret detection, cancellation, and context expiry. A content script cannot grant itself access by
changing a message field.

**Groq with source-aware prompt planning** keeps quick selections fast while allowing technical or
long excerpts more reasoning budget. The prompt separates system policy from untrusted source JSON
and chooses a strategy for technical material, arguments, questions, correspondence, narratives, or
general prose. Output must remain grounded in the selected evidence.

## Privacy Boundary

Web reading is off until the user enables it in POP. Known mail, identity, password-manager, payment,
and photo domains are excluded from injection and denied again in Rust. Accepted text remains in
memory only: two minutes for small selections, three minutes for medium passages, and five minutes
for large excerpts. Monitoring off, permission revocation, suspension, private-surface detection, or
new context clears it and cancels active generation.

The extension does not read other tabs, cookies, browser history, screenshots, or text the user did
not select. Standard DOM selection is the present boundary; Chrome internal pages, image-only PDFs,
and canvas-rendered editors need a future accessibility or explicit capture path.
