// Why something was taken off the boards.
//
// A plain module rather than an export from the server action file: a
// "use server" file may only export async functions, so a constant living
// beside its action breaks the build. Read by the dialog on the client and
// by anything that renders a dismissed list.
//
// Free text is always accepted. These are the answers worth one click.
export const DISMISS_REASONS = {
  signal: [
    "Not relevant to us",
    "Already actioned",
    "Duplicate of another signal",
    "Wrong company",
    "Too old to matter",
  ],
  role: [
    "Not our discipline",
    "Already raised it",
    "Filled or withdrawn",
    "Wrong location",
    "Not worth the fee",
  ],
};
