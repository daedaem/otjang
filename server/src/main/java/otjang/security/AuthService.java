package otjang.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import otjang.api.ApiException;
import otjang.persistence.OwnerEntity;
import otjang.persistence.OwnerRepository;
import otjang.store.LocalDirPhotoStore;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.Optional;

@Service
public class AuthService {
    private final JdbcTemplate jdbc;
    private final OwnerRepository owners;
    private final PasswordEncoder passwords;
    private final String invite;
    private final long sessionSeconds;
    private final SecureRandom random = new SecureRandom();
    private final String dummyHash;
    public AuthService(JdbcTemplate jdbc, OwnerRepository owners, PasswordEncoder passwords,
                       @Value("${otjang.auth.invite-code:}") String invite,
                       @Value("${otjang.auth.session-seconds:43200}") long sessionSeconds) {
        this.jdbc = jdbc; this.owners = owners; this.passwords = passwords; this.invite = invite;
        if (sessionSeconds < 60 || sessionSeconds > 604800) throw new IllegalArgumentException("session-seconds must be 60..604800");
        this.sessionSeconds = sessionSeconds;
        dummyHash = passwords.encode(Base64.getEncoder().encodeToString(random.generateSeed(24)));
    }
    public record Session(String token, Instant expiresAt, BetaUser user) {}
    static String username(String value) {
        String s = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (!s.matches("[a-z0-9][a-z0-9._-]{2,39}")) throw new ApiException(400, "아이디는 영문 소문자·숫자·점·밑줄·하이픈 3~40자입니다");
        return s;
    }
    private static void validPassword(String value) {
        if (value == null || value.length() < 12 || value.getBytes(StandardCharsets.UTF_8).length > 72)
            throw new ApiException(400, "비밀번호는 12자 이상, UTF-8 72바이트 이하로 입력해 주세요");
    }
    @Transactional
    public Session register(String name, String password, String code) {
        if (invite.isBlank() || code == null || !MessageDigest.isEqual(invite.getBytes(StandardCharsets.UTF_8), code.getBytes(StandardCharsets.UTF_8)))
            throw new ApiException(403, "가입이 닫혀 있거나 초대 코드가 맞지 않습니다");
        String username = username(name); validPassword(password);
        if (jdbc.queryForObject("select count(*) from beta_account where username = ?", Integer.class, username) > 0)
            throw new ApiException(409, "이미 사용 중인 아이디입니다");
        OwnerEntity owner = new OwnerEntity(); owner.setNickname(username); owners.saveAndFlush(owner);
        try { jdbc.update("insert into beta_account(username,password_hash,owner_id) values (?,?,?)", username, passwords.encode(password), owner.getId()); }
        catch (DuplicateKeyException e) { throw new ApiException(409, "이미 사용 중인 아이디입니다"); }
        return issue(new BetaUser(username, owner.getId()));
    }
    @Transactional
    public Session login(String name, String password) {
        String normalized = name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
        var accounts = jdbc.query("select username,password_hash,owner_id from beta_account where username = ?", (rs, n) -> new Account(rs.getString(1), rs.getString(2), rs.getLong(3)), normalized);
        String supplied = password == null ? "" : password;
        Account account = accounts.isEmpty() ? null : accounts.getFirst();
        boolean matches = supplied.getBytes(StandardCharsets.UTF_8).length <= 72 && passwords.matches(supplied, account == null ? dummyHash : account.hash());
        if (!matches || account == null) throw new ApiException(401, "아이디 또는 비밀번호가 맞지 않습니다");
        return issue(new BetaUser(account.username(), account.ownerId()));
    }
    private record Account(String username, String hash, long ownerId) {}
    private Session issue(BetaUser user) {
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant expiry = Instant.now().plusSeconds(sessionSeconds);
        jdbc.update("insert into beta_session(token_hash,owner_id,expires_at) values (?,?,?)", LocalDirPhotoStore.sha256(token), user.ownerId(), Timestamp.from(expiry));
        return new Session(token, expiry, user);
    }
    @Transactional(readOnly = true)
    public Optional<BetaUser> authenticate(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) return Optional.empty();
        var users = jdbc.query("select a.username,a.owner_id from beta_session s join beta_account a on a.owner_id=s.owner_id where s.token_hash=? and s.revoked_at is null and s.expires_at > ?", (rs, n) -> new BetaUser(rs.getString(1), rs.getLong(2)), LocalDirPhotoStore.sha256(token), Timestamp.from(Instant.now()));
        return users.stream().findFirst();
    }
    @Transactional
    public void logout(String token) { jdbc.update("update beta_session set revoked_at=? where token_hash=? and owner_id=?", Timestamp.from(Instant.now()), LocalDirPhotoStore.sha256(token), OwnerScope.ownerId()); }
    @Transactional(readOnly = true)
    public void requirePassword(String password) {
        String hash = jdbc.queryForObject("select password_hash from beta_account where owner_id=?", String.class, OwnerScope.ownerId());
        if (password == null || password.getBytes(StandardCharsets.UTF_8).length > 72 || !passwords.matches(password, hash)) throw new ApiException(401, "비밀번호가 맞지 않습니다");
    }
}
