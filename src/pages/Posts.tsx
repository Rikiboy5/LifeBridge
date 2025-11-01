import React, { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import Card from "../components/Card";
import CardCreator from "../components/CardCreator";

interface User {
  id?: number;
  id_user?: number;
  name: string;
  surname: string;
}

interface Post {
  id_post: number;
  title: string;
  description: string;
  image?: string;
  category: string;
  name: string;
  surname: string;
}

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
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
      if (!res.ok) throw new Error("Chyba pri načítaní príspevkov");
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

    // user.id || user.id_user zabezpečí správne ID pre backend
    const payload = { ...postData, user_id: user.id || user.id_user };

    const res = await fetch("http://127.0.0.1:5000/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setIsCreating(false);
      fetchPosts();
    } else {
      const errMsg = await res.text();
      console.error("Nepodarilo sa vytvoriť príspevok:", errMsg);
    }
  };

  // 🔹 úprava existujúceho príspevku
  const handleEditPost = async (postData: {
    title: string;
    description: string;
    image?: string | null;
    category: string;
  }) => {
    if (!editingPost) return;

    const payload = { ...postData, id_post: editingPost.id_post };

    const res = await fetch(`http://127.0.0.1:5000/api/posts/${editingPost.id_post}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setIsEditing(false);
      setEditingPost(null);
      fetchPosts();
    } else {
      const errMsg = await res.text();
      console.error("Nepodarilo sa upraviť príspevok:", errMsg);
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
                  category={post.category}
                />
                {user &&
                  `${user.name} ${user.surname}` ===
                    `${post.name} ${post.surname}` && (
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => {
                          setEditingPost(post);
                          setIsEditing(true);
                        }}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-2 py-1 rounded-md"
                      >
                        🖊️
                      </button>
                      <button
                        onClick={() => handleDeletePost(post.id_post)}
                        className="bg-red-500 hover:bg-red-600 text-white text-sm px-2 py-1 rounded-md"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}

        {/* ✅ Nový alebo Editačný formulár */}
        {isCreating && (
          <CardCreator onClose={() => setIsCreating(false)} onSave={handleAddPost} />
        )}
        {isEditing && editingPost && (
          <CardCreator
            onClose={() => {
              setIsEditing(false);
              setEditingPost(null);
            }}
            onSave={handleEditPost}
            initialData={editingPost}
          />
        )}
      </div>
    </MainLayout>
  );
}
