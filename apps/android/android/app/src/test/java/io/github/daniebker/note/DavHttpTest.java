package io.github.daniebker.note;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import okhttp3.Credentials;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/** Runs against a real WebDAV server; needs `rclone` on the PATH. */
public class DavHttpTest {

    private static final int PORT = 18091;
    private static Process server;
    private final DavHttp http = new DavHttp();

    @BeforeClass
    public static void startServer() throws Exception {
        Path root = Files.createTempDirectory("note-dav");
        server = new ProcessBuilder(
            "rclone", "serve", "webdav", root.toString(),
            "--addr", "127.0.0.1:" + PORT, "--user", "u", "--pass", "p"
        )
            .redirectErrorStream(true)
            .redirectOutput(root.resolveSibling(root.getFileName() + ".log").toFile())
            .start();
        for (int attempt = 0; attempt < 50; attempt++) {
            try (Socket socket = new Socket("127.0.0.1", PORT)) {
                return;
            } catch (java.io.IOException e) {
                Thread.sleep(100);
            }
        }
    }

    @AfterClass
    public static void stopServer() {
        server.destroy();
    }

    private DavHttp.Result send(String method, String path, String body, String password) throws Exception {
        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", Credentials.basic("u", password));
        if (method.equals("PROPFIND")) headers.put("Depth", "1");
        String url = "http://127.0.0.1:" + PORT + path;
        return DavHttp.read(http.newCall(url, method, headers, body).execute());
    }

    @Test
    public void supportsTheWebDavMethods() throws Exception {
        assertEquals(401, send("PROPFIND", "/", null, "wrong").status);
        assertEquals(201, send("MKCOL", "/notes", null, "p").status);
        String content = "ünï 🎉\n";
        assertEquals(201, send("PUT", "/notes/a%20b.md", content, "p").status);
        assertEquals(content, send("GET", "/notes/a%20b.md", null, "p").body);
        DavHttp.Result listing = send("PROPFIND", "/notes", null, "p");
        assertEquals(207, listing.status);
        assertTrue(listing.body.contains("a%20b.md"));
        assertTrue(listing.headers.get("content-type").contains("xml"));
        assertEquals(201, send("PUT", "/notes/empty.md", null, "p").status);
        assertEquals(204, send("DELETE", "/notes/a%20b.md", null, "p").status);
        assertEquals(404, send("GET", "/notes/a%20b.md", null, "p").status);
    }
}
