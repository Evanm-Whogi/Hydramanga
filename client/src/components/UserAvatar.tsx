"use client";

const DEFAULT_AVATAR = "https://profile-pictures.garage.chit.sh/default.jpg";

export default function UserAvatar({ src, alt = "", width = 40, height = 40, className = "", priority = false }: { src?: string | null; alt?: string; width?: number; height?: number; className?: string; priority?: boolean }) {
  return (
    <img
      src={src || DEFAULT_AVATAR}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={className}
      onError={(e) => {
        const el = e.currentTarget;
        if (!el.src.endsWith(DEFAULT_AVATAR)) el.src = DEFAULT_AVATAR;
      }}
    />
  );
}
