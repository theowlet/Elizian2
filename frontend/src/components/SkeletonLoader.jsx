import React from "react";

/**
 * Reusable skeleton loader with CSS shimmer.
 * Use for deal cards, booking history rows, profile sections, etc.
 */
export default function SkeletonLoader({
  variant = "card",
  count = 1,
  className = "",
  style = {},
}) {
  const baseClass = "skeleton-loader";
  const variantClass = `skeleton-loader--${variant}`;

  const content =
    variant === "card"
      ? (
        <div className={`${baseClass} ${variantClass} ${className}`.trim()} style={style}>
          <div className="skeleton-loader__shimmer" />
          <div className="skeleton-loader__image" />
          <div className="skeleton-loader__line skeleton-loader__line--title" />
          <div className="skeleton-loader__line skeleton-loader__line--short" />
          <div className="skeleton-loader__line skeleton-loader__line--medium" />
        </div>
      )
      : variant === "row"
        ? (
          <div className={`${baseClass} ${variantClass} ${className}`.trim()} style={style}>
            <div className="skeleton-loader__shimmer" />
            <div className="skeleton-loader__line skeleton-loader__line--title" />
            <div className="skeleton-loader__line skeleton-loader__line--short" />
          </div>
        )
        : variant === "text"
          ? (
            <div className={`${baseClass} ${variantClass} ${className}`.trim()} style={style}>
              <div className="skeleton-loader__shimmer" />
              <div className="skeleton-loader__line" />
            </div>
          )
          : (
            <div className={`${baseClass} ${variantClass} ${className}`.trim()} style={style}>
              <div className="skeleton-loader__shimmer" />
              <div className="skeleton-loader__block" />
            </div>
          );

  if (count <= 1) return content;
  return (
    <>
      {Array.from({ length: count }, (_, i) =>
        React.cloneElement(content, { key: i })
      )}
    </>
  );
}
