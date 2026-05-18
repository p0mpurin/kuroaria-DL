import { useState } from "react";
import { ClipboardPaste, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UrlQuickAddProps {
  onAdd: (url: string) => Promise<void>;
}

function parseUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return null;
}

export function UrlQuickAdd({ onAdd }: UrlQuickAddProps) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (raw?: string) => {
    const url = parseUrl(raw ?? value);
    if (!url) {
      setError("Enter a valid http(s) URL");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onAdd(url);
      setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add download");
    } finally {
      setLoading(false);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const url = parseUrl(text);
      if (url) {
        setValue(url);
        await submit(url);
      } else {
        setError("Clipboard does not contain a valid URL");
      }
    } catch {
      setError("Could not read clipboard. Paste manually with Ctrl+V.");
    }
  };

  return (
    <section className="url-quick-add mb-5 rounded-xl border border-border bg-card p-1.5 shadow-sm">
      <div className="flex items-center gap-2 rounded-lg border border-input-border bg-input px-2 py-1">
        <Link2 className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.75} />
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="Paste download URL and press Enter"
          className="h-9 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:border-transparent focus-visible:ring-0"
          disabled={loading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-input-border bg-card/60"
          onClick={() => void pasteFromClipboard()}
          disabled={loading}
          title="Paste URL from clipboard"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="dark"
          size="sm"
          className="shrink-0"
          onClick={() => void submit()}
          disabled={loading || !value.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      {error && (
        <p className="mt-2 px-2 text-xs text-red-500">{error}</p>
      )}
    </section>
  );
}
