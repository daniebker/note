import type { HttpRequest, HttpResponse } from "./native";

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
    if (body !== undefined && typeof body !== "string") {
      throw new Error("Only text request bodies are supported");
    }
    const response = await send({ url, method, headers, body });
    // These statuses may not be constructed with a body, even an empty one.
    const empty = [204, 205, 304].includes(response.status);
    return new Response(empty ? null : response.body, {
      status: response.status,
      headers: response.headers,
    });
  };
}
