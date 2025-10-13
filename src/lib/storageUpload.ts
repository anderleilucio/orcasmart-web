// src/lib/storageUpload.ts
import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * Envia uma imagem para: products/{ownerId}/{timestamp}-{nome}
 * Retorna { path, downloadURL } para salvar no Firestore e exibir no app.
 */
export async function uploadProductImage(file: File, ownerId: string) {
  if (!file) throw new Error("Arquivo inválido");

  const safeName = file.name.replace(/\s+/g, "_").toLowerCase();
  const path = `products/${ownerId}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, {
    contentType: file.type || "image/png",
  });

  const downloadURL = await getDownloadURL(storageRef);
  return { path, downloadURL };
}