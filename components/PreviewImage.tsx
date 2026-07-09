"use client";
/* eslint-disable @next/next/no-img-element */
import { ImageIcon } from "lucide-react";
import { useState, type ImgHTMLAttributes } from "react";

type PreviewImageProps = Pick<
  ImgHTMLAttributes<HTMLImageElement>,
  "alt" | "className" | "decoding" | "draggable" | "fetchPriority" | "loading" | "onClick" | "onLoad" | "referrerPolicy" | "src" | "style"
>;

function previewImageSrc(src: PreviewImageProps["src"]): PreviewImageProps["src"] {
  return src;
}

function PreviewImagePlaceholder({
  alt,
  className,
  style,
  ...props
}: Pick<PreviewImageProps, "alt" | "className" | "onClick" | "style">) {
  return (
    <div
      {...props}
      className={`flex items-center justify-center bg-[var(--iw-panel-soft)] ${className ?? ""}`}
      aria-label={alt}
      role="img"
      style={style}
    >
      <ImageIcon className="h-6 w-6 text-[var(--iw-faint)]" aria-hidden />
    </div>
  );
}

export default function PreviewImage({
  alt,
  decoding = "async",
  fetchPriority,
  loading = "lazy",
  referrerPolicy = "no-referrer",
  src,
  ...props
}: PreviewImageProps) {
  const [failed, setFailed] = useState(false);
  const srcValue = typeof src === "string" ? src : undefined;
  if (!srcValue?.trim() || failed) {
    return <PreviewImagePlaceholder alt={alt} {...props} />;
  }
  return (
    <img
      {...props}
      alt={alt}
      decoding={decoding}
      fetchPriority={fetchPriority}
      loading={loading}
      onError={() => setFailed(true)}
      referrerPolicy={referrerPolicy}
      src={previewImageSrc(srcValue)}
    />
  );
}