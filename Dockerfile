FROM node:16

COPY package.json yarn.lock ./
RUN yarn install

COPY . .

RUN yarn build

CMD [ "yarn", "start" ]
