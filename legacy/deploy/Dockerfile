# 어울 server image: the built single-file app plus the Node server.
# Build from the repository root:  docker build -f legacy/deploy/Dockerfile -t eoul .
# The same image runs on a home PC (behind Cloudflare Tunnel) and on a cloud VM.

# Exact versions checked on 2026-10-15; update them deliberately.
ARG NODE_IMAGE=node:22.23.3-bookworm-slim

FROM ${NODE_IMAGE} AS app
WORKDIR /src
# The app build uses only Node built-ins; its npm packages are test-only.
COPY legacy/app ./legacy/app
COPY app/lite/src/domain ./app/lite/src/domain
COPY app/lite/public/icons ./app/lite/public/icons
RUN node legacy/app/tools/build.mjs

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    EOUL_HOST=0.0.0.0 \
    EOUL_PORT=8787 \
    EOUL_DATA_DIR=/data
WORKDIR /srv/eoul
# Server dependencies. The ONNX runtime for server-side background removal is
# optional and large; build with --build-arg WITH_PHOTO_MASK=true to include it.
ARG WITH_PHOTO_MASK=false
COPY legacy/server/package.json legacy/server/package-lock.json legacy/server/.npmrc ./legacy/server/
RUN cd legacy/server && if [ "$WITH_PHOTO_MASK" = "true" ]; then npm ci; else npm ci --omit=optional; fi && npm cache clean --force
COPY legacy/server ./legacy/server
# The server checks wardrobes with the app's own modules (../../app/src).
COPY legacy/app/src ./legacy/app/src
COPY app/lite/src/domain ./app/lite/src/domain
COPY --from=app /src/legacy/app/dist ./legacy/app/dist
# /data holds the SQLite database. A new named volume copies this owner.
RUN mkdir -p /data /srv/eoul/legacy/server/models && chown -R node:node /data /srv/eoul/legacy/server/models
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.EOUL_PORT || 8787) + '/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "legacy/server/index.mjs"]
