import React from "react";
import MainLayout from "../layouts/MainLayout";
import Card from "../components/Card";

import Garden from "../assets/img/garden.png";
import Britain from "../assets/img/gb.png";
import laptop from "../assets/img/laptop.png";


export default function Home() {
  const offers = [
    {
      id: 1,
      title: "Pomoc so záhradou",
      description: "Pomôžem s jarným upratovaním dvora, trávnika a výsadbou rastlín 🌱",
      image: Garden,
      author: "Ján Novák",
      location: "Bratislava",
      category: "Dobrovoľníctvo",
    },
    {
      id: 2,
      title: "Doučovanie angličtiny",
      description: "Ponúkam online aj osobné doučovanie angličtiny pre začiatočníkov 🇬🇧",
      image: Britain,
      author: "Mária Kováčová",
      location: "Košice",
      category: "Vzdelávanie",
    },
    {
      id: 3,
      title: "Pomoc seniorom s technológiami",
      description: "Pomôžem seniorom s používaním mobilu, počítača alebo internetu 💻",
      image: laptop,
      author: "Jozef Hrubý",
      location: "Trnava",
      category: "Dobrovoľníctvo",
    },
  ];

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-8">
        <h1 className="text-3xl font-bold text-center mb-10">
          🌉 Ponuky používateľov LifeBridge
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {offers.map((offer) => (
            <Card
              key={offer.id}
              title={offer.title}
              description={offer.description}
              image={offer.image}
              author={offer.author}
              location={offer.location}
              category={offer.category}
            />
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
