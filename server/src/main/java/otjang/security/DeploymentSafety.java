package otjang.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** A development server must never silently expose plaintext customer login to the LAN. */
@Component
public class DeploymentSafety {
    public DeploymentSafety(@Value("${server.address:127.0.0.1}") String address,
                            @Value("${otjang.auth.require-https:false}") boolean requireHttps,
                            @Value("${server.ssl.enabled:false}") boolean tlsEnabled) {
        boolean loopback=address.equals("127.0.0.1")||address.equals("::1")||address.equals("localhost");
        if(!loopback&&(!requireHttps||!tlsEnabled))
            throw new IllegalArgumentException("Non-loopback binding requires TLS and HTTPS enforcement");
    }
}
