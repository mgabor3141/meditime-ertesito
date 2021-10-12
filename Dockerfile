FROM node:16-alpine

COPY package.json yarn.lock ./
RUN yarn install

COPY scheduler-crontab.txt ./
RUN crontab /scheduler-crontab.txt

COPY . .
RUN yarn build

ENTRYPOINT ["crond", "-f"]
