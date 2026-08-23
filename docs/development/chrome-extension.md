# Chrome Extension Development

Implementation begins in Phase 9. The extension will use Manifest V3 and request the narrowest host
permissions practical for approved test domains.

Collection starts with selected text and focused editable-element metadata. Domain checks happen before
forwarding, unknown domains are denied, and POP Core validates every message again. No posting, form
submission, browser-history collection, or whole-browser inspection belongs in V0.1.
