// Binary data crosses the native bridge as base64 strings.

// Small enough to pass as function arguments.
const CHUNK = 0x8000;

export function toBase64(data: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < data.length; start += CHUNK) {
    binary += String.fromCharCode(...data.subarray(start, start + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
  return data;
}
