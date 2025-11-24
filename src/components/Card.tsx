import React from "react";

interface CardProps {
  title: string;
  description: string;
  image?: string;
  author?: string;
  category?: string;
  onClick?: () => void;
  rating?: number | null;
}

export default function Card({ title, description, image, author, category, onClick, rating }: CardProps) {
  const clickable = typeof onClick === "function";
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!clickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`h-full min-h-[420px] md:min-h-[440px] flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-md overflow-hidden transition-shadow duration-300 ${
        clickable
          ? "hover:shadow-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
          : "hover:shadow-lg"
      }`}
    >
      {image && (
        <div className="w-full h-56 bg-gradient-to-b from-indigo-50 to-white dark:from-gray-800 dark:to-gray-900 flex items-center justify-center overflow-hidden">
          <img src={image} alt={title} className="max-h-full max-w-full object-contain p-2" />
        </div>
      )}

      <div className="p-5 flex flex-col space-y-3 flex-1">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white break-words line-clamp-2">{title}</h3>

        {category && (
          <span className="inline-block bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-sm px-2 py-1 rounded-lg w-fit">
            {category}
          </span>
        )}

        <p className="text-gray-700 dark:text-gray-300 line-clamp-3 break-words">{description}</p>

        <div className="mt-auto flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-1 truncate">
            {author && <span className="font-medium truncate">{author}</span>}
          </div>
          {typeof rating === "number" && (
            <div className="flex items-center gap-1 text-xs text-yellow-500" aria-label={`Hodnotenie ${rating} z 5`}>
              <span>{"\u2605"}</span>
              <span className="text-gray-600 dark:text-gray-300">{rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
