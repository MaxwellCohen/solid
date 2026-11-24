---
"solid-js": minor
"@solidjs/web": minor
---

`renderToStream` writes each streamed `<Loading>` boundary as a declarative-patching range (`<?start name>`…`<?end>`) and its content as a `<template for>`. A browser that supports declarative partial updates shows streamed content, `<Reveal>` order and `<Errored>` outcomes included, with JavaScript off; every other browser swaps it in with the inline runtime as before.
