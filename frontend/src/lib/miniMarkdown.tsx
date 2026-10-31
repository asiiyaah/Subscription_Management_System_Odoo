import type { ReactNode } from "react";

/** Renders **bold** inside a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

/**
 * Tiny, safe markdown for AI replies: paragraphs (blank line), **bold**, and "- " bullet lists.
 * No HTML is ever injected — everything renders as React text.
 */
export function MiniMarkdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const bullets = lines.filter((line) => line.startsWith("- "));
        const intro = lines.filter((line) => !line.startsWith("- "));
        return (
          <div key={i} className="space-y-2">
            {intro.length > 0 && <p>{intro.map((line, j) => (j ? [<br key={j} />, ...inline(line)] : inline(line)))}</p>}
            {bullets.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 marker:text-primary">
                {bullets.map((line, j) => (
                  <li key={j}>{inline(line.slice(2))}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
