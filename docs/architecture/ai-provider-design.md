# AI Provider Design

The AI layer will accept a normalized request and return a normalized response. Product code addresses
tasks such as `EXPLAIN_CODE`, not provider endpoint shapes.

```ts
interface AIProvider {
  generate(request: AIRequest, signal?: AbortSignal): Promise<AIResponse>;
  healthCheck(): Promise<boolean>;
}
```

The first implementation will be a Groq adapter, introduced in Phase 7. Prompts will be centralized,
task-specific, versioned, and tested. The provider adapter will own authentication, HTTP translation,
timeouts, rate-limit mapping, and response parsing.

Before the adapter is called, POP Core must already have passed permissions, removed unnecessary
metadata, blocked known secrets, received explicit user intent, and published visible cloud activity.
Most tests will use a fake provider; automated tests must not require a live Groq key.
