// The only place the product name and identity live. Never hardcode these
// anywhere else, so a rename stays a one file change.

export const brand = {
  name: "ALAC OS",
  shortName: "ALAC",
  tagline: "Know who to work, why they matter, and what to do next.",
  // The Material 3 seed colour. Every surface, container, and state layer in
  // the product is a tone derived from this one value, which is why it is the
  // only colour stated here. Mirrored as --md-primary in globals.css.
  //
  // It is the interface colour rather than the ALAC HR Solutions corporate
  // navy: this is an internal operator tool, not a client facing surface.
  color: "#6750a4",
} as const;
