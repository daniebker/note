package io.github.daniebker.note;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

/** The native side of src/native.ts. */
@CapacitorPlugin(name = "NoteNative")
public class NotePlugin extends Plugin {

    private final DavHttp http = new DavHttp();
    private SecureStore store;

    @Override
    public void load() {
        store = new SecureStore(getContext());
    }

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        String method = call.getString("method");
        if (url == null || method == null) {
            call.reject("url and method are required");
            return;
        }
        Map<String, String> headers = new LinkedHashMap<>();
        JSObject requested = call.getObject("headers", new JSObject());
        for (Iterator<String> names = requested.keys(); names.hasNext(); ) {
            String name = names.next();
            headers.put(name, requested.getString(name));
        }

        Call request;
        try {
            request = http.newCall(url, method, headers, call.getString("body"));
        } catch (IllegalArgumentException e) {
            call.reject(e.getMessage());
            return;
        }
        // Asynchronous, so requests don't queue behind each other.
        request.enqueue(
            new Callback() {
                @Override
                public void onFailure(Call failed, IOException e) {
                    call.reject("Couldn't reach the server: " + e.getMessage());
                }

                @Override
                public void onResponse(Call completed, Response response) {
                    try {
                        DavHttp.Result result = DavHttp.read(response);
                        JSObject responseHeaders = new JSObject();
                        for (Map.Entry<String, String> header : result.headers.entrySet()) {
                            responseHeaders.put(header.getKey(), header.getValue());
                        }
                        JSObject data = new JSObject();
                        data.put("status", result.status);
                        data.put("headers", responseHeaders);
                        data.put("body", result.body);
                        call.resolve(data);
                    } catch (IOException e) {
                        call.reject("Couldn't read the server's response: " + e.getMessage());
                    }
                }
            }
        );
    }

    @PluginMethod
    public void loadSettings(PluginCall call) {
        try {
            JSObject data = new JSObject();
            String value = store.load();
            if (value != null) data.put("value", value);
            call.resolve(data);
        } catch (Exception e) {
            call.reject("Couldn't read the saved settings", e);
        }
    }

    @PluginMethod
    public void saveSettings(PluginCall call) {
        String value = call.getString("value");
        if (value == null) {
            call.reject("value is required");
            return;
        }
        try {
            store.save(value);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't save the settings", e);
        }
    }

    @PluginMethod
    public void clearSettings(PluginCall call) {
        store.clear();
        call.resolve();
    }
}
