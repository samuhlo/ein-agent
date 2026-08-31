---
description: Sync Linear and GitHub state for the active project
---

# Linear + GitHub Sync Check

Check the current state of the active project:

## 1. Linear State
- List open issues (Todo, In Progress states)
- Note any issues blocked or awaiting review
- Report project health: "X open, Y in progress, Z blocked"

## 2. GitHub State (if applicable)
- Check for open PRs linked to current issues
- Note draft/WIP PRs
- Report CI status if available

## 3. Alignment Check
- Compare Linear issue states with GitHub PR states
- Flag any divergence (issue done but PR not merged, etc.)

Report: aligned or diverged with specific items.