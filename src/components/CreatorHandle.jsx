import { profileUrl } from "../lib/campaign";
import { T } from "../theme/tokens";

/**
 * A creator's @handle, as a link to their profile when one can be derived.
 *
 * A handle is a link only when `profileUrl` can build one (auto-fetched `igUrl`,
 * or a clean handle on a platform with a known URL shape). Otherwise plain muted
 * text. That distinction is the point: linking every handle regardless — what
 * the client portal did — gives accent-coloured text that looks clickable and
 * isn't, for every hand-added creator. Linking none, which every internal screen
 * but Deliverables did, throws away a link we already have.
 *
 * `stopPropagation` because handles sit inside rows that are themselves
 * clickable — opening a profile shouldn't also trigger the row.
 */
export default function CreatorHandle({ creator, style, fallback = "—" }) {
  const handle = creator?.handle;
  if (!handle) return <span style={style}>{fallback}</span>;

  const url = profileUrl(creator);
  if (!url) return <span style={style}>{handle}</span>;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={e => e.stopPropagation()}
      title={`Open ${creator.platform || "profile"} → ${handle}`}
      style={{ color: T.accent, textDecoration: "underline", textUnderlineOffset: 2, ...style }}
    >
      {handle}
    </a>
  );
}
