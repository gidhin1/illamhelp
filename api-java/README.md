# IllamHelp Spring Boot API

Spring Boot + Maven backend for IllamHelp.

## Local Commands

```bash
mvn test
mvn package
mvn spring-boot:run
```

From the repo root, the Makefile now routes these through:

```bash
make api-dev
make api-build
make api-start
```

## Persistence Notes

- Spring Boot runs Flyway migrations embedded from `../infra/db/migrations` at application startup.
- Hibernate is configured with `ddl-auto=validate`; it validates the Flyway-managed schema rather than mutating it.
- Migration files are forward-only once deployed. Add a new `V####__description.sql` file for schema changes.
- Spring Data JPA repositories own database access, with native repository queries where PostgreSQL-specific behavior is needed.
