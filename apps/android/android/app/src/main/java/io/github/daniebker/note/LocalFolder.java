package io.github.daniebker.note;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** A flat folder of note files on this device. */
final class LocalFolder {

    static final class Entry {
        final String name;
        final long modified;
        final long size;

        Entry(String name, long modified, long size) {
            this.name = name;
            this.modified = modified;
            this.size = size;
        }
    }

    private final File folder;

    LocalFolder(File folder) {
        this.folder = folder;
    }

    String path() {
        return folder.getAbsolutePath();
    }

    void prepare() throws IOException {
        if (!folder.isDirectory() && !folder.mkdirs()) {
            throw new IOException("Couldn't create " + folder);
        }
    }

    /** The folder of attached files inside this one. */
    LocalFolder attachments() {
        return new LocalFolder(new File(folder, "attachments"));
    }

    /** Creates this folder, but not any missing folder around it. */
    void create() throws IOException {
        if (!folder.mkdir() && !folder.isDirectory()) {
            throw new IOException("Couldn't create " + folder);
        }
    }

    /** Null if the folder doesn't exist. */
    List<Entry> list() {
        File[] files = folder.listFiles();
        if (files == null) return null;
        List<Entry> entries = new ArrayList<>();
        for (File file : files) {
            if (file.isFile()) {
                entries.add(new Entry(file.getName(), file.lastModified(), file.length()));
            }
        }
        return entries;
    }

    /** Null if the file doesn't exist. */
    Entry stat(String name) {
        File file = file(name);
        if (!file.isFile()) return null;
        return new Entry(name, file.lastModified(), file.length());
    }

    /** Null if the file doesn't exist. */
    String read(String name) throws IOException {
        byte[] contents = readBytes(name);
        return contents == null ? null : new String(contents, StandardCharsets.UTF_8);
    }

    /** Null if the file doesn't exist. */
    byte[] readBytes(String name) throws IOException {
        File file = file(name);
        if (!file.isFile()) return null;
        // java.nio.file needs Android 8.
        ByteArrayOutputStream contents = new ByteArrayOutputStream();
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            for (int read; (read = in.read(buffer)) != -1; ) contents.write(buffer, 0, read);
        }
        return contents.toByteArray();
    }

    void write(String name, String contents) throws IOException {
        write(name, contents.getBytes(StandardCharsets.UTF_8));
    }

    /** Written to a hidden file and moved into place, so it's never left half written. */
    void write(String name, byte[] contents) throws IOException {
        if (!folder.isDirectory()) throw new IOException("The notes folder was not found");
        File target = file(name);
        File temporary = new File(folder, "." + name + "." + UUID.randomUUID() + ".tmp");
        try {
            try (FileOutputStream out = new FileOutputStream(temporary)) {
                out.write(contents);
                out.getFD().sync();
            }
            if (!temporary.renameTo(target)) throw new IOException("Couldn't save " + name);
        } finally {
            if (temporary.exists()) temporary.delete();
        }
    }

    /** Removing a file that is already gone is not an error. */
    void remove(String name) throws IOException {
        File file = file(name);
        if (file.exists() && !file.delete()) throw new IOException("Couldn't delete " + name);
    }

    // Names come from the WebView, so anything that could leave the folder is rejected.
    File file(String name) {
        if (name == null || name.isEmpty() || name.equals(".") || name.equals("..")
                || name.contains("/") || name.contains("\\") || name.contains("\0")) {
            throw new IllegalArgumentException("Invalid file name");
        }
        return new File(folder, name);
    }
}
