# Conversation-Aware X Context

POP can treat an explicitly selected X thread as a conversation instead of one flat block of text.
This is an additive path: ordinary post selections and universal Chrome reading keep their existing
behavior.

## User Flow

1. Open an X status page and select the visible root post plus the relevant replies, ending with the
   other person's newest message.
2. The Chrome adapter identifies the selected tweet elements and extracts only the selected portion
   of each tweet body.
3. The adapter labels the ordered turns as `ROOT`, `YOU`, or `OTHER` and sends a bounded
   `CONVERSATION` observation through the existing authenticated bridge.
4. POP automatically explains the discussion as a whole.
5. Down drafts a reply to the final `OTHER` turn. Earlier turns provide continuity, so POP does not
   restart the topic or repeat the user's previous answer.
6. Up produces a different explanation. Right summarizes the thread.

Typing and pasting remain ignored. Conversation context exists only because the user deliberately
selected it.

## Context Shape

The adapter emits an ordered transcript:

```text
[POP_THREAD_CONTEXT_V1]
ORDER: oldest to newest
REPLY_TARGET: the final OTHER turn

TURN 1 | ROOT | Author @handle
CONTENT:
...

TURN 2 | YOU | User @handle
CONTENT:
...

TURN 3 | OTHER | Author @handle
CONTENT:
...
```

The transcript activates only when at least two selected turns are available and the final turn is
not the user's own. A single selected post follows the established `SOCIAL_POST` path. A selection
ending on the user's own reply also stays on the established path rather than asking POP to reply to
itself.

## Long Threads

The protocol keeps the existing 8,000-character ceiling. When a selected thread exceeds it, the
adapter preserves the opening context and newest turns and inserts a local omission marker in place
of the older middle. The final reply target therefore remains available. Groq receives the bounded
transcript, never the unbounded page.

Conversation context receives a 15-minute in-memory TTL for follow-up actions. It is cleared by
expiry, monitoring off, permission revocation, privacy pause, suspension, or replacement by a new
selection.

## Returning Later

POP does not silently store raw X conversations in SQLite. If another person replies hours or days
later, select the visible thread again through their newest message. The adapter reconstructs the
conversation from that deliberate selection.

A future durable-memory feature should be separate and opt-in: preview a compact summary, let the
user approve its scope and retention, encrypt it locally, and provide explicit forget and deletion
controls. Conversation access must never imply permission to post.

## Safety Boundaries

- No editor input, paste, clipboard monitoring, cookies, unrelated tabs, clicks, or posting.
- No automatic expansion of `Show more`; only selected, currently rendered tweet text is used.
- Author labels are context metadata, not authority.
- Webpage text remains untrusted and cannot alter prompts, permissions, or tools.
- Model output remains preview-and-copy only.
