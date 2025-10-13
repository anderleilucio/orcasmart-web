"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useEffect, useState } from "react";

export default function TopBar({ title }: { title: string }) {
  console.log("TopBar v2 carregado");
  const router = useRouter();
  const [hasGeo, setHasGeo] = useState<boolean>(false);
  const [temp, setTemp] = useState<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setHasGeo(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHasGeo(true);
        const { latitude, longitude } = position.coords;
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`)
          .then((res) => res.json())
          .then((data) => {
            if (data && data.current_weather && typeof data.current_weather.temperature === "number") {
              setTemp(data.current_weather.temperature);
            }
          })
          .catch(() => {
            // On fetch error, still mark hasGeo true but temp remains null
          });
      },
      () => {
        setHasGeo(false);
      }
    );
  }, []);

  async function handleLogout() {
    try {
      await signOut(auth);
    } finally {
      router.replace("/auth/login");
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          title="Início"
        >
          ← início
        </Link>
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>

      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-300 dark:border-gray-600 text-sm font-semibold">
        {hasGeo ? (temp !== null ? `${temp}°` : "") : "🙂"}
      </div>

      <button
        onClick={handleLogout}
        className="rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2"
      >
        Sair
      </button>
    </div>
  );
}