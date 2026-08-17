FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install --timeout 120 --retries 5 -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 10001 topchoice && chown -R topchoice:topchoice /app
USER topchoice

EXPOSE 8087

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8087/health/live || exit 1

# uvloop + httptools يأتيان مع uvicorn[standard] ويرفعان الإنتاجية بوضوح
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8087", \
     "--loop", "uvloop", "--http", "httptools", "--no-access-log"]
