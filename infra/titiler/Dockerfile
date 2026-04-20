ARG TITILER_IMAGE=ghcr.io/developmentseed/titiler:latest
FROM ${TITILER_IMAGE}

ENV PORT=8080
ENV HOST=0.0.0.0
ENV MOSAIC_ENDPOINT_ENABLED=FALSE

EXPOSE 8080

CMD ["uvicorn", "titiler.application.main:app", "--host", "0.0.0.0", "--port", "8080"]
