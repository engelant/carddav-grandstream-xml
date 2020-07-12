FROM node:12

WORKDIR /usr/scr/carddav-phonebook-server

COPY . .

RUN npm ci --only=production
RUN ln -s /data/settings.json ./

EXPOSE 80
CMD ./start.sh