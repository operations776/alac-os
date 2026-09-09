import Image from "next/image";

/**
 * The ALAC mark.
 *
 * The supplied asset is the navy-on-transparent version, which is the one the
 * brand uses on white. This product sits on a near black ground, so it is
 * inverted in CSS rather than by keeping a second file: `brightness(0)` flattens
 * every colour to black and `invert(1)` lifts it to white, both of which leave
 * the alpha channel alone. One asset, and no chance of the two drifting apart
 * when the logo is next updated.
 *
 * If a official white asset arrives later, drop the filter and swap the file.
 */
export function Logo({
  height = 28,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  // The source is 256x90, so the width follows from the height rather than
  // being guessed. Passing both keeps Next from warning and stops the layout
  // shifting while the image decodes.
  const width = Math.round((256 / 90) * height);
  return (
    <Image
      src="/alac-logo.webp"
      alt="ALAC HR Solutions"
      width={width}
      height={height}
      priority
      // The inversion lives in CSS keyed on the theme: white on the dark
      // ground, the brand's own navy on the light one. Without that the mark
      // is white on white in light mode, which is how it disappeared.
      className={`logo-mark shrink-0 ${className}`}
    />
  );
}
