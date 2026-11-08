import { useToast } from "@/hooks/use-toast";

export function Toaster() {
  const { current } = useToast();
  if (!current) return null;
  return (
    <div
      key={current.id} // a new toast replays the entrance
      role="status"
      className={`fixed left-1/2 z-[99] max-w-[90vw] -translate-x-1/2 rounded-full border border-line bg-fg px-4 py-2.5 text-center text-sm text-bg shadow-[0_6px_24px_rgba(0,0,0,.35)] ${
        current.leaving ? "animate-toast-out" : "animate-toast-in"
      }`}
      style={{ bottom: "calc(24px + env(safe-area-inset-bottom))" }}
    >
      {current.message}
    </div>
  );
}
