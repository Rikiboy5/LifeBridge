import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Users from "./pages/Users";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Posts from "./pages/Posts";



export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/users" element={<Users />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/posts" element={<Posts />} />
      </Routes>
    </Router>
  );
}
