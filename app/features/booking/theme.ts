import type { CSSProperties } from "react";

/** Only validated colour tokens reach CSS; never tenant CSS or class names. */
export function bookingTheme(value?: string, secondary?: string): CSSProperties {
  const primary = value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#244b42";
  const rgb = [1, 3, 5].map(i => parseInt(primary.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const accent = secondary && /^#[0-9a-f]{6}$/i.test(secondary) ? secondary : "#d8e9d9";
  const accentRgb = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const accentLight = 0.2126 * accentRgb[0] + 0.7152 * accentRgb[1] + 0.0722 * accentRgb[2];
  return {
    "--booking-accent": accent,
    "--booking-on-accent": accentLight > 0.179 ? "#000000" : "#ffffff",
    "--booking-primary": primary,
    "--booking-hover": value ? primary : "#173b33",
    "--booking-on-primary": luminance > 0.179 ? "#000000" : "#ffffff",
    "--booking-ink": luminance > 0.183 ? "#244b42" : primary,
  } as CSSProperties;
}
