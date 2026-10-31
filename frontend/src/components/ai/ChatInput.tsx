import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";

const MAX_LENGTH = 500;

/** Auto-growing message box. Enter sends, Shift+Enter adds a new line. */
export function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text);
    setText("");
    requestAnimationFrame(resize);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  const nearLimit = text.length > MAX_LENGTH * 0.8;

  return (
    <form onSubmit={submit} className="relative">
      <label htmlFor="ai-input" className="sr-only">
        Ask the assistant
      </label>
      <textarea
        id="ai-input"
        ref={ref}
        rows={1}
        maxLength={MAX_LENGTH}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          resize();
        }}
        onKeyDown={onKeyDown}
        placeholder="Ask about subscriptions, invoices, payments or revenue…"
        className="block max-h-40 min-h-13 w-full resize-none rounded-2xl border border-line bg-surface py-3.5 pl-4 pr-14 text-sm text-ink shadow-lg shadow-black/20 placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20"
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        aria-label="Send"
        className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent text-white shadow-md shadow-primary/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowUp className="size-4.5" strokeWidth={2.5} />
      </button>
      <p className={cn("mt-1.5 flex justify-between px-1 text-[11px] text-muted/80", nearLimit && "text-warning")}>
        <span>Enter to send · Shift + Enter for a new line</span>
        {nearLimit && (
          <span>
            {text.length}/{MAX_LENGTH}
          </span>
        )}
      </p>
    </form>
  );
}
