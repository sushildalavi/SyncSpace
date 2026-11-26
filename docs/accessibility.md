# Accessibility

The target is WCAG 2.2 AA. This records what has been checked and, as important, what hasn't.

## Checked automatically on every pull request

- axe's WCAG 2.2 A and AA rules on the sign-in pages, every signed-in page and the share, two-factor and account
  deletion screens, mostly in light and dark (`e2e/ui.spec.ts`, `e2e/account.spec.ts`, `e2e/sharing.spec.ts`).
- Each page has its own title, one main region, one first-level heading and no skipped heading level.
- No horizontal scrolling at 320 px.
- In-app navigation renames the page, which is what the route announcer reads.
- Keyboard: skip link, command menu, mobile drawer and dialog focus, formatting shortcuts, and that Tab can leave the
  editor from inside a list.

## Structure review (2026-11-25)

The accessibility tree, headings, titles, focus order, forced-colors focus and 320 px reflow were inspected in
Chromium, and these were fixed:

| Problem | Fix |
| --- | --- |
| Most pages were titled "SyncSpace" | Every page names itself |
| The document page had no main heading | Added one carrying the document title |
| A sidebar label was a heading above the page heading | No longer a heading |
| Empty and error states skipped heading levels | Level follows the page |
| The 404 page had no main region | New page with a heading and a way home |
| The security page overflowed at 320 px | Buttons wrap |
| The title field had a faint focus indicator | Standard focus ring |
| "1 people here" | "1 person here" |

## Not done

- **No screen-reader testing.** Nobody has used the app with VoiceOver, NVDA, JAWS or TalkBack. Inspecting the
  accessibility tree does not show how announcements sound or whether live editing is understandable.
- No testing with people who use assistive technology, and no manual audit against every criterion.
- Collaborators' arrivals, departures and edits are not announced.
- Browsers other than Chromium were not checked.

A short manual pass with VoiceOver would be: sign in, create a document, format a list, open Share, add a person, turn on
two-factor sign-in, and have a second person edit while you read.
