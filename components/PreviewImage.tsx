/* eslint-disable @next/next/no-img-element */
import type {ImgHTMLAttributes} from "react";

type PreviewImageProps = Pick<
  ImgHTMLAttributes<HTMLImageElement>,
  "alt" | "className" | "decoding" | "fetchPriority" | "loading" | "onClick" | "referrerPolicy" | "src" | "style"
>;

export default function PreviewImage({
  alt,
  decoding = "async",
  loading = "lazy",
  referrerPolicy = "no-referrer",
  ...props
}: PreviewImageProps) {
  return <img {...props} alt={alt} decoding={decoding} loading={loading} referrerPolicy={referrerPolicy} />;
}
