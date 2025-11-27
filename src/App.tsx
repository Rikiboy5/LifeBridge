import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Users from "./pages/Users";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Posts from "./pages/Posts";
import PostDetail from "./pages/PostDetail";
import Blog from "./pages/Blog";
import ActivityDetail from "./pages/ActivityDetail";
import CreateActivity from "./pages/CreateActivity";
import PublicProfile from "./pages/PublicProfile";
import { ChatProvider } from "./components/ChatContext";

// pomocná funkcia – zistí, či je prihlásený admin
function isCurrentUserAdmin(): boolean {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return false;
    const u = JSON.parse(raw);
    const id = u?.id ?? u?.id_user ?? null;
    return u?.role === "admin" || id === 1; // id 1 ako „superadmin“
  } catch {
    return false;
  }
}

export default function App() {
  const isAdmin = isCurrentUserAdmin();

  return (
    <Router>
      <ChatProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/users" element={<Users />} />

          {/* 👇 ak je admin → plný Profile, inak PublicProfile */}
          <Route
            path="/user/:id"
            element={isAdmin ? <Profile /> : <PublicProfile />}
          />

          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/posts" element={<Posts />} />
          <Route path="/posts/:id" element={<PostDetail />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/activities" element={<Blog />} />
          <Route path="/activities/create" element={<CreateActivity />} />
          <Route path="/activities/:id" element={<ActivityDetail />} />
        </Routes>
      </ChatProvider>
    </Router>
  );
}
