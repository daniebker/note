package io.github.daniebker.note;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.IOException;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

/** The native side of src/native.ts. */
@CapacitorPlugin(name = "NoteNative")
public class NotePlugin extends Plugin {

    private final DavHttp http = new DavHttp();
    private SecureStore store;
    private LocalFolder local;

    @Override
    public void load() {
        store = new SecureStore(getContext());
        // App-specific storage on the shared volume, which needs no permission
        // and can be reached over USB, under Android/data. Falls back to
        // internal storage when the shared volume isn't available.
        File base = getContext().getExternalFilesDir(null);
        if (base == null) base = getContext().getFilesDir();
        local = new LocalFolder(new File(base, "notes"));
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

    private static JSObject entry(LocalFolder.Entry entry) {
        JSObject data = new JSObject();
        data.put("name", entry.name);
        data.put("modified", entry.modified);
        data.put("size", entry.size);
        return data;
    }

    @PluginMethod
    public void localPath(PluginCall call) {
        JSObject data = new JSObject();
        data.put("path", local.path());
        call.resolve(data);
    }

    @PluginMethod
    public void localPrepare(PluginCall call) {
        try {
            local.prepare();
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void localList(PluginCall call) {
        List<LocalFolder.Entry> entries = local.list();
        if (entries == null) {
            call.reject("The notes folder was not found", "NOT_FOUND");
            return;
        }
        JSArray files = new JSArray();
        for (LocalFolder.Entry entry : entries) files.put(entry(entry));
        JSObject data = new JSObject();
        data.put("files", files);
        call.resolve(data);
    }

    @PluginMethod
    public void localStat(PluginCall call) {
        try {
            LocalFolder.Entry entry = local.stat(call.getString("name"));
            JSObject data = new JSObject();
            if (entry != null) data.put("file", entry(entry));
            call.resolve(data);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void localRead(PluginCall call) {
        try {
            String value = local.read(call.getString("name"));
            JSObject data = new JSObject();
            if (value != null) data.put("value", value);
            call.resolve(data);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void localWrite(PluginCall call) {
        String value = call.getString("value");
        if (value == null) {
            call.reject("value is required");
            return;
        }
        try {
            local.write(call.getString("name"), value);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void localRemove(PluginCall call) {
        try {
            local.remove(call.getString("name"));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }
}
