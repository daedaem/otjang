package otjang.api;

/** HTTP 상태와 한 줄 메시지를 가진 예외. 핸들러가 ProblemDetail 로 바꾼다. */
public class ApiException extends RuntimeException {
    private final int status;
    private final String code;
    private final String path;

    public ApiException(int status, String message) {
        this(status, message, null, null);
    }

    public ApiException(int status, String message, String code, String path) {
        super(message);
        this.status = status;
        this.code = code;
        this.path = path;
    }

    public int status() {
        return status;
    }
    public String code() { return code; }
    public String path() { return path; }
}
