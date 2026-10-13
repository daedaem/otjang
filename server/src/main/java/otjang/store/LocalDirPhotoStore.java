package otjang.store;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import otjang.domain.Sanitize;

import java.io.IOException;
import java.io.ByteArrayInputStream;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import otjang.api.ApiException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermissions;
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
    private final PhotoLifecycle lifecycle;

    public LocalDirPhotoStore(@Value("${otjang.photo-dir:./data/photos}") String dir, PhotoLifecycle lifecycle) {
        this.dir = Path.of(dir); this.lifecycle = lifecycle;
    }

    @Override
    public String put(String dataUrl) {
        if (Sanitize.safeImg(dataUrl).isEmpty()) return "";
        Matcher m = DATA_URL.matcher(dataUrl);
        if (!m.matches()) return "";
        String ext = m.group(1);
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(m.group(2)); } catch (IllegalArgumentException e) { return ""; }
        validate(bytes, ext);
        lifecycle.lock();
        String ref = sha256(bytes) + "." + ext;
        lifecycle.ensureQuota(ref, bytes.length);
        try {
            Files.createDirectories(dir);
            if (Files.getFileStore(dir).supportsFileAttributeView("posix")) Files.setPosixFilePermissions(dir, PosixFilePermissions.fromString("rwx------"));
            Path file = dir.resolve(ref);
            if (!Files.exists(file)) {
                Path temporary=Files.createTempFile(dir,".upload-",".tmp");
                try {
                    Files.write(temporary,bytes);
                    if (Files.getFileStore(dir).supportsFileAttributeView("posix")) Files.setPosixFilePermissions(temporary,PosixFilePermissions.fromString("rw-------"));
                    Files.move(temporary,file,StandardCopyOption.ATOMIC_MOVE);
                    lifecycle.onRollback(ref);
                } finally { Files.deleteIfExists(temporary); }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return ref;
    }

    private static void validate(byte[] bytes, String mime) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) throw new ApiException(400, "읽을 수 없는 사진입니다");
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                int w=reader.getWidth(0), h=reader.getHeight(0);
                String actual=reader.getFormatName().toLowerCase(java.util.Locale.ROOT);
                if (actual.equals("jpg")) actual="jpeg";
                if (!actual.equals(mime) || w<1 || h<1 || w>4096 || h>4096 || (long)w*h>4_000_000) throw new ApiException(400,"사진 형식 또는 크기가 맞지 않습니다");
                if (reader.read(0)==null) throw new ApiException(400,"사진을 읽지 못했습니다");
            } finally { reader.dispose(); }
        } catch (IOException | IllegalArgumentException e) { throw new ApiException(400,"사진이 손상됐거나 읽을 수 없습니다"); }
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
