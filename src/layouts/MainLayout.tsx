import React from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

import ChatbotWidget from "../components/Chatbot_voice2_merged_v9_SK";
interface MainLayoutProps {
  children: React.ReactNode;
}

import ChatWidget from "../components/ChatWidget";

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100">
      {/* Navbar s vysokým z-indexom aby nebol prekrytý mapou */}
      <div className="fixed top-0 left-0 right-0 z-[9999]">
        <Navbar />
      </div>

      {/* Obsah s automatickým odsadením */}
      <main className="flex-grow pt-[88px] px-4 sm:px-6 lg:px-8 transition-all duration-300">
        {children}
      </main>

      {/* Footer na spodku */}
      <Footer />
      <div className="fixed bottom-20 right-4 z-[99999]">
        <ChatWidget />
      </div>
      <div className="fixed bottom-4 right-4 z-[99999]">
        <ChatbotWidget />
      </div>
      
    </div>
  );
}
