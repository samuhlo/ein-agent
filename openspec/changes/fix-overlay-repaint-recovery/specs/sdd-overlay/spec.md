# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-overlay

## ADDED
### Scenario: active-subagent-output-precedes-todo
title: Active subagent output precedes TODO
requirement: The system MUST render live async-subagent output in the active/WORKING region before the TODO overlay while preserving functional repaint and no-UI behavior.
Given: An interactive session displays WORKING and TODO content while an async subagent is active.
When: The terminal composes the active state and extension widgets.
Then: The live async-subagent output appears with the active/WORKING region before TODO, repaint and WORKING updates remain live, and no-UI contexts receive no overlay widget call.
