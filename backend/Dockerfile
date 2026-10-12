FROM eclipse-temurin:17-jdk-jammy AS build
WORKDIR /build
COPY pom.xml mvnw ./
COPY .mvn ./.mvn
COPY src ./src
RUN chmod +x mvnw && ./mvnw -B -Dmaven.test.skip=true package

FROM eclipse-temurin:17-jre-jammy
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 salu \
    && useradd --uid 1000 --gid salu --no-create-home salu \
    && mkdir -p /app /var/lib/salu/photos \
    && chown salu:salu /app /var/lib/salu/photos
WORKDIR /app
COPY --from=build /build/target/salu-backend-0.1.0-SNAPSHOT.jar ./app.jar
USER 1000:1000
EXPOSE 8081
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD curl --fail --silent --max-time 4 http://127.0.0.1:8081/api/health > /dev/null || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
