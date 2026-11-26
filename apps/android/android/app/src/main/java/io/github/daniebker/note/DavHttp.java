package io.github.daniebker.note;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okhttp3.internal.http.HttpMethod;

/**
 * HTTP with arbitrary methods, which WebDAV needs (PROPFIND, MKCOL) and
 * Android's HttpURLConnection rejects. Plain Java so it can be unit tested.
 */
final class DavHttp {

    static final class Result {

        final int status;
        final Map<String, String> headers;
        final String body;

        Result(int status, Map<String, String> headers, String body) {
            this.status = status;
            this.headers = headers;
            this.body = body;
        }
    }

    private final OkHttpClient client = new OkHttpClient.Builder()
        .callTimeout(60, TimeUnit.SECONDS)
        // Never follow a redirect from https to http.
        .followSslRedirects(false)
        .build();

    Call newCall(String url, String method, Map<String, String> headers, String body) {
        Request.Builder request = new Request.Builder().url(url);
        String contentType = null;
        for (Map.Entry<String, String> header : headers.entrySet()) {
            request.header(header.getKey(), header.getValue());
            if (header.getKey().equalsIgnoreCase("content-type")) {
                contentType = header.getValue();
            }
        }
        RequestBody requestBody = null;
        if (body != null || HttpMethod.requiresRequestBody(method)) {
            byte[] bytes = (body == null ? "" : body).getBytes(java.nio.charset.StandardCharsets.UTF_8);
            MediaType type = contentType == null ? null : MediaType.parse(contentType);
            requestBody = RequestBody.create(bytes, type);
        }
        return client.newCall(request.method(method, requestBody).build());
    }

    /** Reads and closes the response. */
    static Result read(Response response) throws IOException {
        try (Response closing = response) {
            Map<String, String> headers = new LinkedHashMap<>();
            for (Map.Entry<String, List<String>> header : closing.headers().toMultimap().entrySet()) {
                headers.put(header.getKey().toLowerCase(Locale.ROOT), String.join(", ", header.getValue()));
            }
            ResponseBody body = closing.body();
            return new Result(closing.code(), headers, body == null ? "" : body.string());
        }
    }
}
