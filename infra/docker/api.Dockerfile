FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /workspace

COPY api-java/pom.xml api-java/pom.xml
COPY infra/db/migrations infra/db/migrations
COPY proto proto
RUN mvn -B -f api-java/pom.xml -DskipTests dependency:go-offline

COPY api-java api-java
RUN mvn -B -f api-java/pom.xml -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 --home-dir /app illamhelp
RUN rm -f /usr/bin/pebble
COPY --from=build /workspace/api-java/target/api-0.1.0.jar /app/api.jar
USER 10001
EXPOSE 4000 9090
ENTRYPOINT ["java", "-jar", "/app/api.jar"]
