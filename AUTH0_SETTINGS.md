# Auth0 Application Settings

## Application Authentication

### Authentication Method
- **Method**: None
  - No additional authentication methods configured at the application level

### Grant Types

The following OAuth 2.0 grant types are configured for this application:

| Grant Type | Status | Description |
|------------|--------|-------------|
| **Implicit** | ✅ Enabled | Allows clients to obtain access tokens directly without backend server |
| **Authorization Code** | ✅ Enabled | Standard OAuth 2.0 flow for web applications |
| **Refresh Token** | ✅ Enabled | Allows clients to obtain new access tokens using refresh tokens |
| **Client Credentials** | ❌ Disabled | Machine-to-machine authentication |
| **Password** | ✅ Enabled | Resource Owner Password Credentials Grant |
| **MFA** | ✅ Enabled | Multi-Factor Authentication support |
| **Client Initiated Backchannel Authentication (CIBA)** | ❌ Disabled | Decoupled authentication flow |

## Configuration Notes

- **Implicit Grant**: Enabled for legacy client support and direct token access
- **Authorization Code**: Primary flow for secure web applications
- **Refresh Token**: Enabled to allow long-lived sessions without re-authentication
- **Client Credentials**: Disabled - use Machine-to-Machine application for API access instead
- **Password Grant**: Enabled for direct username/password authentication
- **MFA**: Enabled for enhanced security through multi-factor authentication
- **CIBA**: Disabled - not currently required for the application workflow

## Security Considerations

- **Implicit Grant**: Consider deprecating in favor of Authorization Code + PKCE for better security
- **Password Grant**: Ensure strong password policies are enforced
- **MFA**: Recommended for all production users to enhance account security
- **Refresh Tokens**: Configure appropriate expiration and rotation policies

## Related Documentation

- [Auth0 Integration Guide](./docs/AUTH0_INTEGRATION.md)
- [Resilient Authentication Setup](./AUTH0_RESILIENT_SETUP.md)
- [API Authentication Guide](./API_AUTHENTICATION_GUIDE.md)

