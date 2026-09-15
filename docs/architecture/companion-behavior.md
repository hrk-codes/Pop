# POP Companion Behavior

POP combines a serious work assistant with a small, expressive desktop presence. Personality is a presentation feature. It does not grant new observation, memory, model, or action authority.

## Behavior Layers

### Task behavior

Task behavior begins with approved context and follows the normal POP policy path. It can explain, improve, summarize, or draft a reply. Completed task responses use an adaptive 10 to 90 second reading period: a short two-line answer leaves promptly, while a dense explanation remains available longer. The deadline is absolute so a bubble cannot remain stuck open merely because it appeared beneath the pointer. The result remains available from the indicator beside POP after the bubble closes.

### Ambient behavior

Ambient behavior uses a local, reviewed message library. It does not call Groq, inspect page text, or write memory. POP may offer one short check-in after a 75-to-150-second cooldown when:

- monitoring is enabled;
- personality is enabled;
- POP is not suspended or privacy-paused;
- there is no active context;
- no task has started for at least 45 seconds; and
- the user has paused input for at least 10 seconds but has not been away for more than eight minutes.

Ambient messages close after 9 to 14 seconds. They may suggest a break or ask a playful question, but they cannot start music, open applications, or perform another action.

### Expression behavior

The avatar maps trusted runtime states to visible expressions: sleeping, attentive, thinking, speaking, success, blocked, playful, mischievous, excited, dramatic, impatient, silly, curious, encouraging, and privacy. Mood messages alter the mouth, brows, cheeks, leaf, and body motion rather than changing text alone.

Cursor gaze is strictly idle behavior. It runs only while monitoring and personality are enabled, no context or task is active, POP is not suspended or privacy-paused, and the work-state machine is idle or attentive. Work immediately centers the eyes and cancels idle gestures. Explanation, writing, and reply tasks use thoughtful, focused, and friendly mouth rhythms respectively. The first silent face performance begins after about 2.5 seconds, followed by a non-repeating eye, brow, leaf, or mouth expression every 6 to 14 seconds. POP's body remains stationary; personality never shakes or moves the avatar around the screen. These performances never open a text box, inspect content, or call a model.

Long selections are bounded locally before they cross the adapter bridge. When an excerpt exceeds the protocol limit, POP preserves its opening and conclusion and marks the omitted middle instead of silently discarding the ending. Long-form replies receive a larger private reasoning budget, a longer request deadline, and strict grounding instructions; the visible result is still limited to a compact, useful contribution.

Native code reduces the global cursor position to a normalized gaze direction. Raw coordinates are not logged, persisted, or sent to an AI provider.

## Privacy Shield

The native privacy guard runs independently of the React interface. While manual monitoring is enabled, it classifies the foreground process and title every 600 milliseconds. It does not retain either value.

The guard pauses adapter intake for known password managers, authentication screens, mail clients, photo and video applications, sensitive browser pages, media files opened in browsers, and sensitive Explorer folders. When triggered, POP:

1. marks the runtime as privacy-paused;
2. rejects new context;
3. clears the active context;
4. cancels in-flight generation;
5. tells adapters that monitoring is unavailable;
6. hides the menu and speech windows; and
7. keeps only the avatar visible with a privacy expression.

Leaving the private surface restores the user's previous manual monitoring setting. The guard does not silently turn on a platform the user disabled.

Foreground classification is defense in depth, not a complete data-loss-prevention system. Source permissions, domain checks, secret detection, short context TTLs, and explicit action approval remain mandatory.

## User Control

The Personality menu contains a persistent **Playful check-ins** switch. Turning it off stops ambient speech and gaze behavior without disabling task assistance. Turning monitoring off clears context and prevents all sensing. Minimizing POP to the tray suspends the complete companion runtime.
