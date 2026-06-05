/* eslint-disable @next/next/no-img-element */
import type {ImgHTMLAttributes} from "react";

type PreviewImageProps = Pick<
  ImgHTMLAttributes<HTMLImageElement>,
  "alt" | "className" | "decoding" | "fetchPriority" | "loading" | "onClick" | "onLoad" | "referrerPolicy" | "src" | "style"
>;

function previewImageSrc(src: PreviewImageProps["src"]): PreviewImageProps["src"] {
  return src;
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
  const srcValue = typeof src === "string" ? src : undefined;
  if (!srcValue?.trim()) {
    return <div {...props} aria-label={alt} role="img" />;
  }
  return <img {...props} alt={alt} decoding={decoding} fetchPriority={fetchPriority} loading={loading} referrerPolicy={referrerPolicy} src={previewImageSrc(srcValue)} />;
}
