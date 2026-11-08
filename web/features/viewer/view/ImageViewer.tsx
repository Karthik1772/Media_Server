import { useEffect, useRef, useState } from "react";
import type { Item } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { useImageViewerViewModel } from "@/features/viewer/viewmodel/useImageViewerViewModel";

interface Props {
  list: Item[];
  start: number;
  onClose: () => void;
}

const arrow =
  "absolute top-1/2 h-16 w-[46px] -translate-y-1/2 cursor-pointer rounded-xl border-0 bg-white/12 text-[34px] text-white hover:bg-white/30";

/** Photo viewer: arrows / swipe / keys to move, lighter copy first with an "Original" button. */
export function ImageViewer({ list, start, onClose }: Props) {
  const { index: i, step } = useImageViewerViewModel(list, start, onClose);
  const it = list[i];
  const heicMissing = !!it.heic && !it.view;
  const [src, setSrc] = useState(it.view || it.url);
  const [showOrig, setShowOrig] = useState(!!it.view && !it.heic);
  const touch = useRef({ x: 0, y: 0 });

  // a new photo: reset the source and warm up the neighbours
  useEffect(() => {
    setSrc(heicMissing ? "" : it.view || it.url);
    setShowOrig(!!it.view && !it.heic);
    if (heicMissing) toast("This HEIC photo can't be shown - run: pip install pillow-heif (on the server PC)");
    [i - 1, i + 1].forEach((k) => {
      const nb = list[k];
      if (!nb || nb.kind !== "image" || (nb.heic && !nb.view)) return;
      new Image().src = nb.view || nb.url;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);


  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-white"
      onTouchStart={(e) => {
        touch.current = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
      }}
    >
      <Button
        variant="overlay"
        size="sm"
        onClick={onClose}
        className="absolute right-3 z-[2]"
        style={{ top: "calc(10px + env(safe-area-inset-top))" }}
        aria-label="Close"
      >
        &#10005;
      </Button>
      {showOrig && (
        <Button
          variant="overlay"
          size="sm"
          onClick={() => {
            setSrc(it.url);
            setShowOrig(false);
            toast("Loading the original…");
          }}
          className="absolute left-3 z-[2]"
          style={{ top: "calc(10px + env(safe-area-inset-top))" }}
        >
          Original
        </Button>
      )}
      {i > 0 && (
        <button type="button" className={`${arrow} left-2.5`} onClick={() => step(-1)} aria-label="Previous photo">
          &#8249;
        </button>
      )}
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          onError={() => {
            // the lighter copy failed: use the original
            if (src !== it.url && !it.heic) {
              setSrc(it.url);
              setShowOrig(false);
            }
          }}
          className="max-h-full max-w-full animate-fade-in object-contain select-none"
        />
      )}
      {i < list.length - 1 && (
        <button type="button" className={`${arrow} right-2.5`} onClick={() => step(1)} aria-label="Next photo">
          &#8250;
        </button>
      )}
      <div
        className="absolute inset-x-0 bottom-0 bg-linear-to-b from-transparent to-black/70 px-3.5 pt-3 text-center text-[13px] text-[#ddd]"
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        {it.name} &nbsp; ({i + 1} / {list.length})
      </div>
    </div>
  );
}
