FROM node:12-slim
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN yarn --frozen-lockfile --production
RUN yarn cache clean --force
ENV NODE_ENV="production"
COPY . .
CMD [ "yarn", "start" ]
