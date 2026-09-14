// PDF upload handling for Insights → Newsletter — same shape as
// lib/avatar.js's photo handling (a 2MB cap checked against the ORIGINAL
// file so the error names the file the user actually picked, the backend
// enforcing the same cap independently on decoded bytes), minus the
// compress-and-resize step: a PDF isn't an image to re-encode, so this just
// reads the file straight into a data URI ready to POST as `file`.

export const MAX_NEWSLETTER_BYTES = 2 * 1024 * 1024; // 2MB — matches the backend
export const NEWSLETTER_ACCEPT = "application/pdf";

const readable = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

/** File -> data URI ready to POST as `file`. Rejects with a message meant to
 *  be shown to the user verbatim. */
export function readPdfAsDataUri(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file selected."));
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!isPdf) return reject(new Error("Choose a PDF file."));
    if (file.size > MAX_NEWSLETTER_BYTES)
      return reject(new Error(`That PDF is ${readable(file.size)} — the limit is 2MB.`));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}
