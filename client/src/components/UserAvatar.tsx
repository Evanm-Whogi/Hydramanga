"use client";

const DEFAULT_AVATAR = "/media/pfp/default.jpg";

export default function UserAvatar({ src, alt = "", width = 40, height = 40, className = "" }: { src?: string | null; alt?: string; width?: number; height?: number; className?: string }) {
  return (
    <img
      src={src || DEFAULT_AVATAR}
      alt={alt}
      width={width}
      height={height}
      className={className}
      onError={(e) => {
        const el = e.currentTarget;
        if (!el.src.endsWith(DEFAULT_AVATAR)) el.src = DEFAULT_AVATAR;
      }}
    />
  );
}
