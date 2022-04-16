FROM balena/%%ARCH%%-balena-multibuild-scripts
COPY secrets.json /usr/src/
RUN ["/bin/bash", "/usr/src/populate.sh"]
