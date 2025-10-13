// src/lib/uploadImage.ts
// Helper de upload para Firebase Storage (CLIENTE)

"use client";

import { storage } from "@/lib/firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * Regras:
 * - Aceita JPEG/PNG/WEBP até 10MB.
 * - Salva em: sellers/{uid}/products/{timestamp}-{nome-seguro}
 * - Gera URL pública via getDownloadURL.
 */
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Validação de tipo e tamanho de arquivo */
function ensureAllowed(file: File) {
  if (!file) throw new Error("Nenhum arquivo selecionado.");
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Formato inválido. Use JPG, PNG ou WEBP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Arquivo excede 10MB.");
  }
}

/** Normaliza o nome do arquivo */
function safeName(filename: string) {
  return (filename || "image")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

/**
 * Função interna que faz o upload real.
 * Retorna tanto a URL quanto o caminho no Storage.
 */
async function doUpload(
  file: File,
  uid: string
): Promise<{ url: string; path: string }> {
  if (!uid) throw new Error("UID do usuário ausente.");
  ensureAllowed(file);

  const ts = Date.now();
  const path = `sellers/${uid}/products/${ts}-${safeName(file.name)}`;
  const ref = storageRef(storage, path);

  // Upload com metadados (cache e contentType)
  await uploadBytes(ref, file, {
    contentType: file.type || "image/jpeg",
    cacheControl: "public,max-age=31536000,immutable",
  });

  const url = await getDownloadURL(ref);
  return { url, path };
}

/**
 * Compatível com o código antigo: retorna apenas a URL pública.
 */
export async function uploadProductImage(
  file: File,
  uid: string
): Promise<string> {
  const { url } = await doUpload(file, uid);
  return url;
}

/**
 * Nova versão: retorna também o caminho do arquivo no Storage,
 * útil para exclusões futuras (imageStoragePaths).
 */
export async function uploadProductImageWithPath(
  file: File,
  uid: string
): Promise<{ url: string; path: string }> {
  return doUpload(file, uid);
}

export default uploadProductImage;