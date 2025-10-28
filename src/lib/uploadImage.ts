// src/lib/uploadImage.ts
"use client";

import { storage } from "@/lib/firebase";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

/**
 * Sobe a imagem via SDK no caminho:
 * sellers/<uid>/products/<timestamp>-<filename>
 * e retorna a URL pública (getDownloadURL).
 */
export async function uploadProductImage(file: File, sellerUid: string): Promise<string> {
  if (!storage) throw new Error("Firebase Storage não inicializado no client.");
  if (!file) throw new Error("Arquivo inválido.");
  if (!sellerUid) throw new Error("UID do vendedor ausente.");

  const safeName = file.name
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-]/g, "")
    .toLowerCase();

  const objectPath = `sellers/${sellerUid}/products/${Date.now()}-${safeName}`;
  const objectRef = ref(storage, objectPath);

  const task = uploadBytesResumable(objectRef, file, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "public,max-age=31536000,immutable",
  });

  await new Promise<void>((resolve, reject) => {
    task.on("state_changed", undefined, reject, () => resolve());
  });

  return await getDownloadURL(objectRef);
}