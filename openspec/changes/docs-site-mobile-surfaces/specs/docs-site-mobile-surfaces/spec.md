# OpenSpec Delta
format: openspec-delta/v1
domain: docs-site-mobile-surfaces

## ADDED
### Scenario: mobile-menu-footer
title: Mobile menu footer keeps essential documentation actions available
requirement: The system MUST provide a mobile menu footer that keeps the essential documentation actions available in a compact mobile surface.
Given: The mobile documentation navigation is open.
When: The visitor reaches the mobile menu footer.
Then: The visitor can access the intended content navigation, table of contents, and search actions without requiring the desktop header layout.

### Scenario: mobile-menu-toggle
title: Mobile menu toggle exposes the documentation navigation
requirement: The system MUST provide an accessible Starlight mobile menu toggle that opens and closes the documentation navigation without altering the delivered desktop shell.
Given: A visitor views any documentation route at a mobile viewport.
When: The visitor activates the mobile menu toggle.
Then: The documentation navigation opens or closes with an accessible control state and preserves the current route context.

### Scenario: mobile-table-of-contents
title: Mobile table of contents remains legible and usable
requirement: The system MUST provide a legible mobile table of contents surface for the current document while preserving Starlight heading navigation semantics.
Given: A documentation document contains headings and is viewed at a mobile viewport.
When: The visitor opens or uses the mobile table of contents.
Then: The table of contents is available, readable, and navigates to the selected heading without removing the document content or desktop shell behavior.
