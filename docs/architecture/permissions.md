# Permission Model

POP is deny-by-default. Monitoring is a master gate, followed by source, application, domain, context
type, and sensitive-content checks.

Initial application policy permits VS Code and Chrome as integration types, but this does not permit
all content inside them. Chrome additionally requires an allowed domain; initial candidates are `x.com`
and `github.com`, while unknown domains remain denied.

Turning monitoring off stops adapters from providing usable contextual content and prevents contextual
cloud requests. The visible companion and settings may remain available.

Permission state will be persisted locally and enforced by POP Core. Adapters also perform early checks
to minimize collection, but adapter-side checks are defense in depth rather than the authority.
