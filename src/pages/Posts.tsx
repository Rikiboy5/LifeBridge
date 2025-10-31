import React, { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import Card from "../components/Card";
import CardCreator from "../components/CardCreator";

interface User {
  id_user: number;
  name: string;
  surname: string;
  location?: string;
}

interface Post {
  id_post: number;
  title: string;
  description: string;
  image?: string;
  category: string;
  name: string;
  surname: string;
  location?: string;
}

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // 🔹 načítanie používateľa z localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  // 🔹 načítanie príspevkov z API
  const fetchPosts = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/api/posts");
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      console.error("Chyba pri načítaní príspevkov:", err);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  // 🔹 odoslanie nového príspevku
  const handleAddPost = async (postData: {
    title: string;
    description: string;
    image?: string | null;
    category: string;
  }) => {
    if (!user) return alert("Musíš byť prihlásený!");

    const payload = {
      ...postData,
      user_id: user.id_user,
    };

    const res = await fetch("http://127.0.0.1:5000/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setIsCreating(false);
      fetchPosts();
    } else {
      console.error("Nepodarilo sa vytvoriť príspevok");
    }
  };

  // 🔹 vymazanie príspevku
  const handleDeletePost = async (id: number) => {
    const res = await fetch(`http://127.0.0.1:5000/api/posts/${id}`, {
      method: "DELETE",
    });
    if (res.ok) fetchPosts();
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">📝 Príspevky používateľov</h1>
          {user && (
            <button
              onClick={() => setIsCreating(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition"
            >
              ➕ Pridať príspevok
            </button>
          )}
        </div>

        {posts.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-center">
            Žiadne príspevky neboli nájdené.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post) => (
              <div key={post.id_post} className="relative group">
                <Card
                  title={post.title}
                  description={post.description}
                  image={post.image}
                  author={`${post.name} ${post.surname}`}
                  location={post.location || ""}
                  category={post.category}
                />
                {user &&
                  `${user.name} ${user.surname}` ===
                    `${post.name} ${post.surname}` && (
                    <button
                      onClick={() => handleDeletePost(post.id_post)}
                      className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white text-sm px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition"
                    >
                      🗑️
                    </button>
                  )}
              </div>
            ))}
          </div>
        )}

        {isCreating && (
          <CardCreator
            onClose={() => setIsCreating(false)}
            onSave={handleAddPost}
          />
        )}
      </div>
    </MainLayout>
  );
}
/* local bez databazy na testing | >>>

import React, { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import Card from "../components/Card";
import CardCreator from "../components/CardCreator";

interface Post {
  id: number;
  title: string;
  description: string;
  image?: string;
  category: string;
  author: string;
  location: string;
}

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // 🔹 Načítanie uložených príspevkov z localStorage
  useEffect(() => {
    const saved = localStorage.getItem("posts");
    if (saved) setPosts(JSON.parse(saved));
  }, []);

  // 🔹 Automatické uloženie pri každej zmene
  useEffect(() => {
    localStorage.setItem("posts", JSON.stringify(posts));
  }, [posts]);

  // 🔹 Pridanie nového príspevku
  const handleAddPost = (newPost: {
    title: string;
    description: string;
    image?: string | null;
    category: string;
  }) => {
    const post: Post = {
      id: Date.now(),
      title: newPost.title,
      description: newPost.description,
      image: newPost.image || undefined,
      category: newPost.category,
      author: "Testovací používateľ",
      location: "Slovensko",
    };

    setPosts((prev) => [...prev, post]);
    setIsCreating(false);
  };

  // 🔹 Odstránenie príspevku
  const handleDeletePost = (id: number) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">📝 Príspevky používateľov</h1>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition"
          >
            ➕ Pridať príspevok
          </button>
        </div>

        {posts.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-center">
            Zatiaľ tu nie sú žiadne príspevky. Pridaj svoj ako prvý!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post) => (
              <div key={post.id} className="relative group">
                <Card
                  title={post.title}
                  description={post.description}
                  image={post.image}
                  author={post.author}
                  location={post.location}
                  category={post.category}
                />
                <button
                  onClick={() => handleDeletePost(post.id)}
                  className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white text-sm px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}

        {isCreating && (
          <CardCreator
            onClose={() => setIsCreating(false)}
            onSave={handleAddPost}
          />
        )}
      </div>
    </MainLayout>
  );
}*/
