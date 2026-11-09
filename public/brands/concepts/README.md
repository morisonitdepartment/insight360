# Concept marks

One square mark per assessed brand, shown beside the outlet name in Assignments,
Visits, the audit calendar and the outlet record.

The files here are **original placeholder marks** drawn for this platform — a
coloured tile and a monogram in each concept's own colours. They are not the
concepts' real logos, and nothing in this repository reproduces a third party's
trademark: the repository is public.

## Using the real logos

Replace a file in place, keeping the same name, and the app picks it up with no
code change:

| Brand            | File                   |
| ---------------- | ---------------------- |
| Shebestan Palace | `shebestan-palace.svg` |
| Bennigan's       | `bennigans.svg`        |
| Pizza Hut        | `pizza-hut.svg`        |

A `.png` or `.jpg` works too — point `logoFile` on the brand in
`src/config/clients/<client>.ts` at the new name.

What a replacement should be:

- **Square**, or close to it. The mark is drawn in a 1:1 tile and is letterboxed
  if it is wider, which makes a wordmark unreadable at 28px.
- **Legible at 28px**, the size used in table rows.
- **Readable on both themes.** The tile sits on white in light mode and on slate
  in dark mode; a mark with its own background colour is safest.

Only put a brand's real mark here when the brand owner has agreed to it being
published on the demonstration site.
