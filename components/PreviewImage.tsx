/* eslint-disable @next/next/no-img-element */
import type {ImgHTMLAttributes} from "react";

type PreviewImageProps = Pick<
  ImgHTMLAttributes<HTMLImageElement>,
  "alt" | "className" | "onClick" | "referrerPolicy" | "src" | "style"
>;

export default function PreviewImage({
  alt,
  referrerPolicy = "no-referrer",
  ...props
}: PreviewImageProps) {
  return <img {...props} alt={alt} referrerPolicy={referrerPolicy} />;
}
