// The only place the product name and identity live. Never hardcode these
// anywhere else, so a rename stays a one file change.

export const brand = {
  name: "ALAC OS",
  shortName: "ALAC",
  tagline: "Know who to work, why they matter, and what to do next.",
  // The product's interface accent. Mirrored as --brand in globals.css, and
  // it is the interface colour rather than the ALAC HR Solutions corporate
  // navy: navy cannot carry on a void ground, and this is an internal
  // operator tool, not a client facing surface.
  color: "#00ff88",
} as const;
