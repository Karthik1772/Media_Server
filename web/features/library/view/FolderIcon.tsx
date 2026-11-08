/** Folder glyph shown on every folder card (and the "Folders" heading). Uses currentColor so it follows the surrounding text colour. */
export function FolderIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className} fill="none">
      <path d="M6 16a5 5 0 0 1 5-5h14.2a5 5 0 0 1 3.9 1.9l2.9 3.6H53a5 5 0 0 1 5 5V47a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5V16Z" fill="currentColor" opacity=".55" />
      <path d="M6 24a5 5 0 0 1 5-5h42a5 5 0 0 1 5 5v23a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5V24Z" fill="currentColor" />
    </svg>
  );
}
