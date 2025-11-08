import React from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
//import ChatbotWidget from "../components/chatbot";
//import ChatbotWidget from "../components/Chatbot_voice";
//import ChatbotWidget from "../components/Chatbot_voice2";
//import ChatbotWidget from "../components/Chatbot_voice_accessible";
import ChatbotWidget from "../components/Chatbot_voice2_merged_v9";

interface MainLayoutProps {
  children: React.ReactNode;

}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100">
      <Navbar />
      <main className="flex-grow pt-20">{children}</main>
      <Footer />
      <ChatbotWidget />
    </div>
  );
}
