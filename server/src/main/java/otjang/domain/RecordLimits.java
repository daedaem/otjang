package otjang.domain;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/** Shared, packaged contract: creation limits must never be used to slice existing records. */
public final class RecordLimits {
    private RecordLimits() {}
    private static final String CONTRACT = contract();
    public static final int CREATE_LIMIT = positive("createLimit");
    public static final int READ_CEILING = positive("readCeiling");
    static {
        if (positive("version") != 1 || CREATE_LIMIT > READ_CEILING)
            throw new IllegalStateException("Unsupported record-limits contract");
    }
    private static String contract() {
        try (var input = RecordLimits.class.getResourceAsStream("/contracts/record-limits.json")) {
            if (input == null) throw new IllegalStateException("Missing record-limits contract resource");
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException failure) { throw new IllegalStateException("Cannot read record-limits contract", failure); }
    }
    // This is a build-owned small numeric contract, not a parser for request JSON.
    private static int positive(String key) {
        var match = Pattern.compile("\"" + key + "\"\\s*:\\s*([0-9]+)(?=\\s*[,}])").matcher(CONTRACT);
        if (!match.find()) throw new IllegalStateException("Missing record limit: " + key);
        int value = Integer.parseInt(match.group(1));
        if (value < 1 || match.find()) throw new IllegalStateException("Invalid record limit: " + key);
        return value;
    }
    public static void requireReadable(int count, String path) {
        if (count > READ_CEILING) throw new TooManyRecords(path);
    }
    public static final class TooManyRecords extends IllegalArgumentException {
        private final String path;
        public TooManyRecords(String path) { super("Record list exceeds read ceiling " + READ_CEILING + ": " + path); this.path = path; }
        public String path() { return path; }
    }
}
