Build the top card in the OneStack Build Backlog.

1. Search the Notion Build Backlog for the top card with **Status = Ready** and **Blocked NOT checked**
   (prefer higher Priority; if tied, lowest **Seq**). Skip Blocked cards and any card whose
   **Depends on** cards are not Done.
2. Show me its spec + acceptance criteria in plain English and **STOP** for my confirmation.
3. On confirm: set the card **In progress**; plan first (if it touches payments / auth / tenancy / PII /
   the workflow engine / the Pack Contract, **STOP** for human review); build to spec; write tests
   including the **tenant-isolation test** + the **Playwright golden flow**; open a PR; set the card
   **In review** with the PR link.
4. Summarise what to check in staging.

Never invent scope. Smallest slice that satisfies the card.
