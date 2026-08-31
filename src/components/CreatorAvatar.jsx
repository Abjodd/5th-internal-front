/**
 * A creator's profile photo, falling back to initials.
 *
 * The photo is ours: the backend copies the bytes out of the platform's CDN
 * once, when the creator is first added, and serves them from our own route
 * like every other avatar in the app (see the backend's remoteAvatar.js for why
 * the platform's URL is copied rather than kept — it is signed and expires).
 * So there is exactly one source here, and `avatarUrl` returns null unless the
 * record says a photo exists, which is what keeps a creator without one from
 * issuing a request that is certain to 404.
 *
 * Initials still cover two real cases: a creator added before this existed, and
 * the seconds between a roster saving and the background capture finishing.
 *
 * The load failure is remembered as the URL that broke, not as a boolean, so an
 * instance reused for a different creator — or the same creator after a new
 * photo lands and `?v=` changes — tries again instead of staying on initials.
 */
import { useState } from "react";
import { CreatorsAPI } from "../lib/api";
import { initials } from "../lib/format";
import { T } from "../theme/tokens";

export default function CreatorAvatar({ creator, size = 28, radius = 8 }) {
  const [broken, setBroken] = useState(null);
  const src = CreatorsAPI.avatarUrl(creator);
  const box = { width: size, height: size, borderRadius: radius, flexShrink: 0 };

  if (src && src !== broken) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setBroken(src)}
        style={{ ...box, display: "block", objectFit: "cover", border: `1px solid ${T.border}` }}
      />
    );
  }

  return (
    <div style={{
      ...box, display: "flex", alignItems: "center", justifyContent: "center",
      background: `${T.pink}16`, color: T.pink,
      fontSize: Math.round(size * 0.36), fontWeight: 600,
    }}>
      {initials(creator?.name)}
    </div>
  );
}
