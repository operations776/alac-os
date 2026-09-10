// Why a candidate is no longer being marketed.
//
// A plain module rather than an export from the server action file: a
// "use server" file may only export async functions. Placed is first
// because it is the outcome the whole desk exists for.
export const CANDIDATE_OFF_REASONS = [
  "Placed",
  "Off the market",
  "Not marketable after all",
  "Went quiet",
  "Placed elsewhere",
  "Client withdrew",
];
