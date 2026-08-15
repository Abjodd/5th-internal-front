// Profile-photo handling, shared by every screen that can set one (the Auth
// page's add/edit modals and the Profile page).
//
// ── Why the image is compressed before it is uploaded ────────────────────────
// A profile photo is rendered as a 24-40px ICON — in the app shell's user chip,
// the Auth table, campaign rosters, the Summary's team grid. Nothing on any
// screen displays it larger than about 90px. Uploading the original file would
// mean storing (and re-serving) a few megabytes to draw a circle the size of a
// fingernail.
//
// So the browser does the work: the image is centre-cropped to a square,
// downscaled to 256px and re-encoded as JPEG. A 4MB phone photo becomes ~20-30KB
// — small enough to live inline on the user document, which is what lets this
// ship without a new collection or a file store.
//
// The 2MB limit is checked against the ORIGINAL file, before any of that, so the
// user gets an immediate, honest error about the file they actually picked
// rather than a silent success on something the server would refuse. The backend
// enforces the same 2MB cap on the decoded bytes independently — this check is
// for the error message, not for security (see routes/auth.js parseAvatar).

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB — matches the backend
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";

// 256 is 2x the largest place an avatar is ever drawn, so it stays crisp on a
// retina display without paying for a size nothing renders at.
const EDGE = 256;
const QUALITY = 0.82;

const readable = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

/**
 * File -> square, downscaled JPEG data URI ready to PATCH as `avatarImage`.
 * Rejects with a message meant to be shown to the user verbatim.
 */
export function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file selected."));
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type))
      return reject(new Error("Choose a PNG, JPEG or WebP image."));
    if (file.size > MAX_AVATAR_BYTES)
      return reject(new Error(`That image is ${readable(file.size)} — the limit is 2MB.`));

    const url = URL.createObjectURL(file);
    const img = new Image();

    // Revoking on both paths matters: an object URL that is never revoked pins
    // the whole original file in memory for the life of the page, and this
    // component can be opened and abandoned repeatedly.
    const done = (fn) => (arg) => { URL.revokeObjectURL(url); fn(arg); };
    const ok = done(resolve);
    const fail = done(reject);

    img.onerror = () => fail(new Error("That file could not be read as an image."));
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = EDGE;
        const ctx = canvas.getContext("2d");

        // JPEG has no alpha channel, so a transparent PNG would composite onto
        // whatever the canvas initialises to — black — and a logo on a
        // transparent background would upload as a black square. Painting white
        // first makes the transparent areas read the way the user saw them.
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, EDGE, EDGE);

        // Centre-crop to a square rather than squashing to one: avatars render
        // inside a circle, so a stretched face is far more noticeable than
        // trimmed edges.
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, EDGE, EDGE);

        ok(canvas.toDataURL("image/jpeg", QUALITY));
      } catch (e) {
        fail(new Error(`Could not process that image: ${e.message}`));
      }
    };
    img.src = url;
  });
}
