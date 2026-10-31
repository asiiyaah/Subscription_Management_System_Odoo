import { Construction } from "lucide-react";

/** Stand-in for pages that haven't been built yet. Replace it when you build the page. */
export function PagePlaceholder({ title, owner }: { title: string; owner: "Member 1" | "Member 2" }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-line bg-surface/50 px-6 py-20 text-center">
        <Construction className="size-10 text-accent" aria-hidden />
        <p className="font-semibold">This page is under construction</p>
        <p className="text-sm text-muted">Owner: Frontend {owner}</p>
      </div>
    </div>
  );
}
