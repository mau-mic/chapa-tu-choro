# Supabase public CA

`supabase-ca.crt` is the public Supabase Root 2021 CA downloaded from the
project's Supabase portal during the November 14–15, 2026 setup. It contains
no private key or credentials.

- Subject/issuer: `Supabase Root 2021 CA`, Supabase Inc.
- Validity: April 28, 2021 through April 26, 2031.
- SHA-256 certificate fingerprint:
  `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

Both Lambda packaging scripts include this file as `certs/supabase-ca.crt`,
available at `/var/task/certs/supabase-ca.crt` after extraction. Configure
Npgsql `Root Certificate` or libpq `sslrootcert` to that path and retain
`VerifyFull` / `verify-full`. Packaging does not change connection secrets.

When the project's CA changes, obtain the replacement from the Supabase
portal, review its identity, validity and fingerprint, update this record,
and rebuild both ZIPs. Do not replace it with an unverified certificate or
disable certificate verification. The Docker workstation mount is separate;
see [Supabase setup](../docs/supabase-setup.md).
