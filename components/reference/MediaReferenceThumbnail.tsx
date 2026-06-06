import { Music, Video } from "lucide-react";
import PreviewImage from "@/components/PreviewImage";
import { getMediaReferenceType, type MediaReference } from "@/lib/media-references";

interface MediaReferenceThumbnailProps {
  alt: string;
  className?: string;
  reference: Pick<MediaReference, "type" | "url">;
}

export default function MediaReferenceThumbnail({
  alt,
  className = "",
  reference,
}: MediaReferenceThumbnailProps) {
  const type = getMediaReferenceType(reference);
  return (
    <span className={`relative flex items-center justify-center overflow-hidden bg-[var(--iw-panel-soft)] ${className}`}>
      {type === "image" ? (
        <PreviewImage src={reference.url} alt={alt} draggable={false} className="board-media-preview h-full w-full select-none object-cover" />
      ) : type === "video" ? (
        <>
          <video
            aria-label={alt}
            className="board-media-preview h-full w-full select-none object-cover"
            draggable={false}
            muted
            playsInline
            preload="metadata"
            src={reference.url}
          />
          <span className="absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/65 text-violet-100 shadow-sm">
            <Video className="h-3 w-3" />
          </span>
        </>
      ) : (
        <Music className="h-4 w-4 text-cyan-200" />
      )}
    </span>
  );
}
