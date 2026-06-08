---
description: Verify Linear and GitHub before delivery actions
---

# Pre-Delivery Check: Linear + GitHub

Before executing delivery actions (branch, commit, PR), verify:

## 1. Linear Issue Check
- Confirm the relevant issue exists in Linear
- Verify it's in correct state (should be "In Progress" or "In Review" before PR)
- Confirm assignee is set correctly
- Check labels match the type of change

## 2. GitHub Branch Check
- Confirm branch is clean (no uncommitted changes unless intentional)
- Verify no conflicts with base branch
- Check remote is accessible

## 3. Blockers
- Report any blockers before proceeding
- If blocked, ask user before continuing
- If clear, confirm ready for delivery

Format response as a brief checklist: ✅ or ❌ per item.