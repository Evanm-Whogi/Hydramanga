"use client";

export const DEFAULT_AVATAR = "/default-avatar.jpg";

export default function UserAvatar({ src, alt = "", width = 40, height: _height, className = "", priority = false }: { src?: string | null; alt?: string; width?: number; height?: number; className?: string; priority?: boolean }) {
  const size = width;

  return (
    <img
      src={src || DEFAULT_AVATAR}
      alt={alt}
      width={size}
      height={size}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={`block shrink-0 rounded-full object-cover aspect-square overflow-hidden ${className}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      onError={(e) => {
        const el = e.currentTarget;
        if (!el.src.endsWith(DEFAULT_AVATAR)) el.src = DEFAULT_AVATAR;
      }}
    />
  );
}
