// Who the message is from.
//
// The first outreach message is half an introduction, and an introduction
// needs a person behind it. Without this the writer can only say "a recruiting
// firm", which is the difference between a message that earns a reply and one
// that reads like a vendor blast.
//
// The credential matters more than the biography: it is what makes the topic
// his to raise. Twenty years running talent in the Marine Corps is why a
// defense engineering leader takes the hiring question seriously.
//
// This is .mjs because the draft script and the app both read it, and the
// script cannot import TypeScript. Same split as rates.mjs and pricing.ts.
// Edit here, nowhere else.

export const sender = {
  name: "Adrian Munoz",
  firm: "ALAC",
  // The one line that earns the right to the subject.
  credential: "20 years in the Marine Corps, most of it in talent management",
  // Why the firm exists, in his own framing. Deliberately a criticism of the
  // field rather than a claim about himself.
  conviction:
    "most agencies treat candidate experience as an afterthought",
  founded: "almost four years ago",
  focus: "deep tech and defense",
};
