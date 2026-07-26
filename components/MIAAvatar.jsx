import { MIA_AVATAR_ALT } from "../lib/brandAssets";
import { MIA_SYMBOL_SRC } from "../lib/miaSymbol";

/**
 * Avatar da MIA — asset oficial em lib/brandAssets.js / lib/miaSymbol.js.
 *
 * Tamanhos: header (48), compact (28), chat (40), feed (40), drawer (36), profile (80), loading (40).
 */
export default function MIAAvatar({
  size = "chat",
  src = MIA_SYMBOL_SRC,
  alt = MIA_AVATAR_ALT,
  className = "",
}) {
  const classes = [
    "mia-avatar",
    `mia-avatar--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      <img src={src} alt={alt} className="mia-avatar-image" decoding="async" />
    </span>
  );
}
