package io.github.daniebker.note;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.util.List;
import org.junit.Test;

public class LocalFolderTest {

    @Test
    public void writesReadsAndRemovesFiles() throws Exception {
        File root = Files.createTempDirectory("note-local").toFile();
        LocalFolder folder = new LocalFolder(new File(root, "notes"));

        assertNull(folder.list());
        folder.prepare();
        assertTrue(folder.list().isEmpty());

        folder.write("a.md", "ünï 🎉");
        folder.write("a.md", "edited ünï 🎉");
        assertEquals("edited ünï 🎉", folder.read("a.md"));

        List<LocalFolder.Entry> entries = folder.list();
        assertEquals(1, entries.size());
        assertEquals("a.md", entries.get(0).name);
        assertEquals("edited ünï 🎉".getBytes("UTF-8").length, folder.stat("a.md").size);

        folder.remove("a.md");
        folder.remove("a.md");
        assertNull(folder.read("a.md"));
        assertNull(folder.stat("a.md"));
        assertTrue(folder.list().isEmpty());
    }

    @Test
    public void rejectsNamesThatLeaveTheFolder() throws Exception {
        File root = Files.createTempDirectory("note-local").toFile();
        LocalFolder folder = new LocalFolder(root);
        assertThrows(IllegalArgumentException.class, () -> folder.read("../x.md"));
        assertThrows(IllegalArgumentException.class, () -> folder.write("a/b.md", "x"));
        assertThrows(IllegalArgumentException.class, () -> folder.remove(".."));
    }
}
