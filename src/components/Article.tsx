import { Link } from "react-router-dom";

interface ArticleProps {
  id: number;
  title: string;
  text: string;
  image?: string | null;
}

export default function Article({ id, title, text, image }: ArticleProps) {
  // fallback obrázok, ak v DB nie je
  const fallbackImage = "https://images.pexels.com/photos/3823488/pexels-photo-3823488.jpeg";
  const imgSrc = image && image.trim() !== "" ? image : fallbackImage;

  return (
    <Link
      to={`/article/${id}`}
      className="block bg-white dark:bg-gray-900 rounded-2xl shadow-md overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow duration-300"
    >
      <div className="flex flex-col md:flex-row w-full">
        <div className="md:w-1/2 h-56 md:h-auto overflow-hidden">
          <img
            src={imgSrc}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
          />
        </div>
        <div className="p-6 md:w-1/2 flex flex-col justify-center space-y-3">
          <h3 className="text-2xl font-bold">{title}</h3>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">
            {text}
          </p>
        </div>
      </div>
    </Link>
  );
}