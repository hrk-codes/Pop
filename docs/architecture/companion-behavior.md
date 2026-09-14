# POP Companion Behavior

POP combines a serious work assistant with a small, expressive desktop presence. Personality is a presentation feature. It does not grant new observation, memory, model, or action authority.

## Behavior Layers

### Task behavior

Task behavior begins with approved context and follows the normal POP policy path. It can explain, improve, summarize, or draft a reply. Completed task responses remain visible for an adaptive 30 to 120 seconds. Hovering the bubble pauses dismissal. The result remains available from the indicator beside POP after the bubble closes.

### Ambient behavior

Ambient behavior uses a local, reviewed message library. It does not call Groq, inspect page text, or write memory. POP may offer one short check-in after a three-to-six-minute cooldown when:

- monitoring is enabled;
- personality is enabled;
- POP is not suspended or privacy-paused;
- there is no active context;
- no task has started recently; and
- the user has paused input for at least 15 seconds but has not been away for more than eight minutes.

Ambient messages close after 9 to 14 seconds. They may suggest a break or ask a playful question, but they cannot start music, open applications, or perform another action.

### Expression behavior

The avatar maps trusted runtime states to visible expressions: sleeping, attentive, thinking, speaking, success, blocked, playful, curious, encouraging, and privacy. POP's eyes may follow the cursor while monitoring and personality are enabled. Native code reduces the global cursor position to a normalized gaze direction. Raw coordinates are not logged, persisted, or sent to an AI provider.

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
