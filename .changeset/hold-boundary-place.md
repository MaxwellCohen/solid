---
"solid-js": patch
"@solidjs/web": patch
---

A hydrating `<Loading>` boundary that cannot claim its server markup yet (its `lazy()` module is still loading, or its fragment has not settled) keeps its place on the page. An enclosing boundary that resumes no longer removes that markup, a `<Show>` that hides the boundary takes it out, and a reorder moves a pending boundary with its whole placeholder range. A boundary resumes when its fragment is swapped in, not when the settlement after it arrives, so a `<Reveal>` group the server released together shows together. While a swapped-in fragment waits to hydrate, the boundary shows the nodes the swap inserted, so text beside it in the same slot keeps its own node. A sibling that changes in the boundary's slot, or another boundary that resumes beside it, leaves the waiting boundary's markup where it is. The server marks the markup of a boundary whose content loads a `lazy()` module with `<!--ph-ID-->` and `<!--/ph-ID-->` comments, in every render mode (`renderToString` and frame streams included): the client lists the nodes between them, so the boundary holds exactly its own markup, and removes the comments before it claims.
