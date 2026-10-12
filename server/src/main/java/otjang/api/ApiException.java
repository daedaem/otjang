package otjang.api;

/** HTTP 상태와 한 줄 메시지를 가진 예외. 핸들러가 ProblemDetail 로 바꾼다. */
public class ApiException extends RuntimeException {
    private final int status;

    public ApiException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int status() {
        return status;
    }
}
