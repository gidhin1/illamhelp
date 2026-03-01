# Bruno Collection

Collection path:

- `bruno/illamhelp-api`

## Automated E2E Run (Recommended)

The collection is now scripted for full automation:

- CLI run executes the full `requests/` folder recursively.
- The run is filtered by `e2e` tag by default.
- Runtime IDs (`seekerUserId`, `providerUserId`, `connectionId`, `requestId`, `grantId`) are captured automatically.
- Assertions are embedded in each request using Bruno `tests`.

### Prerequisites

1. API is running.
2. Bruno CLI is installed:
   `make bruno-cli-install`

### Run

From project root:

```bash
make bruno-e2e
```

By default, the script generates random seeker/provider users and tokens each run.

If you want fixed users, provide credentials:

```bash
SEEKER_USERNAME='<seeker-username>' \
SEEKER_PASSWORD='<seeker-password>' \
PROVIDER_USERNAME='<provider-username>' \
PROVIDER_PASSWORD='<provider-password>' \
make bruno-e2e
```

Or:

```bash
make bruno-e2e
```

If you already have tokens, you can pass them directly:

```bash
SEEKER_ACCESS_TOKEN='<seeker-jwt>' \
PROVIDER_ACCESS_TOKEN='<provider-jwt>' \
BRUNO_PREFER_GENERATED_USERS=false make bruno-e2e
```

Optional overrides:

```bash
BRUNO_ENV=local BRUNO_TAGS=e2e make bruno-e2e
```

To print export commands for the generated tokens:

```bash
BRUNO_PRINT_EXPORTS=true make bruno-e2e
```

To only login and print token export commands (without running tests):

```bash
BRUNO_LOGIN_ONLY=true BRUNO_PRINT_EXPORTS=true make bruno-e2e
```

## Assertions Covered

The automated flow validates:

1. Health endpoint is reachable.
2. Seeker and provider tokens are valid (`/auth/me` subject checks).
3. Job creation succeeds.
4. Job application submit/list/accept succeeds.
5. Booking start and complete transitions succeed.
6. Connection request and accept succeed.
7. Connection list contains the created/accepted connection.
8. Consent access request is created and listed.
9. Consent grant is created and listed.
10. `can-view` is `true` before revoke.
11. Consent revoke succeeds.
12. `can-view` is `false` after revoke.
13. Media upload ticket creation succeeds.
14. Media list includes the newly created media record.

Note:
- The default E2E chain validates `upload-ticket` + `list`.
- `Media Complete Upload` is included as a manual request because it requires uploading bytes to the signed URL before completion.

## Manual Bruno App Run (Optional)

1. Open Bruno.
2. `Open Collection`.
3. Select `/Users/gidhin1/Documents/claude_proj/illamhelp/bruno/illamhelp-api`.
4. Choose environment `local`.
5. Set:
   - `seekerAccessToken`
   - `providerAccessToken`
6. Run request: `01-health`

The scripted chain will execute the remaining flow automatically.

## Register/Login APIs

New auth endpoints are available:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`

Bruno requests:

- `Auth Register`
- `Auth Login`

No usernames/passwords are stored in the collection files.  
Set login/registration values at runtime in your local environment only.

Required runtime vars for `Auth Register`:

- `registerUsername`
- `registerEmail`
- `registerPassword`
- `registerFirstName`
- `registerLastName` (optional)
- `registerPhone` (optional)

Required runtime vars for `Auth Login`:

- `loginUsername`
- `loginPassword`
