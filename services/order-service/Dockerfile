FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    mvn -B -q dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    mvn -B -q clean package -DskipTests && mv target/*.jar app.jar

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S topchoice && adduser -S topchoice -G topchoice && apk add --no-cache curl
COPY --from=build --chown=topchoice:topchoice /build/app.jar app.jar
USER topchoice
EXPOSE 8083
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseZGC -XX:+ZGenerational"
HEALTHCHECK --interval=15s --timeout=3s --start-period=45s --retries=5 \
  CMD curl -fsS http://localhost:8083/actuator/health/liveness || exit 1
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
