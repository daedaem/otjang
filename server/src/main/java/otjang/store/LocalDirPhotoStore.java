package otjang.store;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import otjang.domain.Sanitize;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 사진을 비공개 로컬 폴더(otjang.photo-dir)에 내용 해시 이름으로 둔다. 같은 사진은 한 번만 저장된다. */
@Component
public class LocalDirPhotoStore implements PhotoStore {
    private static final Pattern DATA_URL = Pattern.compile("^data:image/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$");
    private final Path dir;

    public LocalDirPhotoStore(@Value("${otjang.photo-dir:./data/photos}") String dir) {
        this.dir = Path.of(dir);
    }

    @Override
    public String put(String dataUrl) {
        if (Sanitize.safeImg(dataUrl).isEmpty()) return "";
        Matcher m = DATA_URL.matcher(dataUrl);
        if (!m.matches()) return "";
        String ext = m.group(1);
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(m.group(2)); } catch (IllegalArgumentException e) { return ""; }
        String ref = sha256(bytes) + "." + ext;
        try {
            Files.createDirectories(dir);
            Path file = dir.resolve(ref);
            if (!Files.exists(file)) Files.write(file, bytes);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return ref;
    }

    @Override
    public String get(String ref) {
        if (ref == null || ref.isEmpty() || !ref.matches("^[0-9a-f]{64}\\.(webp|png|jpeg)$")) return "";
        Path file = dir.resolve(ref);
        if (!Files.exists(file)) return "";
        try {
            String ext = ref.substring(ref.lastIndexOf('.') + 1);
            return "data:image/" + ext + ";base64," + Base64.getEncoder().encodeToString(Files.readAllBytes(file));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static String sha256(String s) {
        return sha256(s.getBytes(StandardCharsets.UTF_8));
    }
}
