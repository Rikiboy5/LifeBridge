import React from "react";

interface CardProps {
  title: string;
  description: string;
  image?: string;
  author?: string;
  category?: string;
}

export default function Card({
  title,
  description,
  image,
  author,
  category,
}: CardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
      {/* Obrázok */}
      {image && (
        <div className="w-full h-56 bg-gradient-to-b from-indigo-50 to-white dark:from-gray-800 dark:to-gray-900 flex items-center justify-center overflow-hidden">
          <img
            src={image}
            alt={title}
            className="max-h-full max-w-full object-contain p-2"
          />
        </div>
      )}

      {/* Obsah */}
      <div className="p-5 flex flex-col space-y-3">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>

        {category && (
          <span className="inline-block bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-sm px-2 py-1 rounded-lg w-fit">
            {category}
          </span>
        )}

        <p className="text-gray-700 dark:text-gray-300 line-clamp-3">
          {description}
        </p>

        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
          {author && (
            <div className="flex items-center space-x-1">
              <span className="font-medium">{author}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
