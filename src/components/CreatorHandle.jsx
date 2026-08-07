import { profileUrl } from "../lib/campaign";
import { T } from "../theme/tokens";

/**
 * A creator's @handle, as a link to their profile when one can be derived.
 *
 * The rule it encodes is small but was getting decided per-screen: a handle is
 * only a link when `profileUrl` can actually build one (auto-fetched `igUrl`,
 * or a clean handle on a platform with a known URL shape). Otherwise it renders
 * as plain muted text.
 *
 * That distinction is the whole point. Rendering every handle as an anchor
 * regardless — which is what the client portal did — produces accent-coloured
 * text that looks clickable and isn't, for every creator added by hand rather
 * than through Fetch. Rendering none of them as links, which is what every
 * internal screen except Deliverables did, throws away a link we already have.
 *
 * `stopPropagation` because handles sit inside rows that are themselves
 * clickable (the creators directory expands a row; campaign cards drill in) —
 * opening a profile should not also trigger the row.
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
