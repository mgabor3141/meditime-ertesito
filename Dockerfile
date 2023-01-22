# Dockerfile from https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md
FROM node:lts-alpine

RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /root

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN yarn install --immutable

COPY . ./
RUN yarn build
RUN crontab scheduler-crontab.txt

ENTRYPOINT ["crond", "-f"]
