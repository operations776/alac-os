// The only place the product name and identity live. Never hardcode these
// anywhere else, so a rename stays a one file change.

export const brand = {
  name: "ALAC OS",
  shortName: "ALAC",
  tagline: "Know who to work, why they matter, and what to do next.",
  // The interface accent, taken from alachrsolutions.com rather than chosen:
  // it is the periwinkle the site sets every heading in. Mirrored as
  // --alac-accent in globals.css.
  //
  // The corporate navy #1a2563 is the ground the product sits on rather than
  // an accent, because navy text on a navy page cannot carry.
  color: "#8ba8f5",
  navy: "#1a2563",
} as const;
