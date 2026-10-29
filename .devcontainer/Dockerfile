FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

ADD install-docode.sh /root/
RUN /root/install-docode.sh

RUN git config --system codespaces-theme.hide-status 1

USER node
RUN npm install -g node-gyp
RUN NPM_CACHE="$(npm config get cache)" && rm -rf "$NPM_CACHE" && ln -s /docode-dev/npm-cache "$NPM_CACHE"
RUN echo 'export DISPLAY="${DISPLAY:-:1}"' | tee -a ~/.bashrc >> ~/.zshrc

USER root
CMD chown node:node /docode-dev && sudo -u node mkdir -p /docode-dev/npm-cache && sleep inf
