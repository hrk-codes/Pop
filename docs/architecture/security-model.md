# Security Model

## Protected information

POP protects selected text, source code, draft writing, filenames, domains, local settings, provider
credentials, and metadata that could reveal user activity.

## Trust boundaries

- Messages from VS Code and Chrome are untrusted until validated by POP Core.
- The React UI is not a security authority.
- Loopback traffic is local but is not automatically trusted.
- Hosted AI providers are outside the local trust boundary.

## Security assumptions

- The Windows account and operating system are not already compromised.
- Extensions are installed intentionally from local development builds in V0.1.
- Only minimum selected or editable context is eligible for collection.
- Secrets are never committed and raw user content is absent from production logs.

## Required controls

Use strict schemas, message-size limits, source registration, loopback-only binding, rate limits,
deny-by-default policy, sensitive-pattern blocking, local audit metadata, request cancellation, visible
cloud indicators, and safe error handling. Password fields and known credential patterns must never be
forwarded.

The initial `.env` approach is development-only. Before distribution, API keys should move to Windows
Credential Manager or another OS-backed secret store.
