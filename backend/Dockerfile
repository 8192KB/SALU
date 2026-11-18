# Amazon Corretto: 무료(GPLv2+CE)이고 긴급 보안 패치가 빠름. 2026-11 Java4Shell 때 Temurin보다 먼저 17.0.21.1 배포
FROM amazoncorretto:17-al2023-jdk AS build
WORKDIR /build
# Maven Wrapper가 Maven 압축을 풀 때 tar 필요. al2023 이미지에는 기본으로 없음
RUN dnf install -y tar gzip && dnf clean all
COPY pom.xml mvnw ./
COPY .mvn ./.mvn
COPY src ./src
RUN chmod +x mvnw && ./mvnw -B -Dmaven.test.skip=true package

# headless 이미지에는 curl(healthcheck)이 있고 useradd는 없어 UID/GID 숫자로 실행
FROM amazoncorretto:17-al2023-headless
# Java 17은 locale로 기본 문자 인코딩을 정함. 한국어 깨짐 방지
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
RUN mkdir -p /app /var/lib/salu/photos \
    && chown 1000:1000 /app /var/lib/salu/photos
WORKDIR /app
COPY --from=build /build/target/salu-backend-0.1.0-SNAPSHOT.jar ./app.jar
USER 1000:1000
EXPOSE 8081
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD curl --fail --silent --max-time 4 http://127.0.0.1:8081/api/health > /dev/null || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
