# Architecture Overview

POP V0.1 is five cooperating systems with strict ownership boundaries.

```text
VS Code adapter ----\
                     > versioned localhost protocol -> POP Core -> AI provider
Chrome adapter -----/                              |          |
                                                   |          +-> minimized HTTPS payload
                                                   +-> local state
                                                          |
                                                    Tauri/React UI
```

## Runtime boundaries

- **Desktop UI:** Presents status, controls, suggestions, responses, and transparent privacy details.
- **POP Core:** Owns monitoring state, permissions, foreground-app awareness, validation, context
  filtering, event rules, AI routing, storage, rate limits, and safe logging.
- **VS Code adapter:** Collects only approved structured editor context after meaningful events.
- **Chrome adapter:** Collects only approved structured page context on allowed domains.
- **AI provider layer:** Translates minimized provider-independent tasks to hosted API calls.

Applications depend on focused packages; packages do not depend on application UI. Security decisions
must remain usable without React, VS Code, Chrome, or a particular AI provider.

## Phase ownership

Phase 0 creates boundaries and tooling only. Desktop execution begins in Phase 1, persistence in Phase
2, foreground awareness in Phase 3, and local communication in Phase 4. Integrations and AI are added
only after the layers they depend on have tests.
