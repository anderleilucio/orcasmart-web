"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function UserBar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // escuta mudanças de auth (login/logout)
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  async function handleLogout() {
    await signOut(auth);
    router.push("/auth/login");
  }

  return (
    <div className="w-full flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
      <div className="text-sm text-gray-600 dark:text-gray-300">
        {user ? (
          <>
            Logado como <span className="font-medium">{user.email}</span>
          </>
        ) : (
          "Não autenticado"
        )}
      </div>

      <button
        onClick={handleLogout}
        className="rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-3 py-1.5 text-sm hover:opacity-90"
      >
        Sair
      </button>
    </div>
  );
}