import type { HttpRequest, HttpResponse } from "./native";
import { fromBase64, toBase64 } from "./base64.ts";

function bytes(body: unknown): Uint8Array {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  throw new Error("Unsupported request body");
}

// The WebView's own fetch is subject to CORS, which WebDAV servers generally
// don't allow, so requests are made natively. This covers the parts of fetch
// that the WebDAV client uses.
export function createNativeFetch(
  send: (request: HttpRequest) => Promise<HttpResponse>,
) {
  return async (...args: unknown[]): Promise<Response> => {
    const [url, init = {}] = args as [
      string,
      {
        method?: string;
        headers?: Record<string, string>;
        body?: unknown;
      }?,
    ];
    const { method = "GET", headers = {}, body } = init;
    const response = await send({
      url,
      method,
      headers,
      body: body === undefined ? undefined : toBase64(bytes(body)),
    });
    // These statuses may not be constructed with a body, even an empty one.
    const empty = [204, 205, 304].includes(response.status);
    return new Response(empty ? null : fromBase64(response.body), {
      status: response.status,
      headers: response.headers,
    });
  };
}
